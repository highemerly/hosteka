
import { isAllowedPreEventTermsChange } from '@/lib/event-terms'
import { canChangeOrganization } from '@/lib/status-transition'
import { checkPreEventOrganizerPermission, checkPreEventOwnerPermission } from '@/lib/permissions'
import { defineRoute } from '@/server/http/define-route'
import { ok } from '@/server/http/response'
import { ApiError } from '@/server/http/errors'
import {
  hideDisabledFromNonAdmins,
  requirePreEventOrganizer,
  requirePreEventOwner,
} from '@/server/http/guards'
import { preEventIdParam, preEventPayloadSchema } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'

import { enrichServersWithPlatform } from '@/lib/instance-platform'
import { extractServerNamesFromAllowedServers } from '@/lib/participation-utils'
import {
  PRE_EVENT_DETAIL_SELECT,
  preEventViewer,
} from '@/server/queries/pre-event-detail'
import { serializePreEventDetail } from '@/server/serializers/pre-event'
import { notifiablePreEventChanges } from '@/server/pre-events/pre-event-change'
import { assertNotPromoted } from '@/server/pre-events/promotion'
import {
  notifyAfter,
  notifyPreEventDeleted,
  notifyPreEventUpdated,
} from '@/server/notifications/notify'

// 日程調整詳細取得
export const GET = defineRoute({
  auth: 'optional',
  params: preEventIdParam,
  handler: async ({ params, session }) => {
    const id = params.id
    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      // 無効化の判定にだけ使う。DTO には載せない（シリアライザが拾わない）
      select: { ...PRE_EVENT_DETAIL_SELECT, isDisabled: true },
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }
    await hideDisabledFromNonAdmins(preEvent.isDisabled, session, '日程調整が見つかりません')

    const isOrganizer = session
      ? await checkPreEventOrganizerPermission(id, session.user.id)
      : false
    // スタッフは編集できるが削除はできない。幹事メニューから項目を外すのに使う
    const canDelete =
      session && isOrganizer ? await checkPreEventOwnerPermission(id, session.user.id) : false

    /*
      閲覧者から見た状態はサーバーで決める。
      「回答できるか」の判定は認可と同じ規則に依存するので、
      画面側で再実装すると必ずずれる。
    */
    const viewer = preEventViewer(preEvent, session, isOrganizer, canDelete)

    /*
      非公開の日程調整は、ログインしている人だけが開ける。

      **回答できるかどうかでは絞らない。** 以前は回答できるプラットフォームの
      条件（`isEligible`）まで見ていたが、設定の名前（「ログインユーザーのみが
      閲覧できるようにする」）と食い違っていた。**見えるかどうかと回答できる
      かどうかは別の設定**で、混ぜると主催者が閉じたつもりのない範囲まで閉じる
      （イベント側の GET と同じ規則）。
    */
    if (!preEvent.isPublic && !session) throw ApiError.unauthenticated()

    return serializePreEventDetail(preEvent, viewer)
  },
})

