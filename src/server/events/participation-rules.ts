import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { eventDeadlineAt } from '@/lib/event-datetime'
import { explainIneligibility } from '@/lib/participation-utils'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/server/http/errors'

/**
 * 参加登録（作成）と参加内容の変更が共有する規則。
 *
 * **以前は POST と PUT がそれぞれ同じ判定を書き写していて、食い違っていた。**
 * POST にあるサーバー限定の判定が PUT に無く、キャンセルしたあとに主催者が
 * サーバーを絞っても、PUT で参加へ戻せた。片方だけ直る形を残さないために、
 * 両方がここを通す。
 *
 * 規約への同意と状態の遷移はここに無い。作成と変更で前提が違う
 * （変更には「すでに同意した記録」と「いまの状態」がある）ので、ルートに残す。
 */

/** 席を取りうる状態。規約への同意と、参加できる人かの判定はこの状態にだけ要る */
const ACTIVE_STATUSES = ['attending', 'maybe', 'participation_request']

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.includes(status)
}

/**
 * 参加登録の対象になるイベントを引く。無い・中止なら通さない。
 *
 * **無効化はここでは見ない。** ルートが `guard: requireVisibleEvent()` で
 * 先に止める（`http/disabled.guard.test.ts` がルートごとに走査している。
 * ここへ隠すと、どのルートが見ているのかが走査から読めなくなる）。
 *
 * **参加者の配列は読まない。** 以前は満員かどうかを数えるために全員の
 * 全列を読んでいた。数えるのは席を取る直前、ロックの中でやる（`assertSeatAvailable`）。
 */
export async function loadEventForParticipation(id: string) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      // 回答の突き合わせに要る。**このイベントに無いグループ・選択肢は捨てる**
      optionGroups: {
        select: {
          id: true,
          responseType: true,
          options: { select: { id: true, name: true, maxParticipants: true } },
        },
      },
    },
  })

  if (!event) throw ApiError.notFound('イベントが見つかりません')

  if (event.status === 'cancelled') {
    throw ApiError.validation('このイベントは中止されています')
  }
  return event
}

/**
 * その状態をいま受け付けているか（未定・参加リクエストの可否と締切）。
 *
 * **「未定」を受け付けないイベントには、未定で登録させない。** 画面は
 * 選択肢を出さないだけなので、API を直接叩けば通っていた。ただし
 * **すでに未定の人がそのまま内容を直すのは止めない**（`current`）。
 * あとから主催者が設定を変えても、画面は今の状態を選べるように並べる。
 *
 * **締切後は利用者側から状態を動かせない。** 締切を過ぎた「未定」は
 * auto-cancel-maybe が自動でキャンセルにする（services/auto-cancel-maybe.ts）。
 * 手で変えられるようにすると、自動処理と食い違って人数が揺れる。
 * 参加リクエストだけは締切の対象外。管理者にも締切を適用する。
 *
 * 締切の瞬間は画面の表示・自動キャンセルと同じ式で読む（`lib/event-datetime.ts`）。
 */
export function assertStatusAccepted(
  event: {
    allowMaybe: boolean
    allowParticipationRequest: boolean
    registrationDeadlineDate: Date | null
    registrationDeadlineTime: string | null
  },
  status: string,
  { current = null, now = new Date() }: { current?: string | null; now?: Date } = {}
): void {
  if (status === 'maybe' && !event.allowMaybe && current !== 'maybe') {
    throw ApiError.validation('このイベントは「未定」を受け付けていません')
  }

  if (status === 'participation_request') {
    if (!event.allowParticipationRequest) {
      throw ApiError.validation('このイベントは参加リクエストを受け付けていません')
    }
    return
  }

  const deadline = eventDeadlineAt(event.registrationDeadlineDate, event.registrationDeadlineTime)
  if (deadline && now > deadline) {
    throw ApiError.validation('参加登録の期限を過ぎています')
  }
}

const PLATFORM_REFUSAL: Record<string, string> = {
  mastodon: 'Fediverseアカウントでの参加は許可されていません',
  misskey: 'Fediverseアカウントでの参加は許可されていません',
  pleroma: 'Fediverseアカウントでの参加は許可されていません',
  discord: 'Discordアカウントでの参加は許可されていません',
  twitter: 'X (Twitter) アカウントでの参加は許可されていません',
}

/**
 * このイベントに参加できる人か（プラットフォームと Fediverse のサーバー限定）。
 *
 * 判定は画面と同じ関数に任せる（`explainIneligibility`）。ここで書き直すと、
 * 「画面では参加できると出ているのに送ると断られる」が起きる。
 * サーバーは `session.user.server` で見る。email から切り出さない
 * （username に @ が含まれると壊れる）。
 */
