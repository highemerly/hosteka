
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { created } from '@/server/http/response'
import { preEventPayloadSchema } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'
import { hashtagsToColumn } from '@/lib/hashtags'

import { enrichServersWithPlatform } from '@/lib/instance-platform'

// 日程オプション入力型
interface DateOptionInput {
  startDate: string
  endDate?: string | null
}

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
      hashtags,
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

    /*
      作ったものは `{ id }` だけを返す。画面は詳細ページへ移るだけで、中身は
      `GET /pre-events/[id]` が DTO にして返す。行をそのまま返すと、列を足したときに
      黙って外へ出る。
    */
    const preEvent = await prisma.preEvent.create({
      select: { id: true },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        hashtags: hashtagsToColumn(hashtags),
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
    })

    return created({ id: preEvent.id })
  },
})