// 日程調整更新（主催者または組織管理者のみ）
export const PUT = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  body: preEventPayloadSchema,
  guard: requirePreEventOrganizer('編集'),
  handler: async ({ params, body, session }) => {
    const id = params.id

    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      select: {
        creatorId: true,
        allowedFediverseServers: true,
        organizationId: true,
        isAllowedForFediverse: true,
        isAllowedForDiscord: true,
        isAllowedForTwitter: true,
        // 規約を書き換えようとしているかの判定に使う（下の nextTerms を参照）
        terms: true,
        // ここから下は、何が変わったかを数えるために読む
        title: true,
        description: true,
        location: true,
        fee: true,
        relatedUrl: true,
        registrationDeadline: true,
        allowAutoRegistration: true,
        isPublic: true,
        isHighlighted: true,
        promotedAt: true,
      }
    })

    // 参加者情報を取得（プラットフォーム・サーバー判別用）
    const allParticipantsRaw = await prisma.preEventParticipant.findMany({
      where: { preEventId: id },
      include: {
        user: {
          select: {
            platform: true,
            server: true,
          }
        }
      },
      distinct: ['userId'], // ユーザーごとに1件のみ取得
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }
    assertNotPromoted(preEvent)

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

    /*
      **グループ（主催の名義）を変えられるのは作成者だけ**（`canChangeOrganization`）。
      スタッフに許すと、自分のグループへ付け替えて削除の権限を取れる。
      空文字と null はどちらも「グループなし」なので、比べる前に揃える。
    */
    let newOrganizationId = preEvent.organizationId
    if (organizationId !== undefined && (organizationId || null) !== preEvent.organizationId) {
      if (!canChangeOrganization(preEvent.creatorId, session.user.id)) {
        throw ApiError.forbidden('グループを変えられるのは作成者だけです')
      }
      if (organizationId) {
        // 新しい組織の管理者かチェック
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
      newOrganizationId = organizationId || null
    }

    // プラットフォーム・サーバー制限変更のバリデーション
    // 全参加者（ステータス問わず）を保護対象とする

    // Fediverse無効化のチェック
    if (preEvent.isAllowedForFediverse && isAllowedForFediverse === false) {
      const fediverseParticipants = allParticipantsRaw.filter(p =>
        ['mastodon', 'misskey', 'pleroma'].includes(p.user.platform || '')
      )
      if (fediverseParticipants.length > 0) {
        throw ApiError.validation('Fediverseの回答者がいるため、Fediverseを無効化できません')
      }
    }

    // Discord無効化のチェック
    if (preEvent.isAllowedForDiscord && isAllowedForDiscord === false) {
      const discordParticipants = allParticipantsRaw.filter(p => p.user.platform === 'discord')
      if (discordParticipants.length > 0) {
        throw ApiError.validation('Discordの回答者がいるため、Discordを無効化できません')
      }
    }

    // Twitter無効化のチェック
    if (preEvent.isAllowedForTwitter && isAllowedForTwitter === false) {
      const twitterParticipants = allParticipantsRaw.filter(p => p.user.platform === 'twitter')
      if (twitterParticipants.length > 0) {
        throw ApiError.validation('X (Twitter) の回答者がいるため、X (Twitter) を無効化できません')
      }
    }

    // サーバー制限変更のバリデーション
    const newAllowedServers: string[] = allowedFediverseServers || []
    if (newAllowedServers.length > 0) {
      // サーバー制限がある場合、全Fediverse参加者のサーバーが許可リストに含まれているかチェック
      const fediverseParticipants = allParticipantsRaw.filter(p =>
        ['mastodon', 'misskey', 'pleroma'].includes(p.user.platform || '')
      )
      const participantServers = [...new Set(fediverseParticipants.map(p => p.user.server).filter(Boolean))]
      const missingServers = participantServers.filter(server => !newAllowedServers.includes(server as string))

      if (missingServers.length > 0) {
        throw ApiError.validation(
          `以下のサーバーの回答者がいるため、サーバー制限から除外できません: ${missingServers.join(', ')}`
        )
      }
    }

    // 既存の候補日時を取得
    const existingDateOptions = await prisma.preEventDateOption.findMany({
      where: { preEventId: id },
      include: {
        participants: true
      }
    })


    // allowedFediverseServers の処理（新形式でプラットフォーム情報付きで保存）
    // 参加者チェックは先に実施済みなので、ここでは単純に更新する
    const computeAllowedFediverseServersUpdate = async (): Promise<{ allowedFediverseServers: string }> => {
      if (newAllowedServers.length > 0) {
        // 新形式でプラットフォーム情報を付与して保存
        const enrichedServers = await enrichServersWithPlatform(newAllowedServers)
        return { allowedFediverseServers: JSON.stringify(enrichedServers) }
      }
      // サーバー制限なしの場合は空の配列
      return { allowedFediverseServers: JSON.stringify([]) }
    }

    const allowedFediverseServersUpdate = await computeAllowedFediverseServersUpdate()

    /*
      参加規約は、回答した人が1人もいないうちだけ変えられる
      **削除だけは通す**（規則と理由は `isAllowedPreEventTermsChange`）。イベント側
      （`events/[id]` の PUT）と同じ規則で、画面も同じ判定でロックする
      （`PreEventFormScreen` の `termsLocked`）。

      **黙って捨てない。** 以前は「既存が空のときだけ書く」として、
      それ以外は body の terms を無視していた。保存した顔をして元のままに
      なるので、書き換えたつもりの主催者がそれに気づけない。

      値が変わっていなければ通す — 編集画面は読み取り専用の欄でも同じ値を
      送り返してくるので、ここで弾くと**規約のある日程調整が何ひとつ
      編集できなくなる**。
    */
    const nextTerms = terms?.trim() || null
    if (
      !isAllowedPreEventTermsChange(allParticipantsRaw.length, {
        from: preEvent.terms,
        to: nextTerms,
      })
    ) {
      throw ApiError.conflict('回答した人がいるため、参加規約は変更できません')
    }

    /*
      **何が変わったかを、書き換える前に数える。**

      編集はすべて回答者に知らせるが、**何も変わっていない保存だけは止める** —
      編集画面は開いて保存すると全項目を送り返してくるので、これが無いと
      開くたびに全回答者へ飛ぶ。
    */
    const notifiableChanges = notifiablePreEventChanges(
      {
        title: preEvent.title,
        description: preEvent.description,
        location: preEvent.location,
        fee: preEvent.fee,
        relatedUrl: preEvent.relatedUrl,
        terms: preEvent.terms,
        registrationDeadline: preEvent.registrationDeadline,
        allowAutoRegistration: preEvent.allowAutoRegistration,
        isPublic: preEvent.isPublic,
        isHighlighted: preEvent.isHighlighted,
        isAllowedForFediverse: preEvent.isAllowedForFediverse,
        isAllowedForDiscord: preEvent.isAllowedForDiscord,
        isAllowedForTwitter: preEvent.isAllowedForTwitter,
        // 保存形（プラットフォーム情報つきJSON）ではなく、名前の集合で比べる
        allowedServers: preEvent.allowedFediverseServers
          ? extractServerNamesFromAllowedServers(JSON.parse(preEvent.allowedFediverseServers))
          : [],
        organizationId: preEvent.organizationId,
        dateOptions: existingDateOptions
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((o) => ({ startDate: o.startDate, endDate: o.endDate })),
      },
      // 下の update が実際に書く値と揃えること
      {
        title: title.trim(),
        description: description?.trim() || null,
        location: location?.trim() || null,
        fee: fee?.trim() || null,
        relatedUrl: relatedUrl?.trim() || null,
        terms: nextTerms,
        registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
        allowAutoRegistration: allowAutoRegistration ?? false,
        isPublic: isPublic ?? true,
        isHighlighted: isHighlighted ?? false,
        isAllowedForFediverse: isAllowedForFediverse ?? preEvent.isAllowedForFediverse,
        isAllowedForDiscord: isAllowedForDiscord ?? preEvent.isAllowedForDiscord,
        isAllowedForTwitter: isAllowedForTwitter ?? preEvent.isAllowedForTwitter,
        allowedServers: newAllowedServers,
        organizationId: newOrganizationId,
        dateOptions: dateOptions.map((o) => ({
          startDate: new Date(o.startDate),
          endDate: o.endDate ? new Date(o.endDate) : null,
        })),
      }
    )

    // 日程調整の基本情報を更新
    const _updatedPreEvent = await prisma.preEvent.update({
      where: { id },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        location: location?.trim() || null,
        fee: fee?.trim() || null,
        relatedUrl: relatedUrl?.trim() || null,
        terms: nextTerms,
        // isAllowedForFediverse, isAllowedForDiscord, isAllowedForTwitter（参加者チェック済み）
        isAllowedForFediverse: isAllowedForFediverse ?? preEvent.isAllowedForFediverse,
        isAllowedForDiscord: isAllowedForDiscord ?? preEvent.isAllowedForDiscord,
        isAllowedForTwitter: isAllowedForTwitter ?? preEvent.isAllowedForTwitter,
        // allowedFediverseServers: 新形式でプラットフォーム情報付きで保存（参加者チェック済み）
        ...allowedFediverseServersUpdate,
        allowAutoRegistration: allowAutoRegistration ?? false,
        isPublic: isPublic ?? true,
        isHighlighted: isHighlighted ?? false,
        registrationDeadline: registrationDeadline ? new Date(registrationDeadline) : null,
        organizationId: newOrganizationId,
      }
    })

    // 候補日時の差分更新処理
    // 1. 既存の候補日時のIDを取得
    const existingIds = existingDateOptions.map(option => option.id)
    
    // 2. 新しい候補日時を作成
    const newDateOptions = []
    for (let i = 0; i < dateOptions.length; i++) {
      const option = dateOptions[i]
      const newOption = await prisma.preEventDateOption.create({
        data: {
          preEventId: id,
          startDate: new Date(option.startDate),
          endDate: option.endDate ? new Date(option.endDate) : null,
          displayOrder: i
        }
      })
      newDateOptions.push(newOption)
    }

    // 3. 既存の参加者回答を新しい候補日時にマッピング
    // 日時が完全に一致する場合は既存の回答を移行
    // ただし、同じユーザーの重複回答を防ぐため、ユーザーごとに1回だけ移行する
    const migratedUsersByNewOption = new Map<string, Set<string>>() // newOptionId -> Set of userIds

    for (const existingOption of existingDateOptions) {
      const matchingNewOption = newDateOptions.find(newOption =>
        newOption.startDate.getTime() === existingOption.startDate.getTime() &&
        ((newOption.endDate && existingOption.endDate && newOption.endDate.getTime() === existingOption.endDate.getTime()) ||
         (!newOption.endDate && !existingOption.endDate))
      )

      if (matchingNewOption && existingOption.participants.length > 0) {
        // この新しいオプションに既に移行されたユーザーを追跡
        if (!migratedUsersByNewOption.has(matchingNewOption.id)) {
          migratedUsersByNewOption.set(matchingNewOption.id, new Set())
        }
        const migratedUsers = migratedUsersByNewOption.get(matchingNewOption.id)!

        // 各参加者を個別に処理して重複を防ぐ
        for (const participant of existingOption.participants) {
          if (!migratedUsers.has(participant.userId)) {
            // まだ移行されていないユーザーのみ移行
            await prisma.preEventParticipant.update({
              where: { id: participant.id },
              data: { dateOptionId: matchingNewOption.id }
            })
            migratedUsers.add(participant.userId)
          }
          // 既に移行済みの場合は、この回答は削除される（古いオプションと一緒に）
        }
      }
    }

    // 4. 古い候補日時を削除（参加者回答は既に移行済み）
    await prisma.preEventDateOption.deleteMany({
      where: { 
        id: { in: existingIds }
      }
    })

    /*
      5. 更新後の姿を**取得と同じ形で**返す。

      取得と違う形で返すと、**同じリソースに契約が2つできる。**

      閲覧者は主催者で確定している（`auth: 'required'` ＋ ガード）。
    */
    const updated = await prisma.preEvent.findUnique({
      where: { id },
      select: PRE_EVENT_DETAIL_SELECT,
    })

    if (!updated) {
      throw ApiError.notFound('日程調整が見つかりません')
    }

    notifyAfter('pre-event.update', () =>
      notifyPreEventUpdated({ id, title: title.trim() }, notifiableChanges, session.user.id)
    )

    const canDelete = await checkPreEventOwnerPermission(id, session.user.id)
    return serializePreEventDetail(updated, preEventViewer(updated, session, true, canDelete))
  },
})