export function assertEligible(
  event: {
    isAllowedForFediverse: boolean
    isAllowedForDiscord: boolean
    isAllowedForTwitter: boolean
    allowedFediverseServers: string | null
  },
  user: { platform: string; server: string }
): void {
  const reason = explainIneligibility(user.platform, user.server, event)
  if (reason === 'server') {
    throw ApiError.forbidden('あなたのサーバーからはこのイベントに参加できません')
  }
  if (reason === 'platform') {
    throw ApiError.forbidden(PLATFORM_REFUSAL[user.platform] ?? '未対応のプラットフォームです')
  }
}

/**
 * 定員を数え終わるまで、このイベントの席を他のトランザクションに取らせない。
 * いまの定員を返す（無制限なら null）。
 *
 * **数えてから書くまでのあいだを塞ぐ。** 以前は満員かどうかをトランザクションの
 * 外で数えていたので、最後の1席に同時に来た2人が両方とも「空いている」と
 * 判定されて定員を超えた。イベントの行をロックすれば、2人目は1人目が
 * 書き終わるまで待ち、書かれたあとの人数を数える。
 *
 * 定員もロックの中で読み直す。承認が定員を増やすことがある
 * （`participants/[userId]` の approve）。
 */
export async function lockEventSeats(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<number | null> {
  await tx.$queryRaw`SELECT 1 FROM "events" WHERE "id" = ${eventId} FOR UPDATE`
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: { maxParticipants: true },
  })
  return event?.maxParticipants ?? null
}

/**
 * 「参加」の席が空いているか。**トランザクションの中で、書く直前に呼ぶ。**
 * 本人の行は数えない（参加中の人がコメントだけ直すときに満員で弾かない）。
 */
export async function assertSeatAvailable(
  tx: Prisma.TransactionClient,
  eventId: string,
  userId: string
): Promise<void> {
  const maxParticipants = await lockEventSeats(tx, eventId)
  if (!maxParticipants) return

  const attending = await tx.eventParticipant.count({
    where: { eventId, status: 'attending', userId: { not: userId } },
  })
  if (attending >= maxParticipants) {
    throw ApiError.validation('このイベントは満員です')
  }
}

/** 選択肢の席を取る状態。画面の残席（`serializers/event.ts` の takenByOption）と同じ */
const OPTION_SEAT_STATUSES = ['attending', 'maybe']

/**
 * 選んだ選択肢に席が残っているか。**トランザクションの中で、書く直前に呼ぶ。**
 *
 * 画面は満席の選択肢を押せなくしているだけなので、API を直接叩けば
 * 定員を超えて選べた。イベントの席と同じく、行をロックしてから数える。
 *
 * - 本人の行は数えない（同じ選択肢のまま内容を直すときに満席で弾かない）
 * - **すでに選んでいた選択肢は通す**（`kept`）。あとから主催者が定員を
 *   減らしても、選んでいた人を外さない。画面も「解除はできる」にしている
 */
export async function assertOptionSeatsAvailable(
  tx: Prisma.TransactionClient,
  input: {
    eventId: string
    userId: string
    status: string
    groups: { options: { id: string; name: string; maxParticipants: number | null }[] }[]
    chosenOptionIds: string[]
    kept: ReadonlySet<string>
  }
): Promise<void> {
  if (!OPTION_SEAT_STATUSES.includes(input.status)) return

  const limited = new Map(
    input.groups
      .flatMap((g) => g.options)
      .filter((o) => o.maxParticipants != null)
      .map((o) => [o.id, o] as const)
  )
  const toCheck = input.chosenOptionIds.filter((id) => limited.has(id) && !input.kept.has(id))
  if (toCheck.length === 0) return

  await lockEventSeats(tx, input.eventId)

  for (const optionId of toCheck) {
    const option = limited.get(optionId)!
    const taken = await tx.participantGroupOption.count({
      where: {
        optionId,
        selection: {
          participant: {
            eventId: input.eventId,
            status: { in: OPTION_SEAT_STATUSES },
            userId: { not: input.userId },
          },
        },
      },
    })
    if (taken >= option.maxParticipants!) {
      throw ApiError.validation(`「${option.name}」は満席です`)
    }
  }
}

/** 登録・変更のあとに返す形。作成と変更で同じものを返す */
export const PARTICIPATION_DETAIL_INCLUDE = {
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
  event: {
    select: {
      id: true,
      title: true,
    },
  },
  groupSelections: {
    include: {
      group: {
        select: {
          id: true,
          title: true,
          responseType: true,
          displayOrder: true,
        },
      },
      options: {
        include: {
          option: {
            select: {
              id: true,
              name: true,
              maxParticipants: true,
              displayOrder: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.EventParticipantInclude
