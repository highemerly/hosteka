import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requireEventOrganizer } from '@/server/http/guards'
import { eventIdParam } from '@/schemas/event'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { ParticipantGroupSelection, ParticipantGroupOption } from '@/generated/prisma/client'
import { cell, isoInterval, metadataRows } from '@/server/http/csv'
import { formatJstDateTime, toJstDateInput, toJstIso } from '@/lib/jst'
import { getBaseUrl } from '@/lib/base-url'
import type { participantStatus } from '@/schemas/event'
import type { z } from 'zod'

// グループ選択（リレーション付き）の型
type GroupSelectionWithRelations = ParticipantGroupSelection & {
  group: { id: string; title: string }
  options: (ParticipantGroupOption & { option: { id: string; name: string } })[]
}

/**
 * 1グループぶんの回答を1つのセルにする。
 *
 * **自由入力と選択式を同じ列に出す。** 列の見出しは設問名なので、
 * 答え方が違っても読む側にとっては同じ「その設問への答え」。
 * 引用符や改行の逃がしは `cell` が引き受ける。
 */
function answerCell(selection: GroupSelectionWithRelations | undefined): string {
  if (!selection) return ''
  return selection.textAnswer ?? selection.options.map((o) => o.option.name).join('、')
}

type ParticipantStatus = z.infer<typeof participantStatus>

/** 参加状態が増えたら typecheck で落ちる。英語の値がそのまま出ないように */
const STATUS_LABEL: Record<ParticipantStatus, string> = {
  attending: '参加',
  maybe: '未定/参加検討中',
  not_attending: '欠席',
  cancelled: 'キャンセル',
  participation_request: '参加リクエスト',
}

const CANCELLATION_REASON_LABEL: Record<string, string> = {
  admin_cancelled: '主催者キャンセル',
  auto_cancelled: '自動キャンセル',
  user_cancelled: '自主キャンセル',
}

const ATTENDANCE_LABEL: Record<string, string> = {
  present: '出席',
  absent: '欠席',
  not_entered: '未入力',
}

const FEE_LABEL: Record<string, string> = {
  paid: '支払済',
  unpaid: '未収',
  not_entered: '未入力',
}

/** 開催日時。時刻を指定していない側は日付だけにする */
function formatSchedule(event: {
  startDate: Date
  hasStartTime: boolean
  endDate: Date | null
  hasEndTime: boolean
}): string {
  const at = (value: Date, withTime: boolean) =>
    withTime ? toJstIso(value) : toJstDateInput(value)

  return isoInterval(
    at(event.startDate, event.hasStartTime),
    event.endDate ? at(event.endDate, event.hasEndTime) : null
  )
}

export const GET = defineRoute({
  auth: 'required',
  params: eventIdParam,
  guard: requireEventOrganizer('エクスポート'),
  handler: async ({ params }) => {
    const id = params.id

    // イベント情報と出欠データを取得
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                server: true,
                platform: true,
              },
            },
            groupSelections: {
              include: {
                group: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
                options: {
                  include: {
                    option: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        attendances: {
          include: {
            user: {
              select: {
                displayName: true,
                username: true,
                server: true
              }
            },
            // **誰がいつ記録したかはここにしか残らない。**
            // 画面（出欠登録）からは外したので、CSVで追えるようにする
            updatedBy: { select: { displayName: true } }
          }
        },
        optionGroups: {
          include: {
            options: {
              orderBy: {
                displayOrder: 'asc',
              },
            },
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
      },
    })

    if (!event) {
      throw ApiError.notFound('Event not found')
    }

    // CSVヘッダーを作成
    const headers = [
      'イベントID',
      '登録日時',
      'ユーザー名',
      'ユーザーID',
      '参加状態',
      'キャンセル理由',
      '権限',
      'ユーザーコメント',
      '出欠',
      '会費',
      '幹事メモ',
      '出欠登録記録者',
      '出欠登録記録日時',
    ]

    // オプショングループがある場合はヘッダーに追加。
    // 名前だけだと固定の列（「会費」など）と見分けがつかず、同名なら衝突する
    event.optionGroups.forEach((group: { id: string; title: string }) => {
      headers.push(`オプション：${group.title}`)
    })

    const now = new Date()
    const csvRows = [
      ...metadataRows(
        [
          ['イベント名', event.title],
          ['イベントID', event.id],
          ['開催日時', formatSchedule(event)],
          ['開催場所', event.location ?? ''],
          ['参加費', event.fee ?? ''],
          ['イベントURL', `${getBaseUrl()}/events/${event.id}`],
        ],
        now
      ),
      headers.map(cell).join(','),
    ]

    event.participants.forEach((participant) => {
      // MastodonIDを作成（@username@server形式）
      // 頭に `@` を付けない。表計算ソフトは `@` で始まる値を式として読む
      const mastodonId = `${participant.user.username}@${participant.user.server}`

      // 権限を判定
      const role = participant.userId === event.creatorId
        ? '主催者'
        : participant.isOrganizer
        ? '幹事'
        : '一般参加者'

      // 出欠情報を取得
      const attendance = event.attendances.find(a => a.userId === participant.userId)

      // キャンセル理由を取得
      const cancellationReason = participant.cancellationReason
        ? CANCELLATION_REASON_LABEL[participant.cancellationReason] ?? ''
        : ''

      const row = [
        event.id,
        toJstIso(participant.createdAt),
        participant.user.displayName,
        mastodonId,
        STATUS_LABEL[participant.status as ParticipantStatus] ?? participant.status,
        cancellationReason,
        role,
        participant.comment ?? '',
        ATTENDANCE_LABEL[attendance?.attendStatus ?? ''] ?? '未入力',
        FEE_LABEL[attendance?.feeStatus ?? ''] ?? '未入力',
        attendance?.memo ?? '',
        attendance?.updatedBy?.displayName ?? '',
        attendance ? toJstIso(attendance.updatedAt) : '',
      ]

      // オプショングループごとの選択肢を追加
      event.optionGroups.forEach((group: { id: string; title: string }) => {
        // groupSelections から対象グループの選択を取得
        const groupSelection = participant.groupSelections.find(
          (gs: GroupSelectionWithRelations) => gs.group.id === group.id
        )
        row.push(answerCell(groupSelection))
      })

      csvRows.push(row.map(cell).join(','))
    })

    // BOMを追加してUTF-8として正しく認識されるようにする
    const csvContent = '\uFEFF' + csvRows.join('\n')
    
    // TextEncoderを使ってUTF-8エンコーディング
    const encoder = new TextEncoder()
    const csvBytes = encoder.encode(csvContent)

    // ファイル名にダウンロード日時を含める
    const dateTimeStr = formatJstDateTime(now, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/[\/:]/g, '-').replace(/\s/g, '_')
    
    // CSVファイルとして返す
    return new NextResponse(csvBytes, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(event.title)}_participants_${dateTimeStr}.csv"`,
      },
    })
  },
})