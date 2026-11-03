
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { created, makeMeta, okList } from '@/server/http/response'
import { listPreEventsQuery, preEventPayloadSchema } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'

import { enrichServersWithPlatform } from '@/lib/instance-platform'
import { isPlatformAllowed } from '@/lib/participation-utils'
import { parseDate } from '@/lib/event-date-utils'
import type { Prisma, PreEvent } from '@/generated/prisma/client'

// 日程オプション入力型
interface DateOptionInput {
  startDate: string
  endDate?: string | null
}

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * ユーザーが日程調整に参加可能かどうかを判定
 */
function checkUserCanParticipate(
  preEvent: Omit<PreEvent, 'isDisabled'>,
  userId: string | undefined,
  userPlatform: string | undefined,
  userServer: string | undefined,
  now: Date
): boolean {
  /*
    回答期限が過ぎている場合は参加不可。**列の値をそのまま比べる。**
    イベントと違い、日程調整の締切は日付と時刻を1つの列に持つ本物の瞬間
    （下の既定の一覧も `registrationDeadline >= now` で切っている）。
    以前は `setHours(23, 59)` でサーバーのローカル時刻の日末まで延ばしていて、
    締切を過ぎたものが「回答できる」に並んでいた。
  */
  if (preEvent.registrationDeadline && preEvent.registrationDeadline < now) return false

  // プラットフォーム/サーバー制限は lib/participation-utils.ts に集約している
  return isPlatformAllowed(preEvent, userPlatform, userServer)
}

// =============================================================================
// GET: 日程調整一覧取得
// =============================================================================

