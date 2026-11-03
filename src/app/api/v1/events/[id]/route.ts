import { serializeEventDetail } from '@/server/serializers/event'
import { after } from 'next/server'

import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins, requireEventOrganizer } from '@/server/http/guards'
import { eventIdParam, eventFormSchema } from '@/schemas/event'
import { prisma } from '@/lib/prisma'

import {
  checkEventOwnerPermission,
  checkOrganizerPermission,
  checkOrgAdminPermission,
} from '@/lib/permissions'
import { jstDay } from '@/lib/event-datetime'
import { isAllowedEventTermsChange } from '@/lib/event-terms'
import { canChangeOrganization } from '@/lib/status-transition'
import { enrichServersWithPlatform } from '@/lib/instance-platform'
import {
  explainIneligibility,
  extractServerNamesFromAllowedServers,
  isUserAllowed,
} from '@/lib/participation-utils'
import { eventColumnsFromForm } from '@/server/events/event-write'
import { notifiableEventChanges } from '@/server/events/event-change'
import {
  notifyAfter,
  notifyEventUpdated,
  notifyParticipationRequestsClosed,
} from '@/server/notifications/notify'
import { autoCancelMaybeForEvent } from '@/server/services/auto-cancel-maybe'
import type { EventOptionGroup, EventOption } from '@/generated/prisma/client'

// オプショングループ（オプション付き）の型
type EventOptionGroupWithOptions = EventOptionGroup & {
  options: EventOption[]
}

