import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { enrichServersWithPlatform } from '@/lib/instance-platform'
import { checkOrgAdminPermission } from '@/lib/permissions'
import type { EventFormOutput } from '@/schemas/event'
import { ApiError } from '@/server/http/errors'
import { eventColumnsFromForm } from '@/server/events/event-write'

/**
 * イベントを作る。**作り方はここだけ。**
 *
 * 作る経路は2つある — 作成画面（`POST /api/v1/events`）と、日程調整を
 * イベントにするとき（`POST /api/v1/pre-events/[id]/promote`）。
 * それぞれが列とオプションを書き写すと、`event-write.ts` の冒頭にある事故
 * （片方のルートだけが項目を読み捨てる）がもう一度起きる。
 *
 * 2段に分けてある。`prepareEvent` はトランザクションの**外**でやること
 * （サーバーの種類を外へ問い合わせる、グループの権限を確かめる）、
 * `insertEvent` はトランザクションの**中**でやること。問い合わせを
 * トランザクションの中に入れると、相手が遅いあいだ行を握ったままになる。
 */

export type PreparedEvent = {
  form: EventFormOutput
  /** 列に入れる形（JSON）。制限なしは null */
  allowedFediverseServers: string | null
}

export async function prepareEvent(form: EventFormOutput, userId: string): Promise<PreparedEvent> {
  // allowedFediverseServers のプラットフォーム情報を取得
  let allowedFediverseServers: string | null = null
  if (form.allowedFediverseServers && form.allowedFediverseServers.length > 0) {
    allowedFediverseServers = JSON.stringify(
      await enrichServersWithPlatform(form.allowedFediverseServers)
    )
  }

  // グループに紐付けるなら、その管理者でなければならない
  if (form.organizationId) {
    const hasOrgPermission = await checkOrgAdminPermission(form.organizationId, userId)
    if (!hasOrgPermission) {
      throw ApiError.forbidden(
        '指定された組織の管理者ではないため、この組織にイベントを紐付けることができません'
      )
    }
  }

  return { form, allowedFediverseServers }
}

export async function insertEvent(
  tx: Prisma.TransactionClient,
  { form: body, allowedFediverseServers }: PreparedEvent,
  creatorId: string
): Promise<{ id: string }> {
  // 共通の写し取りは PUT と同じ関数を通す
  const createdEvent = await tx.event.create({
    select: { id: true },
    data: {
      ...eventColumnsFromForm(body),
      isAllowedForFediverse: body.isAllowedForFediverse,
      isAllowedForDiscord: body.isAllowedForDiscord,
      isAllowedForTwitter: body.isAllowedForTwitter,
      // 制限なしは null。編集側は [] を書く（既存の制限を消す必要があるため）
      allowedFediverseServers,
      terms: body.terms || null,
      creatorId,
      organizationId: body.organizationId || null,
    },
  })

  // 並び順は配列の順そのもの。画面は displayOrder を送らない
  for (const [groupOrder, group] of body.optionGroups.entries()) {
    const createdGroup = await tx.eventOptionGroup.create({
      data: {
        eventId: createdEvent.id,
        title: group.title,
        responseType: group.responseType,
        displayOrder: groupOrder,
      },
    })

    if (group.options.length > 0) {
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

  return createdEvent
}