export const GET = defineRoute({
  auth: 'optional',
  query: listPreEventsQuery,
  handler: async ({ query, session }) => {
    const userId = session?.user?.id
    const userPlatform = session?.user?.platform
    const userServer = session?.user?.server

    const {
      isCreated,
      isParticipated,
      isParticipable,
      ownershipMode,
      sort: sortParam,
      creatorServer,
    } = query
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
    let orderByClause: Prisma.PreEventOrderByWithRelationInput | Prisma.PreEventOrderByWithRelationInput[]
    switch (sortParam) {
      case 'createdAtASC':
        orderByClause = { createdAt: 'asc' }
        break
      case 'registrationDeadlineASC':
        orderByClause = { registrationDeadline: 'asc' }
        break
      case 'registrationDeadlineDESC':
        orderByClause = { registrationDeadline: 'desc' }
        break
      case 'participantsCountASC':
        orderByClause = [{ participants: { _count: 'asc' } }, { createdAt: 'desc' }]
        break
      case 'participantsCountDESC':
        orderByClause = [{ participants: { _count: 'desc' } }, { createdAt: 'desc' }]
        break
      case 'createdAtDESC':
      default:
        orderByClause = [{ isHighlighted: 'desc' }, { createdAt: 'desc' }]
        break
    }

    // WHERE句の構築
    const whereConditions: Prisma.PreEventWhereInput[] = []

    // 管理者が無効にした日程調整は常に除外
    whereConditions.push({ isDisabled: false })

    // isCreated / isParticipated フィルタ（ownershipMode対応）
    // isCreated=true: 作成者 OR 組織管理者
    const createdCondition = {
      OR: [
        { creatorId: userId },
        {
          organization: {
            admins: {
              some: { userId: userId }
            }
          }
        }
      ]
    }

    if (isCreated && isParticipated && ownershipMode === 'or') {
      // OR条件: 主催（作成者または組織管理者） OR 参加
      whereConditions.push({
        OR: [
          ...createdCondition.OR,
          {
            participants: {
              some: {
                userId,
              },
            },
          },
        ],
      })
    } else {
      // AND条件（従来通り）またはどちらか一方のみ指定
      if (isCreated) {
        whereConditions.push(createdCondition)
      } else if (isCreated === false) {
        whereConditions.push({
          AND: [
            { creatorId: { not: userId } },
            {
              NOT: {
                organization: {
                  admins: {
                    some: { userId: userId }
                  }
                }
              }
            }
          ]
        })
      }

      if (isParticipated) {
        whereConditions.push({
          participants: {
            some: {
              userId,
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

    // creatorServer フィルタ
    if (creatorServer) {
      whereConditions.push({
        creator: {
          server: creatorServer,
        },
      })
    }

    // registrationDeadline フィルタ
    if (registrationDeadlineFrom || registrationDeadlineTo) {
      const deadlineFilter: Prisma.DateTimeNullableFilter = {}
      if (registrationDeadlineFrom) deadlineFilter.gte = registrationDeadlineFrom
      if (registrationDeadlineTo) deadlineFilter.lte = registrationDeadlineTo
      whereConditions.push({
        registrationDeadline: deadlineFilter,
      })
    }

    // デフォルト動作: パラメータなしの場合
    // ハイライト表示の日程調整 + 自分が作成/参加登録しているもの
    const isDefaultQuery =
      !isCreated &&
      !isParticipated &&
      !isParticipable &&
      !registrationDeadlineFrom &&
      !registrationDeadlineTo &&
      !creatorServer

    if (isDefaultQuery) {
      if (userId) {
        // ログイン時: ハイライト表示 OR 自分が作成 OR 組織管理者 OR 自分が参加
        whereConditions.length = 0 // リセット
        whereConditions.push({ isDisabled: false })
        whereConditions.push({
          OR: [
            // ハイライト表示の公開日程調整（回答期限前または期限なし）
            {
              isPublic: true,
              isHighlighted: true,
              OR: [
                { registrationDeadline: null },
                { registrationDeadline: { gte: new Date() } },
              ],
            },
            // 自分が作成した日程調整
            { creatorId: userId },
            // 自分が組織管理者の日程調整
            {
              organization: {
                admins: {
                  some: { userId }
                }
              }
            },
            // 自分が参加登録している日程調整
            {
              participants: {
                some: { userId },
              },
            },
          ],
        })
      } else {
        // 未ログイン時: ハイライト表示の公開日程調整（回答期限前または期限なし）のみ
        whereConditions.push({ isPublic: true })
        whereConditions.push({ isHighlighted: true })
        whereConditions.push({
          OR: [
            { registrationDeadline: null },
            { registrationDeadline: { gte: new Date() } },
          ],
        })
      }
    } else {
      // パラメータ指定時: ハイライトのフィルタを適用
      // ただし、isCreated=true または isParticipated=true の場合は
      // 自分の日程調整も含まれるようにOR条件で緩和
      if (isCreated || isParticipated) {
        // 自分が関与している日程調整はハイライト関係なく表示可能
        // → フィルタ条件自体で isCreated/isParticipated が適用済みなので追加制限なし
      } else {
        // isCreated=false や isParticipated=false の場合はハイライト表示の公開イベントのみ
        whereConditions.push({ isHighlighted: true })
        whereConditions.push({ isPublic: true })
      }
    }

    // クエリ実行
    const whereClause = whereConditions.length > 0 ? { AND: whereConditions } : {}

    const [preEvents, totalCount] = await Promise.all([
      prisma.preEvent.findMany({
        where: whereClause,
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
          organization: {
            include: {
              admins: {
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true,
                      server: true,
                    },
                  },
                },
              },
            },
          },
          dateOptions: {
            orderBy: { displayOrder: 'asc' },
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
              dateOption: {
                select: {
                  id: true,
                  startDate: true,
                  endDate: true,
                },
              },
            },
          },
        },
        orderBy: orderByClause,
        ...(limit && { take: limit }),
        ...(skip && { skip }),
      }),
      prisma.preEvent.count({
        where: whereClause,
      }),
    ])

    // isParticipable フィルタ（サーバーサイドで追加フィルタリング）
    let filteredPreEvents = preEvents
    if (isParticipable) {
      const now = new Date()
      filteredPreEvents = preEvents.filter((preEvent) =>
        checkUserCanParticipate(preEvent, userId, userPlatform, userServer, now)
      )
    } else if (isParticipable === false) {
      const now = new Date()
      filteredPreEvents = preEvents.filter(
        (preEvent) => !checkUserCanParticipate(preEvent, userId, userPlatform, userServer, now)
      )
    }

    const total = isParticipable ? filteredPreEvents.length : totalCount
    return okList(filteredPreEvents, makeMeta(total, page, limit ?? total))
  },
})

// =============================================================================
// POST: 日程調整作成
// =============================================================================

export const POST = defineRoute({
  auth: 'required',
  // 入力の検証は preEventPayloadSchema に任せる（画面が送る形そのもの）
  body: preEventPayloadSchema,
  handler: async ({ body, session }) => {
    const {
      title,
      description,
      location,
      fee,
      relatedUrl,
      terms,
      isAllowedForFediverse,
      isAllowedForDiscord,
      isAllowedForTwitter,
      allowedFediverseServers,
      allowAutoRegistration,
      isPublic,
      isHighlighted,
      registrationDeadline,
      dateOptions,
      organizationId,
    } = body

    // 組織IDの検証（指定されている場合）
    if (organizationId) {
      const orgAdmin = await prisma.organizationAdmin.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: session.user.id
          }
        }
      })
      if (!orgAdmin) {
        throw ApiError.forbidden('指定されたグループの管理者ではありません')
      }
    }

    // allowedFediverseServers のプラットフォーム情報を取得
    let enrichedServers: { server: string; type: string }[] | null = null
    if (allowedFediverseServers && allowedFediverseServers.length > 0) {
      enrichedServers = await enrichServersWithPlatform(allowedFediverseServers)
    }

    // 日程調整作成
    const preEvent = await prisma.preEvent.create({
      omit: { isDisabled: true },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        location: location?.trim() || null,
        fee: fee?.trim() || null,
        relatedUrl: relatedUrl?.trim() || null,
        terms: terms?.trim() || null,
        isAllowedForFediverse: isAllowedForFediverse ?? true,
        isAllowedForDiscord: isAllowedForDiscord ?? false,
        isAllowedForTwitter: isAllowedForTwitter ?? false,
        allowedFediverseServers: enrichedServers
          ? JSON.stringify(enrichedServers)
          : null,
        allowAutoRegistration: allowAutoRegistration ?? false,
        isPublic: isPublic ?? true,
        isHighlighted: isHighlighted ?? false,
        registrationDeadline: registrationDeadline
          ? new Date(registrationDeadline)
          : null,
        creatorId: session.user.id,
        organizationId: organizationId || null,
        dateOptions: {
          create: dateOptions.map((option: DateOptionInput, index: number) => ({
            startDate: new Date(option.startDate),
            endDate: option.endDate ? new Date(option.endDate) : null,
            displayOrder: index,
          })),
        },
      },
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
        organization: {
          include: {
            admins: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true,
                    server: true,
                  },
                },
              },
            },
          },
        },
        dateOptions: {
          orderBy: { displayOrder: 'asc' },
        },
      },
    })

    return created(preEvent)
  },
})