export const GET = defineRoute({
  auth: 'optional',
  params: eventIdParam,
  handler: async ({ params, session }) => {
    const id = params.id
    const event = await prisma.event.findUnique({
      where: { id },
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
          select: { id: true, slug: true, name: true, admins: { select: { userId: true } } }
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
            groupSelections: {
              include: { options: { include: { option: true } } },
            },
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

    if (!event) throw ApiError.notFound('イベントが見つかりません')
    await hideDisabledFromNonAdmins(event.isDisabled, session, 'イベントが見つかりません')

    /*
      締切を過ぎた「未定」をキャンセルに変える。

      **この処理は旧 SSR ページの中で走っていた。** ページを純CSRにした時点で
      呼び出し元が消え、締切を過ぎても未定のまま残るようになっていた。
      本来は cron（api/v1/events/auto-cancel-maybe）の仕事だが、
      それが止まっていても画面の表示だけは正しくなるよう、ここでも回す。

      after() でレスポンスの後に回す。冪等（updateMany）なので、
      同時に走っても、ポッドが落ちて実行されなくても壊れない。
    */
    after(async () => {
      try {
        await autoCancelMaybeForEvent(id)
      } catch {
        // 表示のための保険なので、失敗しても本体には影響させない
      }
    })

    const userPlatform = session?.user.platform
    const userServer = session?.user.server
    const platformSettings = {
      isAllowedForFediverse: event.isAllowedForFediverse,
      isAllowedForDiscord: event.isAllowedForDiscord,
      isAllowedForTwitter: event.isAllowedForTwitter,
      allowedFediverseServers: event.allowedFediverseServers,
    }
    const isEligible = isUserAllowed(userPlatform, userServer, platformSettings)

    const isOrganizer = session
      ? await checkOrganizerPermission(id, session.user.id)
      : false
    // 幹事とグループのスタッフは編集できるが中止はできない。幹事メニューから項目を外すのに使う
    const canCancel =
      session && isOrganizer ? await checkEventOwnerPermission(id, session.user.id) : false

    /*
      非公開イベントは、ログインしている人だけが開ける。

      **参加できるかどうかでは絞らない。** 以前は登録できるプラットフォームの
      条件（`isEligible`）まで見ていたが、設定の名前（「ログインユーザーのみが
      閲覧できるようにする」）と食い違っていた。**見えるかどうかと登録できる
      かどうかは別の設定**で、混ぜると主催者が閉じたつもりのない範囲まで閉じる
      （別プラットフォームの参加者に、招待したイベントが開けなかった）。
    */
    if (!event.isPublic && !session) throw ApiError.unauthenticated()

    /*
      閲覧者から見た状態はサーバーで決める。
      「参加できるか」の判定は認可と同じ規則に依存するので、
      画面側で再実装すると必ずずれる。
    */
    return serializeEventDetail(event, {
      isAuthenticated: Boolean(session),
      isOrganizer,
      canCancel,
      userId: session?.user.id ?? null,
      isEligible,
      ineligibleReason: explainIneligibility(userPlatform, userServer, platformSettings),
    })
  },
})

export const PUT = defineRoute({
  auth: 'required',
  params: eventIdParam,
  // 入力の検証は eventFormSchema（画面と同じ定義）に任せる
  body: eventFormSchema,
  guard: requireEventOrganizer('編集'),
  handler: async ({ params, body, session }) => {
    const id = params.id
    const {
      startDate,
      maxParticipants,
      isAllowedForFediverse,
      isAllowedForDiscord,
      isAllowedForTwitter,
      allowedFediverseServers,
      terms,
      allowParticipationRequest,
      organizationId,
      optionGroups,
    } = body

    // イベントの存在確認と作成者チェック、参加者情報取得（プラットフォーム・サーバー判別用）
    const existingEvent = await prisma.event.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: {
              select: {
                platform: true,
                server: true,
              }
            }
          }
        }
      }
    })

    if (!existingEvent) throw ApiError.notFound('イベントが見つかりません')

    // 中止状態のイベントは編集不可
    if (existingEvent.status === 'cancelled') {
      throw ApiError.conflict('中止されたイベントは編集できません')
    }

    /*
      開催日を現在設定されている日付より前に変更できないようにバリデーション。
      **JST の日付どうしで比べる**（どちらも `YYYY-MM-DD` なので文字列のまま
      大小が付く）。以前は両方を `setHours(0, 0, 0, 0)` でサーバーのローカル
      時刻の0時に丸めていて、旧形式の行（JST 0時 = 前日の 15:00Z）は本番で
      前日に丸まり、1日前へ動かす編集が通っていた。
    */
    if (startDate && startDate < jstDay(existingEvent.startDate)) {
      throw ApiError.validation('イベント開催日を現在設定されている日付より前に変更することはできません')
    }

    /*
      参加規約は、登録した人が1人もいないうちだけ足したり書き換えたり
      できる。**削除だけは通す**（規則と理由は `isAllowedEventTermsChange`）。

      **黙って捨てない。** 以前は「既存が空のときだけ書く」として、
      それ以外は body の terms を無視していた。画面が欄を読み取り専用に
      しているので普段は届かないが、届いたときに何も言わずに保存した顔を
      するのは、書き換えたつもりの主催者を裏切る。

      値が変わっていなければ通す — 編集画面は読み取り専用の欄でも
      同じ値を送り返してくるので、ここで弾くと**規約のあるイベントが
      何ひとつ編集できなくなる**。
    */
    const nextTerms = terms || null
    if (
      !isAllowedEventTermsChange(existingEvent.participants.map((p) => p.status), {
        from: existingEvent.terms,
        to: nextTerms,
      })
    ) {
      throw ApiError.conflict('参加登録した人がいるため、参加規約は変更できません')
    }

    // 最大参加者数のバリデーション
    if (maxParticipants) {
      const attendingParticipants = existingEvent.participants.filter(p => p.status === 'attending').length
      if (maxParticipants < attendingParticipants) {
        throw ApiError.validation(`最大参加者数は現在の参加者数（${attendingParticipants}人）以上に設定してください`)
      }
    }

    // プラットフォーム・サーバー制限変更のバリデーション
    // 全参加者（ステータス問わず）を保護対象とする
    const allParticipants = existingEvent.participants

    // Fediverse無効化のチェック
    if (existingEvent.isAllowedForFediverse && isAllowedForFediverse === false) {
      const fediverseParticipants = allParticipants.filter(p =>
        ['mastodon', 'misskey', 'pleroma'].includes(p.user.platform || '')
      )
      if (fediverseParticipants.length > 0) {
        throw ApiError.validation('Fediverseの参加者がいるため、Fediverseを無効化できません')
      }
    }

    // Discord無効化のチェック
    if (existingEvent.isAllowedForDiscord && isAllowedForDiscord === false) {
      const discordParticipants = allParticipants.filter(p => p.user.platform === 'discord')
      if (discordParticipants.length > 0) {
        throw ApiError.validation('Discordの参加者がいるため、Discordを無効化できません')
      }
    }

    // Twitter無効化のチェック
    if (existingEvent.isAllowedForTwitter && isAllowedForTwitter === false) {
      const twitterParticipants = allParticipants.filter(p => p.user.platform === 'twitter')
      if (twitterParticipants.length > 0) {
        throw ApiError.validation('X (Twitter) の参加者がいるため、X (Twitter) を無効化できません')
      }
    }

    // サーバー制限変更のバリデーション
    const newAllowedServers: string[] = allowedFediverseServers || []
    if (newAllowedServers.length > 0) {
      // サーバー制限がある場合、全Fediverse参加者のサーバーが許可リストに含まれているかチェック
      const fediverseParticipants = allParticipants.filter(p =>
        ['mastodon', 'misskey', 'pleroma'].includes(p.user.platform || '')
      )
      const participantServers = [...new Set(fediverseParticipants.map(p => p.user.server).filter(Boolean))]
      const missingServers = participantServers.filter(server => !newAllowedServers.includes(server as string))

      if (missingServers.length > 0) {
        throw ApiError.validation(`以下のサーバーの参加者がいるため、サーバー制限から除外できません: ${missingServers.join(', ')}`)
      }
    }

    /*
      **グループ（主催の名義）を変えられるのは作成者だけ**（`canChangeOrganization`）。
      幹事やスタッフに許すと、自分のグループへ付け替えて中止の権限を取れる。
      空文字と null はどちらも「グループなし」なので、比べる前に揃える。
    */
    if (organizationId !== undefined && (organizationId || null) !== existingEvent.organizationId) {
      if (!canChangeOrganization(existingEvent.creatorId, session.user.id)) {
        throw ApiError.forbidden('グループを変えられるのは作成者だけです')
      }
      if (organizationId && !(await checkOrgAdminPermission(organizationId, session.user.id))) {
        throw ApiError.forbidden('指定された組織の管理者ではないため、この組織にイベントを紐付けることができません')
      }
    }

    /*
      **何が変わったかを、書き換える前に数える。**

      編集はすべて参加者に知らせるが、**何も変わっていない保存だけは止める** —
      編集画面は開いて保存すると全項目を送り返してくるので、これが無いと
      開くたびに全参加者へ飛ぶ（`event-notify-fields.ts` の説明）。

      選択肢は別テーブルなので、更新のトランザクションに入る前に読む。
    */
    const existingGroups = await prisma.eventOptionGroup.findMany({
      where: { eventId: id },
      select: {
        title: true,
        responseType: true,
        options: { select: { name: true, maxParticipants: true }, orderBy: { displayOrder: 'asc' } },
      },
      orderBy: { displayOrder: 'asc' },
    })

    const notifiableChanges = notifiableEventChanges(
      {
        columns: existingEvent,
        optionGroups: existingGroups,
        extras: {
          terms: existingEvent.terms,
          isAllowedForFediverse: existingEvent.isAllowedForFediverse,
          isAllowedForDiscord: existingEvent.isAllowedForDiscord,
          isAllowedForTwitter: existingEvent.isAllowedForTwitter,
          // 保存形（プラットフォーム情報つきJSON）ではなく、名前の集合で比べる
          allowedServers: existingEvent.allowedFediverseServers
            ? extractServerNamesFromAllowedServers(
                JSON.parse(existingEvent.allowedFediverseServers)
              )
            : [],
          organizationId: existingEvent.organizationId,
        },
      },
      {
        columns: eventColumnsFromForm(body),
        optionGroups: optionGroups ?? [],
        // 下の update が実際に書く値と揃えること
        extras: {
          terms: nextTerms,
          isAllowedForFediverse: isAllowedForFediverse ?? existingEvent.isAllowedForFediverse,
          isAllowedForDiscord: isAllowedForDiscord ?? existingEvent.isAllowedForDiscord,
          isAllowedForTwitter: isAllowedForTwitter ?? existingEvent.isAllowedForTwitter,
          allowedServers: newAllowedServers,
          organizationId:
            organizationId !== undefined
              ? organizationId || null
              : existingEvent.organizationId,
        },
      }
    )

    /*
      参加リクエストの受け付けをやめると、既存のリクエストが一括で
      キャンセルされる（下のトランザクション）。**この人たちに届くのは
      「イベントが編集されました」ではない** — 本人の回答が判断された
      わけではないので、受け付けをやめたことをそのまま知らせる。
    */
    const closedRequestUserIds =
      existingEvent.allowParticipationRequest && allowParticipationRequest === false
        ? existingEvent.participants
            .filter((p) => p.status === 'participation_request')
            .map((p) => p.userId)
        : []

    // allowedFediverseServers の処理（新形式でプラットフォーム情報付きで保存）
    // 参加者チェックは先に実施済みなので、ここでは単純に更新する
    const computeAllowedFediverseServers = async (): Promise<{ allowedFediverseServers: string }> => {
      if (newAllowedServers.length > 0) {
        // 新形式でプラットフォーム情報を付与して保存
        const enrichedServers = await enrichServersWithPlatform(newAllowedServers)
        return { allowedFediverseServers: JSON.stringify(enrichedServers) }
      }
      // サーバー制限なしの場合は空の配列
      return { allowedFediverseServers: JSON.stringify([]) }
    }

    const allowedFediverseServersUpdate = await computeAllowedFediverseServers()

    await prisma.$transaction(async (tx) => {
      // allowParticipationRequestをfalseに変更した場合、
      // 既存の参加リクエストを主催者キャンセルに変更
      if (existingEvent.allowParticipationRequest && allowParticipationRequest === false) {
        await tx.eventParticipant.updateMany({
          where: {
            eventId: id,
            status: 'participation_request'
          },
          data: {
            status: 'cancelled',
            cancellationReason: 'admin_cancelled',
            updatedAt: new Date()
          }
        })
      }

      // イベントを更新。共通の写し取りは POST と同じ関数を通す
      await tx.event.update({
        where: { id },
        data: {
          ...eventColumnsFromForm(body),
          // プラットフォーム（参加者チェック済み）
          isAllowedForFediverse: isAllowedForFediverse ?? existingEvent.isAllowedForFediverse,
          isAllowedForDiscord: isAllowedForDiscord ?? existingEvent.isAllowedForDiscord,
          isAllowedForTwitter: isAllowedForTwitter ?? existingEvent.isAllowedForTwitter,
          // 新形式でプラットフォーム情報付きで保存（参加者チェック済み）
          ...allowedFediverseServersUpdate,
          // 変えられるかは上で確かめた
          terms: nextTerms,
          ...(organizationId !== undefined ? { organizationId: organizationId || null } : {}),
        },
      })

      // 既存のグループとオプションを取得
      const existingGroups = await tx.eventOptionGroup.findMany({
        where: { eventId: id },
        include: {
          options: {
            orderBy: { displayOrder: 'asc' }
          }
        },
        orderBy: { displayOrder: 'asc' }
      })

      // displayOrderをキーとした既存データのマップを作成
      const existingGroupMap = new Map<number, EventOptionGroupWithOptions>()
      const existingOptionMaps = new Map<string, Map<number, EventOption>>()

      for (const group of existingGroups) {
        existingGroupMap.set(group.displayOrder, group)
        const optionMap = new Map<number, EventOption>()
        for (const option of group.options) {
          optionMap.set(option.displayOrder, option)
        }
        existingOptionMaps.set(group.id, optionMap)
      }

      // オプショングループを更新/作成/削除
      if (optionGroups && optionGroups.length > 0) {
        const processedGroupOrders = new Set<number>()
        
        // 並び順は配列の順そのもの。**画面は displayOrder を送らない**ので、
        // 既存グループとの突き合わせも順番で行う
        for (const [groupOrder, group] of optionGroups.entries()) {
          processedGroupOrders.add(groupOrder)
          const existingGroup = existingGroupMap.get(groupOrder)
          
          let groupId: string
          if (existingGroup) {
            // 既存グループを更新
            await tx.eventOptionGroup.update({
              where: { id: existingGroup.id },
              data: {
                title: group.title,
                responseType: group.responseType,
                displayOrder: groupOrder,
              },
            })
            groupId = existingGroup.id
          } else {
            // 新規グループを作成
            const createdGroup = await tx.eventOptionGroup.create({
              data: {
                eventId: id,
                title: group.title,
                responseType: group.responseType,
                displayOrder: groupOrder,
              },
            })
            groupId = createdGroup.id
          }

          // オプションを更新/作成/削除
          if (group.options && group.options.length > 0) {
            const processedOptionOrders = new Set<number>()
            const existingOptionMap = (existingGroup?.id && existingOptionMaps.get(existingGroup.id)) || new Map()
            
            for (const [index, option] of group.options.entries()) {
              const displayOrder = index
              processedOptionOrders.add(displayOrder)
              const existingOption = existingOptionMap.get(displayOrder)
              
              if (existingOption) {
                // 既存オプションを更新
                await tx.eventOption.update({
                  where: { id: existingOption.id },
                  data: {
                    name: option.name,
                    maxParticipants: option.maxParticipants || null,
                    displayOrder: displayOrder,
                  },
                })
              } else {
                // 新規オプションを作成
                await tx.eventOption.create({
                  data: {
                    eventId: id,
                    groupId: groupId,
                    name: option.name,
                    maxParticipants: option.maxParticipants || null,
                    displayOrder: displayOrder,
                  },
                })
              }
            }
            
            // 削除されたオプションを除去
            if (existingGroup) {
              for (const [displayOrder, existingOption] of existingOptionMap.entries()) {
                if (!processedOptionOrders.has(displayOrder)) {
                  await tx.eventOption.delete({
                    where: { id: existingOption.id },
                  })
                }
              }
            }
          } else if (existingGroup) {
            // グループからすべてのオプションを削除
            await tx.eventOption.deleteMany({
              where: { groupId: existingGroup.id },
            })
          }
        }
        
        // 削除されたグループを除去
        for (const [displayOrder, existingGroup] of existingGroupMap.entries()) {
          if (!processedGroupOrders.has(displayOrder)) {
            await tx.eventOptionGroup.delete({
              where: { id: existingGroup.id },
            })
          }
        }
      } else {
        // オプショングループがすべて削除された場合
        await tx.eventOption.deleteMany({
          where: { eventId: id },
        })
        await tx.eventOptionGroup.deleteMany({
          where: { eventId: id },
        })
      }

    })

    // 更新されたイベントを詳細情報と一緒に取得
    const eventWithDetails = await prisma.event.findUnique({
      where: { id },
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
            groupSelections: {
              include: { options: { include: { option: true } } },
            },
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

    notifyAfter('event.update', async () => {
      const target = { id, title: body.title }
      /*
        受け付けをやめられた人は、この時点でキャンセル済み。
        `notifyEventUpdated` の宛先（回答を出している人）から自然に外れる。
      */
      await notifyEventUpdated(target, notifiableChanges, session.user.id)
      if (closedRequestUserIds.length > 0) {
        await notifyParticipationRequestsClosed(target, closedRequestUserIds, session.user.id)
      }
    })

    return eventWithDetails
  },
})

/*
  **イベントの削除は用意しない。** 参加者の記録ごと消えるため（cascade）。
  受付を閉じたいだけなら中止（`cancel`）で足りる — 記録は残り、
  連絡・出欠の記録・CSV出力は続けられる。管理者が止める手段は
  `admin/events/[id]/disable` にある。
*/