import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins, requireVisiblePreEvent } from '@/server/http/guards'
import { created } from '@/server/http/response'
import { preEventIdParam, respondPreEventBody } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'
import { extractServerNamesFromAllowedServers } from '@/lib/participation-utils'
import { answerSignature } from '@/server/pre-events/answer-signature'
import { notifyAfter, notifyPreEventAnswered } from '@/server/notifications/notify'

// 日程調整の回答入力型
interface DateOptionResponse {
  dateOptionId: string
  status: string
}

/**
 * 締切を過ぎたら、回答を足すことも消すこともできない。
 *
 * **画面は締切後に操作を出さない**（`resolvePreEventActionState` の `closed`）が、
 * こちらは見ていなかったので、API を直に叩けば締切後も回答を動かせた。
 * 主催者は締切の時点の集計で日程を決めるので、そのあとで数字が動くと困る。
 *
 * **幹事も例外にしない。** 回答者としての操作は一般の回答者と同じ判定
 * （画面も `selfState` で同じ扱いにしている）。締切を延ばしたければ編集から。
 *
 * 列は日付と時刻を1つに持つ本物の瞬間なので、そのまま比べる。
 */
function assertAnswersOpen(preEvent: { registrationDeadline: Date | null }, now = new Date()) {
  if (preEvent.registrationDeadline && preEvent.registrationDeadline < now) {
    throw ApiError.validation('回答の受付は終了しました')
  }
}

// 参加状況取得
export const GET = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  guard: requireVisiblePreEvent(),
  handler: async ({ params, session }) => {
    const id = params.id
    const participants = await prisma.preEventParticipant.findMany({
      where: {
        preEventId: id,
        userId: session.user.id
      },
      include: {
        dateOption: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
          },
        }
      }
    })

    // エンベロープは defineRoute が付ける。素の NextResponse を返すと素通りする
    return participants
  },
})

// 参加回答登録・更新
export const POST = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  body: respondPreEventBody,
  handler: async ({ params, body, session }) => {
    const id = params.id
    const { responses, comment, autoRegisterWhenPromoted } = body

    // 日程調整の存在確認
    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      include: {
        dateOptions: {
          select: { id: true },
        }
      }
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }
    await hideDisabledFromNonAdmins(preEvent.isDisabled, session, '日程調整が見つかりません')
    assertAnswersOpen(preEvent)

    // プラットフォーム許可チェック
    const userPlatform = session.user.platform
    const isFediverseUser = ['mastodon', 'misskey', 'pleroma'].includes(userPlatform)
    const isDiscordUser = userPlatform === 'discord'
    const isTwitterUser = userPlatform === 'twitter'

    if (isFediverseUser && !preEvent.isAllowedForFediverse) {
      throw ApiError.forbidden('Fediverseアカウントでの参加は許可されていません')
    }
    if (isDiscordUser && !preEvent.isAllowedForDiscord) {
      throw ApiError.forbidden('Discordアカウントでの参加は許可されていません')
    }
    if (isTwitterUser && !preEvent.isAllowedForTwitter) {
      throw ApiError.forbidden('X (Twitter) アカウントでの参加は許可されていません')
    }
    if (!isFediverseUser && !isDiscordUser && !isTwitterUser) {
      throw ApiError.forbidden('未対応のプラットフォームです')
    }

    // Fediverseサーバー制限チェック
    if (isFediverseUser && preEvent.allowedFediverseServers) {
      const serverNames = extractServerNamesFromAllowedServers(JSON.parse(preEvent.allowedFediverseServers))
      // email から切り出さない。username に @ が含まれると壊れる
      const userServer = session.user.server
      if (serverNames.length > 0 && (!userServer || !serverNames.includes(userServer))) {
        throw ApiError.forbidden('あなたのサーバーからは参加できません')
      }
    }

    // バリデーション
    if (!responses || !Array.isArray(responses)) {
      throw ApiError.validation('回答データが無効です')
    }

    // 有効な候補日時IDかチェック
    const validDateOptionIds = preEvent.dateOptions.map(option => option.id)
    for (const response of responses) {
      if (!validDateOptionIds.includes(response.dateOptionId)) {
        throw ApiError.validation('無効な候補日時が含まれています')
      }
      if (!['available', 'maybe', 'unavailable'].includes(response.status)) {
        throw ApiError.validation('無効な参加状況です')
      }
    }

    // 自動登録オプションのチェック
    if (autoRegisterWhenPromoted && !preEvent.allowAutoRegistration) {
      throw ApiError.validation('自動登録機能が許可されていません')
    }

    /*
      **消す前に読む。** 回答は毎回「総入れ替え」で保存されるので、
      書き込んだ結果からは新しく答えたのか、開いて同じ内容で保存し直した
      だけなのかが分からない。署名を比べれば、中身が変わっていない保存で
      主催者に通知が飛ぶのを防げる。
    */
    const before = await prisma.preEventParticipant.findMany({
      where: { preEventId: id, userId: session.user.id },
      select: {
        dateOptionId: true,
        status: true,
        comment: true,
        autoRegisterWhenPromoted: true,
      },
    })

    // 既存の回答を削除
    await prisma.preEventParticipant.deleteMany({
      where: {
        preEventId: id,
        userId: session.user.id
      }
    })

    // 新しい回答を作成
    const _participants = await prisma.preEventParticipant.createMany({
      data: responses.map((response: DateOptionResponse) => ({
        preEventId: id,
        userId: session.user.id,
        dateOptionId: response.dateOptionId,
        status: response.status,
        comment: comment?.trim() || null,
        autoRegisterWhenPromoted: autoRegisterWhenPromoted && preEvent.allowAutoRegistration
      }))
    })

    // 作成された回答を取得して返す
    const createdParticipants = await prisma.preEventParticipant.findMany({
      where: {
        preEventId: id,
        userId: session.user.id
      },
      include: {
        dateOption: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
          },
        },
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
      }
    })

    const changed =
      answerSignature(before) !==
      answerSignature(
        createdParticipants.map((p) => ({
          dateOptionId: p.dateOptionId,
          status: p.status,
          comment: p.comment,
          autoRegisterWhenPromoted: p.autoRegisterWhenPromoted,
        }))
      )

    if (changed) {
      notifyAfter('pre-event.answer', () =>
        notifyPreEventAnswered({ id, title: preEvent.title }, session.user.id)
      )
    }

    return created(createdParticipants)
  },
})

// 参加回答削除
export const DELETE = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  handler: async ({ params, session }) => {
    const id = params.id
    // 日程調整の存在確認
    const preEvent = await prisma.preEvent.findUnique({
      where: { id }
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }
    await hideDisabledFromNonAdmins(preEvent.isDisabled, session, '日程調整が見つかりません')
    assertAnswersOpen(preEvent)

    // 既存の回答を削除
    await prisma.preEventParticipant.deleteMany({
      where: {
        preEventId: id,
        userId: session.user.id
      }
    })

    /*
      **`message` を成功応答に載せない。** 画面向けの文言は `message`、
      機械可読は `code` という取り決めはエラー側のもので、成功側に
      文字列を置くと画面がそれを読み始める（CLAUDE.md の API 契約）。
    */
    return { id }
  },
})