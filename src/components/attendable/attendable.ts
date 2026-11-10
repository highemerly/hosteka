import type { EventListItemDto } from '@/server/serializers/event'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

/**
 * 一覧カードが見るもの。
 *
 * イベントと日程調整は**参加の形が違う**（1人1行の5状態 vs 日程ごとの
 * ○△×）ので、参加まわりは共有しない。だがカードが描くのは
 * 「いつ・どこで・誰が・締切はいつ」だけで、そこは同じ。
 * ここに正規化して、カードは Prisma のモデルも DTO も見ない。
 *
 * **`isPreEvent` のような真偽値をカードへ渡さない。** 呼び出し側から
 * 見えない分岐でイベントと日程調整のロードマップが結合する。
 * 違いは値の形（`schedule`）で表す。
 */
export type AttendableSchedule =
  | {
      kind: 'fixed'
      start: string
      end: string | null
      hasStartTime: boolean
      hasEndTime: boolean
    }
  | {
      kind: 'candidates'
      /** 表示順。カードは先頭と件数だけを使う */
      options: { id: string; startDate: string; endDate: string | null }[]
    }

export type AttendableAvatar = { id: string; displayName: string; avatar: string | null }

export type Attendable = {
  kind: 'event' | 'pre-event'
  id: string
  title: string
  /** 詳細ページへの経路 */
  href: string
  schedule: AttendableSchedule
  location: string | null
  /** ハッシュタグ */
  tags: string[]
  /** タグを押した先。無ければリンクにしない */
  tagHref?: (tag: string) => string
  people: {
    count: number
    /** 「21 / 40人」の分母。無ければ制限なし */
    capacity: number | null
    avatars: AttendableAvatar[]
    /** 数字の後ろに置く語。「人」か「人が回答」 */
    unit: string
  }
  /** 回答・参加登録の締切 */
  deadline: string | null
  /**
   * 中止されたか。**一覧でも分かるようにする** — 開いてから知ると、
   * それまで参加するつもりで読んでいたことになる。
   * 日程調整には中止が無いので常に false。
   */
  cancelled: boolean
}

export function toEventAttendable(event: EventListItemDto): Attendable {
  return {
    kind: 'event',
    id: event.id,
    title: event.title,
    href: `/events/${event.id}`,
    schedule: {
      kind: 'fixed',
      start: event.startDate,
      end: event.endDate,
      hasStartTime: event.hasStartTime,
      hasEndTime: event.hasEndTime,
    },
    location: event.location,
    tags: event.hashtags,
    tagHref: (tag) => `/events/hashtag/${encodeURIComponent(tag)}`,
    people: {
      count: event.attendingCount,
      capacity: event.maxParticipants,
      avatars: event.attendees,
      unit: '人',
    },
    deadline: event.registrationDeadline,
    cancelled: event.status === 'cancelled',
  }
}

export function toPreEventAttendable(preEvent: PreEventListItemDto): Attendable {
  return {
    kind: 'pre-event',
    id: preEvent.id,
    title: preEvent.title,
    href: `/pre-events/${preEvent.id}`,
    schedule: { kind: 'candidates', options: preEvent.dateOptions },
    location: preEvent.location,
    /*
      **リンクにしない。** タグで引く画面（`/events/hashtag/…`）はイベントしか
      出さないので、押しても今見ている日程調整は出てこない
    */
    tags: preEvent.hashtags,
    people: {
      count: preEvent.respondentCount,
      // 日程調整に定員は無い。**回答が集まるほど良い**ので分母を出さない
      capacity: null,
      avatars: preEvent.respondents,
      unit: '人が回答',
    },
    deadline: preEvent.registrationDeadline,
    // 日程調整に中止は無い（作るか消すかのどちらか）
    cancelled: false,
  }
}

/**
 * カードの左に出す日付。
 *
 * 候補が複数ある日程調整では**いちばん早い候補**を出す。
 * 「まずいつ頃の話か」が分かればよく、全部並べる場所ではない。
 * 候補が無い（作りかけ）なら null。
 */
export function primaryDate(schedule: AttendableSchedule): string | null {
  if (schedule.kind === 'fixed') return schedule.start
  const sorted = [...schedule.options].sort((a, b) => a.startDate.localeCompare(b.startDate))
  return sorted[0]?.startDate ?? null
}

/** 日付の下に出す一言。時刻か、候補の残り件数 */
export function scheduleNote(schedule: AttendableSchedule): string | null {
  if (schedule.kind === 'candidates') {
    return schedule.options.length > 1 ? `候補${schedule.options.length}日` : null
  }
  if (!schedule.hasStartTime) return null

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))

  const start = fmt(schedule.start)
  if (!schedule.end || !schedule.hasEndTime) return start
  return `${start}–${fmt(schedule.end)}`
}
