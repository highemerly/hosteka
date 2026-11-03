
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { created, makeMeta, okList } from '@/server/http/response'
import { listEventsQuery, eventFormSchema } from '@/schemas/event'
import { prisma } from '@/lib/prisma'

import { enrichServersWithPlatform } from '@/lib/instance-platform'
import { checkOrgAdminPermission } from '@/lib/permissions'
import { isPlatformAllowed } from '@/lib/participation-utils'
import { parseDate } from '@/lib/event-date-utils'
import { eventDeadlineAt, eventEndAt } from '@/lib/event-datetime'
import { eventColumnsFromForm } from '@/server/events/event-write'
import type { Prisma } from '@/generated/prisma/client'
import { EVENT_LIST_SELECT } from '@/server/queries/event-list'
import {
  serializeEventListItem,
  type EventListItemDto,
} from '@/server/serializers/event'

/**
 * `isParticipable` の絞り込みに要るもの。
 *
 * **参加者の配列は受け取らない。** 満員かどうかは filtered count で数える
 * （`EVENT_PARTICIPABLE_SELECT`）。全員読んでから数えると、48件のカードの
 * ために参加者を全部読むことになる。
 */
type ParticipableEvent = {
  status: string
  startDate: Date
  startTime: string | null
  hasStartTime: boolean
  endDate: Date | null
  endTime: string | null
  hasEndTime: boolean
  maxParticipants: number | null
  allowParticipationRequest: boolean
  registrationDeadlineDate: Date | null
  registrationDeadlineTime: string | null
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  allowedFediverseServers: string | null
  _count: { participants: number }
}

// オプショングループ内のオプション型
// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ユーザーがイベントに参加可能かどうかを判定
 */
function checkUserCanParticipate(
  event: ParticipableEvent,
  userId: string | undefined,
  userPlatform: string | undefined,
  userServer: string | undefined,
  now: Date
): boolean {
  // イベントが中止されている場合は参加不可
  if (event.status === 'cancelled') return false

  /*
    イベントが終了している場合は参加不可。**時刻列まで読む**（`eventEndAt`）。
    以前は日付列だけを比べていた。新形式の行は UTC 0時 = 09:00 JST なので、
    19:00 開始のイベントが当日の朝9時から「終了」扱いになり、絞り込みから消えた。
  */
  if (eventEndAt(event) < now) return false

  // プラットフォーム/サーバー制限は lib/participation-utils.ts に集約している
  if (!isPlatformAllowed(event, userPlatform, userServer)) return false

  // 満員チェック
  if (event.maxParticipants) {
    const attendingCount = event._count.participants
    if (attendingCount >= event.maxParticipants) {
      // allowParticipationRequest が true の場合は参加リクエスト可能
      if (!event.allowParticipationRequest) return false
    }
  }

  /*
    参加期限チェック。**参加登録が締め切るのと同じ瞬間で切る**
    （`lib/event-datetime.ts`）。以前は `setHours(23, 59)` をサーバーの
    ローカル時刻でやっていて、本番（UTC）では締切を9時間過ぎるまで
    「参加できる」に並んでいた。
  */
  const deadline = eventDeadlineAt(event.registrationDeadlineDate, event.registrationDeadlineTime)
  if (deadline && deadline < now) {
    // allowParticipationRequest が true の場合は参加リクエスト可能
    if (!event.allowParticipationRequest) return false
  }

  return true
}

/**
 * 一覧の1件。**他の一覧（`/events/mine` など）と同じ DTO。**
 * 画面ごとに形が違うと、カードの部品を使い回せない。
 */
export type EventListDto = EventListItemDto

/**
 * 一覧が返すもの ＋ `isParticipable` の絞り込みに要るもの。
 *
 * **生の行を返さない。** 生の行を渡すと、`Event` や `EventParticipant` に
 * 列を足した日に**未ログインのクライアントへ自動で公開される。**
 * 他の一覧と同じ `EVENT_LIST_SELECT` + シリアライザを通す。
 */
const EVENT_PARTICIPABLE_SELECT = {
  ...EVENT_LIST_SELECT,
  // ここから下は絞り込みだけに使う。応答には出ない
  allowParticipationRequest: true,
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  allowedFediverseServers: true,
} satisfies Prisma.EventSelect

/**
 * デフォルトの日付範囲を取得（終了48時間以内〜3ヶ月先）
 */
