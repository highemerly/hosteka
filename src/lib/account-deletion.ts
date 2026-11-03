import { prisma } from '@/lib/prisma'

export interface Blocker {
  type: 'hosted_event' | 'participated_event'
  eventId: string
  eventTitle: string
  startDate: string
  participantStatus?: string // participated_eventの場合のみ
}

export interface DeletePreview {
  hostedEventsToDelete: number
  participationsToDelete: number
  preEventsToDelete: number
  preEventResponsesToDelete: number
  organizationsToOrphan: number
  organizationMembershipsToDelete: number
}

export interface AccountDeletionValidation {
  canDelete: boolean
  blockers: Blocker[]
  deletePreview: DeletePreview
}

/**
 * アカウント削除のバリデーションを行う
 * - 開催日前の主催イベントがある場合はブロック
 * - 開催日前のアクティブ参加イベントがある場合はブロック
 */
export async function validateAccountDeletion(userId: string): Promise<AccountDeletionValidation> {
  // JSTでの現在時刻
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }))

  // ブロッカー1: 開催日前の主催イベント
  const hostedBlockingEvents = await prisma.event.findMany({
    where: {
      creatorId: userId,
      startDate: { gt: now },
      isDisabled: false
    },
    select: {
      id: true,
      title: true,
      startDate: true
    }
  })

  // ブロッカー2: 開催日前のアクティブ参加イベント（自分が主催者でないもの）
  const participatedBlockingEvents = await prisma.eventParticipant.findMany({
    where: {
      userId,
      status: { in: ['attending', 'maybe', 'participation_request'] },
      event: {
        creatorId: { not: userId },
        startDate: { gt: now },
        isDisabled: false
      }
    },
    select: {
      status: true,
      event: {
        select: {
          id: true,
          title: true,
          startDate: true
        }
      }
    }
  })

  // ブロッカーリストを作成
  const blockers: Blocker[] = [
    ...hostedBlockingEvents.map(event => ({
      type: 'hosted_event' as const,
      eventId: event.id,
      eventTitle: event.title,
      startDate: event.startDate.toISOString()
    })),
    ...participatedBlockingEvents.map(p => ({
      type: 'participated_event' as const,
      eventId: p.event.id,
      eventTitle: p.event.title,
      startDate: p.event.startDate.toISOString(),
      participantStatus: p.status
    }))
  ]

  // 削除プレビュー情報を取得
  const [
    hostedEventsCount,
    participationsCount,
    preEventsCount,
    preEventResponsesCount,
    organizationsCount,
    organizationMembershipsCount
  ] = await Promise.all([
    // 開催日後の主催イベント（削除される）
    prisma.event.count({
      where: {
        creatorId: userId,
        OR: [
          { startDate: { lte: now } },
          { isDisabled: true }
        ]
      }
    }),
    // 参加記録
    prisma.eventParticipant.count({
      where: { userId }
    }),
    // 主催日程調整
    prisma.preEvent.count({
      where: { creatorId: userId }
    }),
    // 日程調整回答
    prisma.preEventParticipant.count({
      where: { userId }
    }),
    // 作成した組織（creatorがnullになる）
    prisma.organization.count({
      where: { creatorId: userId }
    }),
    // 組織メンバーシップ
    prisma.organizationAdmin.count({
      where: { userId }
    })
  ])

  const canDelete = blockers.length === 0

  return {
    canDelete,
    blockers,
    deletePreview: {
      hostedEventsToDelete: hostedEventsCount,
      participationsToDelete: participationsCount,
      preEventsToDelete: preEventsCount,
      preEventResponsesToDelete: preEventResponsesCount,
      organizationsToOrphan: organizationsCount,
      organizationMembershipsToDelete: organizationMembershipsCount
    }
  }
}