/**
 * 日程調整削除。作成者とグループの管理責任者のみ。
 * **グループのスタッフにはさせない**（編集はできるが、畳む判断は主催者のもの）
 */
export const DELETE = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  guard: requirePreEventOwner('削除'),
  handler: async ({ params, session }) => {
    const id = params.id
    // 日程調整の存在確認
    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      // title は通知の写しに使う
      select: { id: true, title: true, promotedAt: true }
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }

    /*
      **消す前に知らせる。** 回答の行が消えたあとでは宛先が引けない
      （cascade で一緒に消える）。日程調整には「中止」の状態が無いので
      （`pre_events` に status 列が無い）、取り消しは削除でしか表せない。

      `after()` ではなくここで待つ理由も同じ — 応答の後ろに回すと、
      宛先を引くころには行が無い。

      **イベントにしたあとの削除は知らせない。** 回答した人には「日程が決まった」が
      もう届いていて、そこへ「取り消されました」が来るとイベントまで無くなったように読める。
    */
    if (!preEvent.promotedAt) {
      await notifyPreEventDeleted({ id, title: preEvent.title }, session.user.id).catch((error) => {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'notify.failed',
            label: 'pre-event.delete',
            error: error instanceof Error ? error.message : String(error),
          })
        )
      })
    }

    // 日程調整削除（Cascade削除により関連データも削除される）
    await prisma.preEvent.delete({
      where: { id }
    })

    /*
      この日程調整を指す通知のうち、いま出した「取り消されました」以外を消す。
      辿る先が無くなるので、残しても押せない行が並ぶだけになる。
    */
    await prisma.notification.deleteMany({
      where: { targetType: 'pre_event', targetId: id, kind: { not: 'pre_event_deleted' } },
    })

    return ok({ id })
  },
})