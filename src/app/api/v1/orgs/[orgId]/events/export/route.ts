import { NextResponse } from 'next/server'
import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { normalizeSlug } from '@/lib/normalize'
import { formatJstDateTime } from '@/lib/jst'
import { defineRoute } from '@/server/http/define-route'
import { cell } from '@/server/http/csv'
import { ApiError } from '@/server/http/errors'
import { requireOrgMember } from '@/server/http/guards'
import { orgIdParam } from '@/schemas/org'

export const GET = defineRoute({
  auth: 'required',
  params: orgIdParam,
  query: z.object({
    eventIds: z
      .string({ error: 'イベントIDが指定されていません' })
      .min(1, 'イベントIDが指定されていません'),
  }),
  // 閲覧系なので admin / staff どちらでも許可する（従来の挙動を踏襲）
  guard: requireOrgMember(),
  handler: async ({ params, query }) => {
  try {
    // guard が存在と権限を確認済み。ここでは名前とIDを使うために引き直す。
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: normalizeSlug(params.orgId) },
      select: { id: true, name: true },
    })
    // クエリパラメータからイベントIDを取得
    const eventIdsParam = query.eventIds


    const eventIds = eventIdsParam.split(',').filter(id => id.trim())

    if (eventIds.length === 0) {
      throw ApiError.validation('イベントIDが指定されていません')
    }

    // イベント情報と参加者データを取得
    const events = await prisma.event.findMany({
      where: {
        id: { in: eventIds },
        organizationId: org.id, // 組織に属するイベントのみ
      },
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
            }
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
      orderBy: {
        startDate: 'desc',
      },
    })

    if (events.length === 0) {
      throw ApiError.notFound('イベントが見つかりません')
    }

    // 全イベントのオプショングループを集約（ユニークなタイトルのみ）
    const allOptionGroupTitles = new Set<string>()
    events.forEach(event => {
      event.optionGroups.forEach(group => {
        allOptionGroupTitles.add(group.title)
      })
    })

    // CSVヘッダーを作成
    const headers = [
      'イベント名',
      'イベントID',
      '登録日時',
      'ユーザー名',
      'ID',
      '参加状態',
      'キャンセル理由',
      '権限',
      'コメント',
      '出欠',
      '会費',
      '幹事メモ',
    ]

    // オプショングループのヘッダーを追加
    allOptionGroupTitles.forEach(title => {
      headers.push(title)
    })

    // CSVデータを作成
    const csvRows = [headers.map(cell).join(',')]

    const statusLabels: Record<string, string> = {
      attending: '参加',
      maybe: '未定/参加検討中',
      not_attending: '欠席',
      cancelled: 'キャンセル'
    }

    const cancellationReasonLabels: Record<string, string> = {
      admin_cancelled: '主催者キャンセル',
      auto_cancelled: '自動キャンセル',
      user_cancelled: '自主キャンセル'
    }

    const attendanceLabels: Record<string, string> = {
      present: '出席',
      absent: '欠席',
      not_entered: '未入力'
    }

    const feeLabels: Record<string, string> = {
      paid: '支払済',
      unpaid: '未収',
      not_entered: '未入力'
    }

    events.forEach(event => {
      event.participants.forEach(participant => {
        // MastodonIDを作成
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
          ? cancellationReasonLabels[participant.cancellationReason] || ''
          : ''

        const row: string[] = [
          event.title,
          event.id,
          // 時刻帯を渡し忘れるとサーバーの設定（本番は UTC）で出るので、
          // 9時間ずれた登録日時が入る。`@/lib/jst` を通せば忘れようがない
          formatJstDateTime(participant.createdAt),
          participant.user.displayName,
          mastodonId,
          statusLabels[participant.status] || participant.status,
          cancellationReason,
          role,
          participant.comment || '',
          attendanceLabels[attendance?.attendStatus as string] || '未入力',
          feeLabels[attendance?.feeStatus as string] || '未入力',
          attendance?.memo || '',
        ]

        // オプショングループごとの選択肢を追加
        allOptionGroupTitles.forEach(title => {
          // このイベントに対応するオプショングループを探す
          const eventGroup = event.optionGroups.find(g => g.title === title)
          if (eventGroup) {
            const groupSelection = participant.groupSelections.find(
              (gs: { group: { id: string } }) => gs.group.id === eventGroup.id
            )
            // 自由入力と選択式を同じ列に出す（イベント単位のCSVと同じ）
            const answer = groupSelection
              ? (groupSelection.textAnswer ??
                groupSelection.options
                  .map((gso: { option: { name: string } }) => gso.option.name)
                  .join('、'))
              : ''
            row.push(answer)
          } else {
            row.push('')
          }
        })

        csvRows.push(row.map(cell).join(','))
      })
    })

    // BOMを追加してUTF-8として正しく認識されるようにする
    const csvContent = '\uFEFF' + csvRows.join('\n')

    // TextEncoderを使ってUTF-8エンコーディング
    const encoder = new TextEncoder()
    const csvBytes = encoder.encode(csvContent)

    // ファイル名にダウンロード日時を含める
    const now = new Date()
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
        'Content-Disposition': `attachment; filename="${encodeURIComponent(org.name)}_events_${dateTimeStr}.csv"`,
      },
    })
  } catch (error) {
    /*
      **握りつぶさない。** ここで 500 を自作すると、エンベロープの形も
      requestId も付かず、ログの `api.unhandled` にも残らない。
      投げ直せば defineRoute が同じ形に整える（ApiError はそのまま通る）。
    */
    console.error('Error exporting org events data:', error)
    throw error
  }
  },
})