function getDefaultDateRange(): { from: Date; to: Date } {
  const now = new Date()
  const from = new Date(now)
  from.setHours(from.getHours() - 48)
  const to = new Date(now)
  to.setMonth(to.getMonth() + 3)
  return { from, to }
}

// =============================================================================
// GET: イベント一覧取得
// =============================================================================

export const GET = defineRoute({
  auth: 'optional',
  query: listEventsQuery,
  handler: async ({ query, session }) => {
    const userId = session?.user?.id
    const userPlatform = session?.user?.platform
    const userServer = session?.user?.server

    const {
      isCreated,
      isParticipated,
      participatedStatus,
      isCanceled,
      isParticipable,
      isEnded,
      ownershipMode,
      sort: sortParam,
      creatorServer,
    } = query
    const startDateFrom = parseDate(query.startDateFrom ?? null)
    const startDateTo = parseDate(query.startDateTo ?? null)
    const registrationDeadlineFrom = parseDate(query.registrationDeadlineFrom ?? null)
    const registrationDeadlineTo = parseDate(query.registrationDeadlineTo ?? null)

    // 自分に紐づく絞り込みは認証が必要
    if ((isCreated || isParticipated || isParticipable) && !userId) {
      throw ApiError.unauthenticated()
    }

    // limit / page はスキーマ側で検証・既定値適用済み
    const limit = query.limit
    const page = query.page
    const skip = limit ? (page - 1) * limit : undefined

    // ソート順の処理
    let orderByClause: Prisma.EventOrderByWithRelationInput | Prisma.EventOrderByWithRelationInput[]
    switch (sortParam) {
      case 'startDateDESC':
        orderByClause = { startDate: 'desc' }
        break
      case 'registrationDeadlineDateASC':
        orderByClause = { registrationDeadlineDate: 'asc' }
        break
      case 'registrationDeadlineDateDESC':
        orderByClause = { registrationDeadlineDate: 'desc' }
        break
      case 'participantsCountASC':
        orderByClause = [{ participants: { _count: 'asc' } }, { startDate: 'asc' }]
        break
      case 'participantsCountDESC':
        orderByClause = [{ participants: { _count: 'desc' } }, { startDate: 'asc' }]
        break
      case 'createdAtDESC':
        orderByClause = { createdAt: 'desc' }
        break
      case 'createdAtASC':
        orderByClause = { createdAt: 'asc' }
        break
      case 'startDateASC':
      default:
        orderByClause = { startDate: 'asc' }
        break
    }

    // WHERE句の構築
    const whereConditions: Prisma.EventWhereInput[] = []

    // 管理者が無効にしたイベントは常に除外
    whereConditions.push({ isDisabled: false })

    // isCreated / isParticipated フィルタ（ownershipMode対応）
    const statusFilter = participatedStatus
      ? { in: participatedStatus.split(',') }
      : undefined

    if (isCreated && isParticipated && ownershipMode === 'or') {
      // OR条件: 主催（作成者 OR 組織管理者） OR 参加
      whereConditions.push({
        OR: [
          { creatorId: userId },
          {
            organization: {
              admins: {
                some: { userId },
              },
            },
          },
          {
            participants: {
              some: {
                userId,
                ...(statusFilter && { status: statusFilter }),
              },
            },
          },
        ],
      })
    } else {
      // AND条件（従来通り）またはどちらか一方のみ指定
      if (isCreated) {
        // 作成者 OR 組織管理者
        whereConditions.push({
          OR: [
            { creatorId: userId },
            {
              organization: {
                admins: {
                  some: { userId },
                },
              },
            },
          ],
        })
      } else if (isCreated === false) {
        // 作成者でも組織管理者でもない
        whereConditions.push({
          AND: [
            { creatorId: { not: userId } },
            {
              OR: [
                { organizationId: null },
                {
                  organization: {
                    admins: {
                      none: { userId },
                    },
                  },
                },
              ],
            },
          ],
        })
      }

      if (isParticipated) {
        whereConditions.push({
          participants: {
            some: {
              userId,
              ...(statusFilter && { status: statusFilter }),
            },
          },
        })
      } else if (isParticipated === false) {
        whereConditions.push({
          NOT: {
            participants: {
              some: {
                userId,
              },
            },
          },
        })
      }
    }

    // isCanceled フィルタ
    if (isCanceled) {
      whereConditions.push({ status: 'cancelled' })
    } else if (isCanceled === false) {
      whereConditions.push({ status: { not: 'cancelled' } })
    }

    // creatorServer フィルタ
    if (creatorServer) {
      whereConditions.push({
        creator: {
          server: creatorServer,
        },
      })
    }

    // isEnded フィルタ（終了状態）
    if (isEnded === false) {
      // 未終了 + 終了後48時間以内
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
      whereConditions.push({
        OR: [
          // endDateがある場合: endDate >= 48時間前
          { endDate: { gte: fortyEightHoursAgo } },
          // endDateがない場合: startDate >= 48時間前
          { AND: [{ endDate: null }, { startDate: { gte: fortyEightHoursAgo } }] }
        ]
      })
    } else if (isEnded) {
      // 終了済み（終了直後から）
      const now = new Date()
      whereConditions.push({
        OR: [
          // endDateがある場合: endDate < now
          { endDate: { lt: now } },
          // endDateがない場合: startDate < now
          { AND: [{ endDate: null }, { startDate: { lt: now } }] }
        ]
      })
    }

    // 日付範囲フィルタ
    const hasOwnershipFilter = isCreated || isParticipated

    if (startDateFrom || startDateTo) {
      // 明示的に指定された場合
      const dateFilter: Prisma.DateTimeFilter = {}
      if (startDateFrom) dateFilter.gte = startDateFrom
      if (startDateTo) dateFilter.lte = startDateTo
      whereConditions.push({ startDate: dateFilter })
    } else if (!hasOwnershipFilter) {
      // isCreated/isParticipated が指定されていない場合はデフォルト範囲を適用
      const defaultRange = getDefaultDateRange()
      whereConditions.push({
        OR: [
          { startDate: { gte: defaultRange.from } },
          { endDate: { gte: defaultRange.from } },
        ],
      })
      whereConditions.push({ startDate: { lte: defaultRange.to } })
    }

    // registrationDeadline フィルタ
    if (registrationDeadlineFrom || registrationDeadlineTo) {
      const deadlineFilter: Prisma.DateTimeNullableFilter = {}
      if (registrationDeadlineFrom) deadlineFilter.gte = registrationDeadlineFrom
      if (registrationDeadlineTo) deadlineFilter.lte = registrationDeadlineTo
      whereConditions.push({
        registrationDeadlineDate: deadlineFilter,
      })
    }

    // デフォルト動作: パラメータなしの場合
    // ハイライト表示イベント + 自分が作成/参加登録しているイベント
    const isDefaultQuery =
      !isCreated &&
      !isParticipated &&
      !isCanceled &&
      !isParticipable &&
      !startDateFrom &&
      !startDateTo &&
      !registrationDeadlineFrom &&
      !registrationDeadlineTo &&
      !creatorServer

    if (isDefaultQuery) {
      const defaultRange = getDefaultDateRange()

      if (userId) {
        // ログイン時: ハイライト表示 OR 自分が作成 OR 組織管理者 OR 自分が参加
        whereConditions.length = 0 // リセット
        whereConditions.push({ isDisabled: false })
        whereConditions.push({
          OR: [
            // ハイライト表示の公開イベント
            {
              isPublic: true,
              isHighlighted: true,
            },
            // 自分が作成したイベント
            { creatorId: userId },
            // 自分が組織管理者のイベント
            {
              organization: {
                admins: {
                  some: { userId },
                },
              },
            },
            // 自分が参加登録しているイベント
            {
              participants: {
                some: { userId },
              },
            },
          ],
        })
        whereConditions.push({
          OR: [
            { startDate: { gte: defaultRange.from } },
            { endDate: { gte: defaultRange.from } },
          ],
        })
        whereConditions.push({ startDate: { lte: defaultRange.to } })
      } else {
        // 未ログイン時: ハイライト表示の公開イベントのみ
        whereConditions.push({ isPublic: true })
        whereConditions.push({ isHighlighted: true })
        whereConditions.push({ startDate: { gte: new Date() } })
        whereConditions.push({ startDate: { lte: defaultRange.to } })
      }
    } else {
      // パラメータ指定時: ハイライトのフィルタを適用
      // ただし、isCreated=true または isParticipated=true の場合は
      // 自分のイベントも含まれるようにOR条件で緩和
      if (isCreated || isParticipated) {
        // 自分が関与しているイベントはハイライト関係なく表示可能
        // → フィルタ条件自体で isCreated/isParticipated が適用済みなので追加制限なし
      } else {
        // isCreated=false や isParticipated=false の場合はハイライト表示の公開イベントのみ
        whereConditions.push({ isHighlighted: true })
        whereConditions.push({ isPublic: true })
      }
    }

    // クエリ実行
    const whereClause = whereConditions.length > 0 ? { AND: whereConditions } : {}

    const [events, totalCount] = await Promise.all([
      prisma.event.findMany({
        where: whereClause,
        select: EVENT_PARTICIPABLE_SELECT,
        orderBy: orderByClause,
        ...(limit && { take: limit }),
        ...(skip && { skip }),
      }),
      prisma.event.count({
        where: whereClause,
      }),
    ])

    // isParticipable フィルタ（サーバーサイドで追加フィルタリング）
    let filteredEvents = events
    if (isParticipable) {
      const now = new Date()
      filteredEvents = events.filter((event) =>
        checkUserCanParticipate(event, userId, userPlatform, userServer, now)
      )
    } else if (isParticipable === false) {
      const now = new Date()
      filteredEvents = events.filter(
        (event) => !checkUserCanParticipate(event, userId, userPlatform, userServer, now)
      )
    }

    const total = isParticipable ? filteredEvents.length : totalCount
    return okList(
      filteredEvents.map(serializeEventListItem),
      makeMeta(total, page, limit ?? total)
    )
  },
})

