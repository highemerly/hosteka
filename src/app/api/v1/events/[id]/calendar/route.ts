import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { sanitizeDisplayName } from '@/lib/profile-text'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { eventIdParam } from '@/schemas/event'
import { NextResponse } from 'next/server'
import { getBaseUrl } from '@/lib/base-url'
import { eventDateTimeAt, jstDay } from '@/lib/event-datetime'
import { prisma } from '@/lib/prisma'
import { createEvent, EventAttributes } from 'ics'

type IcsDate = [number, number, number] | [number, number, number, number, number]

/** 瞬間を UTC の部品にする。`ics` へは `startInputType: 'utc'` と組で渡す */
function utcParts(at: Date): IcsDate {
  return [
    at.getUTCFullYear(),
    at.getUTCMonth() + 1,
    at.getUTCDate(),
    at.getUTCHours(),
    at.getUTCMinutes(),
  ]
}

/** `YYYY-MM-DD` を日付だけの配列にする。`days` を足せる（月末も繰り上がる） */
function dayParts(day: string, days = 0): IcsDate {
  const [y, m, d] = day.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d + days))
  return [at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate()]
}

/**
 * カレンダーに書く開始と終了。
 *
 * **日付列だけを読まない。** 開催日時は日付と時刻の2列で、組み立ては
 * `lib/event-datetime.ts` が持つ。以前はここが `startDate` をローカル getter で
 * 読んでいて、19:00 開始のイベントでも本番（UTC）では 09:00 JST 開始の
 * 予定として書き出していた。
 *
 * - 開始時刻が無ければ**終日の予定**。終了は RFC 5545 の決まりで「翌日」
 *   （終了日を含まない）
 * - 終了が無い、または開始より前に組み上がる（終了日だけで時刻が無い、など）
 *   なら開始と同じにする。長さをこちらで決めない
 */
function calendarTimes(event: {
  startDate: Date
  startTime: string | null
  hasStartTime: boolean
  endDate: Date | null
  endTime: string | null
  hasEndTime: boolean
}): { start: IcsDate; end: IcsDate; allDay: boolean } {
  if (!event.hasStartTime) {
    const firstDay = jstDay(event.startDate)
    const lastDay = event.endDate ? jstDay(event.endDate) : firstDay
    return {
      start: dayParts(firstDay),
      end: dayParts(lastDay < firstDay ? firstDay : lastDay, 1),
      allDay: true,
    }
  }

  const startAt = eventDateTimeAt(event.startDate, event.startTime, event.hasStartTime)
  const endAt = event.endDate
    ? eventDateTimeAt(event.endDate, event.endTime, event.hasEndTime)
    : startAt
  return {
    start: utcParts(startAt),
    end: utcParts(endAt < startAt ? startAt : endAt),
    allDay: false,
  }
}

export const GET = defineRoute({
  auth: 'optional',
  params: eventIdParam,
  handler: async ({ params, session }) => {
    const id = params.id

    // イベント情報を取得
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            displayName: true,
            username: true,
            server: true,
          },
        },
      },
    })

    if (!event) throw ApiError.notFound('イベントが見つかりません')
    await hideDisabledFromNonAdmins(event.isDisabled, session, 'イベントが見つかりません')

    // 非公開イベントは、ログインしている人だけが開ける（詳細の GET と同じ規則）
    if (!event.isPublic && !session) throw ApiError.unauthenticated()

    const { start, end, allDay } = calendarTimes(event)

    // イベント説明を作成
    let description = event.description || ''
    if (event.location) {
      description += `\n\n📍 場所: ${event.location}`
    }
    if (event.fee) {
      description += `\n💰 参加費: ${event.fee}`
    }
    if (event.maxParticipants) {
      description += `\n👥 定員: ${event.maxParticipants}名`
    }

    // ICSイベント属性を設定
    const eventAttributes: EventAttributes = {
      title: event.title,
      description: description.trim(),
      start,
      end,
      // 配列は UTC の部品で渡している。終日は日付だけなので時刻帯を持たない
      ...(allDay ? {} : { startInputType: 'utc', endInputType: 'utc' }),
      location: event.location || undefined,
      url: `${getBaseUrl()}/events/${event.id}`,
      organizer: {
        /*
          **ここでも整える。** `ics` は引数の値（`CN=`）の改行を逃がさないので、
          改行の入った表示名から行を書き足せる。ログインのたびに整えて保存して
          いるが、整える前に保存された名前が残っている（次のログインまで）。
        */
        name: sanitizeDisplayName(event.creator.displayName, event.creator.username),
        email: `${event.creator.username}@${event.creator.server}`
      },
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      productId: 'hosteka-calendar',
    }

    // ICSファイル生成
    const { error, value } = createEvent(eventAttributes)
    
    if (error) {
      console.error('ICS generation error:', error)
      // エラーの形はエンベロープに寄せる（{ error: { code, message, requestId } }）
      throw ApiError.internal('カレンダーファイルの生成に失敗しました')
    }

    // ICSファイルとして返す
    return new NextResponse(value, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(event.title)}.ics"`,
      },
    })
  },
})