// =============================================================================
// POST: イベント作成
// =============================================================================

export const POST = defineRoute({
  auth: 'required',
  // 入力の検証は eventFormSchema（画面と同じ定義）に任せる。
  // ここでは JSON として読めることだけを保証する。
  body: eventFormSchema,
  handler: async ({ body, session }) => {
    const {
      isAllowedForFediverse,
      isAllowedForDiscord,
      isAllowedForTwitter,
      allowedFediverseServers,
      terms,
      organizationId,
      optionGroups,
    } = body

    // allowedFediverseServers のプラットフォーム情報を取得
    let enrichedServers: { server: string; type: string }[] | null = null
    if (allowedFediverseServers && allowedFediverseServers.length > 0) {
      enrichedServers = await enrichServersWithPlatform(allowedFediverseServers)
    }

    // organizationId指定時の権限チェック
    // 組織に紐付ける場合、ユーザーがその組織の管理者である必要がある
    if (organizationId) {
      const hasOrgPermission = await checkOrgAdminPermission(organizationId, session.user.id)
      if (!hasOrgPermission) {
        throw ApiError.forbidden(
          '指定された組織の管理者ではないため、この組織にイベントを紐付けることができません'
        )
      }
    }

    // トランザクションを使用してイベントとオプションを一緒に作成
    const event = await prisma.$transaction(async (tx) => {
      // イベントを作成。共通の写し取りは PUT と同じ関数を通す
      const createdEvent = await tx.event.create({
        data: {
          ...eventColumnsFromForm(body),
          isAllowedForFediverse,
          isAllowedForDiscord,
          isAllowedForTwitter,
          // 制限なしは null。編集側は [] を書く（既存の制限を消す必要があるため）
          allowedFediverseServers: enrichedServers
            ? JSON.stringify(enrichedServers)
            : null,
          terms: terms || null,
          creatorId: session.user.id,
          organizationId: organizationId || null,
        },
      })

      // オプショングループを作成
      if (optionGroups && optionGroups.length > 0) {
        // 並び順は配列の順そのもの。画面は displayOrder を送らない
        for (const [groupOrder, group] of optionGroups.entries()) {
          const createdGroup = await tx.eventOptionGroup.create({
            data: {
              eventId: createdEvent.id,
              title: group.title,
              responseType: group.responseType,
              displayOrder: groupOrder,
            },
          })

          // グループ内のオプションを作成
          if (group.options && group.options.length > 0) {
            await tx.eventOption.createMany({
              data: group.options.map((option, index) => ({
                eventId: createdEvent.id,
                groupId: createdGroup.id,
                name: option.name,
                maxParticipants: option.maxParticipants || null,
                displayOrder: index,
              })),
            })
          }
        }
      }

      return createdEvent
    })

    // 作成されたイベントを詳細情報と一緒に取得
    const eventWithDetails = await prisma.event.findUnique({
      where: { id: event.id },
      omit: { isDisabled: true },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            server: true,
            platform: true,
          },
        },
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
          },
        },
        options: {
          orderBy: {
            displayOrder: 'asc',
          },
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

    return created(eventWithDetails)
  },
})
