import 'server-only'

import { serializeUser, type PublicUserDto } from './user'
import { parseAllowedServers, type AllowedServer } from '@/lib/allowed-servers'
import { canChangeOrganization } from '@/lib/status-transition'

/**
 * 日程調整のDTO。
 *
 * **イベントとは参加の形が違う。** イベントは「1人につき1行・5状態」だが、
 * 日程調整は「1人につき候補日の数だけ行があり、日程ごとに○/△/×」を持つ。
 * ラベルではなく形が違うので、DTOも判定も共有しない
 * （docs の §7「統合しない」の対象）。
 *
 * 共有するのは外枠だけ — カード、一覧、連絡フロー、日付の表示。
 */

/** 日程ごとの回答 */
export type PreEventVote = 'available' | 'maybe' | 'unavailable'

export type PreEventDateOptionDto = {
  id: string
  startDate: string
  endDate: string | null
  displayOrder: number
  /** 回答の内訳。○の多い日を選ぶための数字 */
  counts: { available: number; maybe: number; unavailable: number }
  /** ○と△の人だけ。×は名前を出さない（出席できない人の一覧に意味がない） */
  attendees: { user: PublicUserDto; vote: Exclude<PreEventVote, 'unavailable'> }[]
}

/**
 * 回答した人ひとり分。
 *
 * **候補日ごとの集計とは別に持つ。** 集計（`dateOptions`）は「どの日が
 * 集まっているか」を見るためのもので、こちらは「誰がどう答えたか」を
 * 見るためのもの。**コメントはここにしか無い** — 日程ごとではなく
 * 回答ごとに1つ書くため、候補日の側に置き場が無い。
 *
 * ×だけを付けた人も出す。候補日の下のアバターは○と△しか出さないが、
 * 日程調整では「その日は無理だと答えた人がいる」ことも決めるための材料。
 */
export type PreEventRespondentDto = {
  user: PublicUserDto
  /** 候補日ID → 回答。答えていない候補日はキーごと無い */
  votes: Record<string, PreEventVote>
  comment: string | null
  respondedAt: string
}

/** 閲覧者から見た状態。イベント側と同じ考え方でサーバーが決める */
export type PreEventViewerDto = {
  isAuthenticated: boolean
  isOrganizer: boolean
  /**
   * 削除できるか。**グループのスタッフは `isOrganizer` だが削除はできない**
   * （作成者と所属グループの管理責任者だけ。`checkPreEventOwnerPermission`）
   */
  canDelete: boolean
  /** グループ（主催の名義）を変えられるか。作成者だけ（`canChangeOrganization`） */
  canChangeOrganization: boolean
  /** 自分の回答。一度も答えていなければ null */
  response: {
    /** 候補日ID → 回答 */
    votes: Record<string, PreEventVote>
    comment: string | null
    autoRegisterWhenPromoted: boolean
  } | null
  isEligible: boolean
  ineligibleReason: 'platform' | 'server' | null
}

export type PreEventDetailDto = {
  id: string
  title: string
  description: string | null
  location: string | null
  fee: string | null
  relatedUrl: string | null
  terms: string | null
  isPublic: boolean
  isHighlighted: boolean
  /** 日程が決まったあとの本登録を自動で行うか */
  allowAutoRegistration: boolean
  /** 回答の締切。イベントと違い1列で持っている */
  registrationDeadline: string | null
  allowedServers: AllowedServer[]
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  creator: PublicUserDto
  organization: { id: string; slug: string; name: string } | null
  dateOptions: PreEventDateOptionDto[]
  /** 回答した人。回答が古い順（先に答えた人が上） */
  respondents: PreEventRespondentDto[]
  /** 回答した人の数（延べではなく実人数） */
  respondentCount: number
  viewer: PreEventViewerDto
  createdAt: string
  updatedAt: string
}

type ParticipantRow = {
  userId: string
  dateOptionId: string
  status: string
  comment: string | null
  autoRegisterWhenPromoted: boolean
  /** 回答した時刻。回答者を並べる順に使う */
  createdAt?: Date
  user: Parameters<typeof serializeUser>[0]
}

type PreEventRow = {
  id: string
  title: string
  description: string | null
  location: string | null
  fee: string | null
  relatedUrl: string | null
  terms: string | null
  isPublic: boolean
  isHighlighted: boolean
  allowAutoRegistration: boolean
  registrationDeadline: Date | null
  allowedFediverseServers: string | null
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  createdAt: Date
  updatedAt: Date
  creator: Parameters<typeof serializeUser>[0]
  organization: { id: string; slug: string; name: string } | null
  dateOptions: { id: string; startDate: Date; endDate: Date | null; displayOrder: number }[]
  participants: ParticipantRow[]
}

export type PreEventViewerInput = {
  isAuthenticated: boolean
  isOrganizer: boolean
  canDelete: boolean
  /** 未ログインなら null */
  userId: string | null
  isEligible: boolean
  ineligibleReason: 'platform' | 'server' | null
}

function isVote(value: string): value is PreEventVote {
  return value === 'available' || value === 'maybe' || value === 'unavailable'
}

export function serializePreEventDetail(
  preEvent: PreEventRow,
  viewerInput: PreEventViewerInput
): PreEventDetailDto {
  /*
    参加者は「日程 × 人」で並んでいる。候補日ごとに集計するため、
    先に日程IDで引けるようにまとめる。**画面側で数えさせない** —
    非表示の回答を含めるかどうかで数字がずれる。
  */
  const byDateOption = new Map<string, ParticipantRow[]>()
  for (const row of preEvent.participants) {
    const list = byDateOption.get(row.dateOptionId)
    if (list) list.push(row)
    else byDateOption.set(row.dateOptionId, [row])
  }

  const dateOptions: PreEventDateOptionDto[] = preEvent.dateOptions.map((option) => {
    const rows = byDateOption.get(option.id) ?? []
    const counts = { available: 0, maybe: 0, unavailable: 0 }
    const attendees: PreEventDateOptionDto['attendees'] = []

    for (const row of rows) {
      if (!isVote(row.status)) continue
      counts[row.status] += 1
      if (row.status !== 'unavailable') {
        attendees.push({ user: serializeUser(row.user), vote: row.status })
      }
    }

    return {
      id: option.id,
      startDate: option.startDate.toISOString(),
      endDate: option.endDate?.toISOString() ?? null,
      displayOrder: option.displayOrder,
      counts,
      attendees,
    }
  })

  /*
    回答者ごとにまとめ直す。**行は「日程 × 人」で並んでいる**ので、
    userId で畳まないと同じ人が候補日の数だけ現れる。
    コメントと自動登録は行ごとに持っているが、実際は回答単位なので
    どの行から取っても同じ。
  */
  const byUser = new Map<string, ParticipantRow[]>()
  for (const row of preEvent.participants) {
    const list = byUser.get(row.userId)
    if (list) list.push(row)
    else byUser.set(row.userId, [row])
  }

  const respondents: PreEventRespondentDto[] = [...byUser.values()]
    .map((rows) => ({
      user: serializeUser(rows[0].user),
      votes: Object.fromEntries(
        rows.filter((r) => isVote(r.status)).map((r) => [r.dateOptionId, r.status as PreEventVote])
      ),
      comment: rows[0].comment,
      respondedAt: (rows[0].createdAt ?? new Date(0)).toISOString(),
    }))
    .sort((a, b) => a.respondedAt.localeCompare(b.respondedAt))

  const mine = viewerInput.userId
    ? preEvent.participants.filter((p) => p.userId === viewerInput.userId)
    : []

  const viewer: PreEventViewerDto = {
    isAuthenticated: viewerInput.isAuthenticated,
    isOrganizer: viewerInput.isOrganizer,
    canDelete: viewerInput.canDelete,
    canChangeOrganization: canChangeOrganization(preEvent.creator.id, viewerInput.userId),
    isEligible: viewerInput.isEligible,
    ineligibleReason: viewerInput.ineligibleReason,
    response:
      mine.length > 0
        ? {
            votes: Object.fromEntries(
              mine.filter((p) => isVote(p.status)).map((p) => [p.dateOptionId, p.status as PreEventVote])
            ),
            // コメントと自動登録は行ごとに持っているが、実際は回答単位。
            // どの行も同じ値なので先頭から取る
            comment: mine[0].comment,
            autoRegisterWhenPromoted: mine[0].autoRegisterWhenPromoted,
          }
        : null,
  }

  return {
    id: preEvent.id,
    title: preEvent.title,
    description: preEvent.description,
    location: preEvent.location,
    fee: preEvent.fee,
    relatedUrl: preEvent.relatedUrl,
    terms: preEvent.terms,
    isPublic: preEvent.isPublic,
    isHighlighted: preEvent.isHighlighted,
    allowAutoRegistration: preEvent.allowAutoRegistration,
    registrationDeadline: preEvent.registrationDeadline?.toISOString() ?? null,
    allowedServers: parseAllowedServers(preEvent.allowedFediverseServers),
    isAllowedForFediverse: preEvent.isAllowedForFediverse,
    isAllowedForDiscord: preEvent.isAllowedForDiscord,
    isAllowedForTwitter: preEvent.isAllowedForTwitter,
    creator: serializeUser(preEvent.creator),
    organization: preEvent.organization,
    dateOptions,
    respondents,
    respondentCount: respondents.length,
    viewer,
    createdAt: preEvent.createdAt.toISOString(),
    updatedAt: preEvent.updatedAt.toISOString(),
  }
}

// =============================================================================
// 一覧用
// =============================================================================

/**
 * 一覧カード1件分。
 *
 * イベントのカードと同じ形に落とす（`AttendableCard` が両方を描く）。
 * 違うのは日付で、**イベントは1つ、日程調整は候補が複数**。
 * カード側は「最初の候補と、あと何日あるか」だけを見せる。
 */
export type PreEventListItemDto = {
  id: string
  title: string
  /** 候補日。表示順。カードは先頭しか使わないが、件数を出すため全部返す */
  dateOptions: { id: string; startDate: string; endDate: string | null }[]
  location: string | null
  fee: string | null
  registrationDeadline: string | null
  /** 回答した実人数 */
  respondentCount: number
  /** カードに出すアバターだけ */
  respondents: PublicUserDto[]
  creator: PublicUserDto
  organization: { id: string; slug: string; name: string } | null
}

/** カードに出すアバターの数。イベント側と揃える */
export const PRE_EVENT_LIST_AVATAR_LIMIT = 5

type PreEventListSource = {
  id: string
  title: string
  location: string | null
  fee: string | null
  registrationDeadline: Date | null
  creator: Parameters<typeof serializeUser>[0]
  organization: { id: string; slug: string; name: string } | null
  dateOptions: { id: string; startDate: Date; endDate: Date | null }[]
  /**
   * 回答した人。**日程 × 人で行があるので重複する。**
   * 数える前に userId で畳む。
   */
  participants: { userId: string; user: Parameters<typeof serializeUser>[0] }[]
}

export function serializePreEventListItem(preEvent: PreEventListSource): PreEventListItemDto {
  const seen = new Set<string>()
  const respondents: PublicUserDto[] = []
  for (const row of preEvent.participants) {
    if (seen.has(row.userId)) continue
    seen.add(row.userId)
    if (respondents.length < PRE_EVENT_LIST_AVATAR_LIMIT) {
      respondents.push(serializeUser(row.user))
    }
  }

  return {
    id: preEvent.id,
    title: preEvent.title,
    dateOptions: preEvent.dateOptions.map((o) => ({
      id: o.id,
      startDate: o.startDate.toISOString(),
      endDate: o.endDate?.toISOString() ?? null,
    })),
    location: preEvent.location,
    fee: preEvent.fee,
    registrationDeadline: preEvent.registrationDeadline?.toISOString() ?? null,
    respondentCount: seen.size,
    respondents,
    creator: serializeUser(preEvent.creator),
    organization: preEvent.organization,
  }
}

// =============================================================================
// 回答者への連絡
// =============================================================================

/**
 * 連絡画面に要るもの。
 *
 * **1リクエストで全部返す。** 画面は「誰に・どこから・何を送るか」を
 * 同時に決めるので、宛先と自分の投稿手段が別々に届くと、
 * 選べる投稿方法が後から変わることになる。
 *
 * アクセストークンそのものは**返さない。** 直接投稿できるかどうかだけを
 * サーバーで判定して真偽値にする（トークンはサーバーから出さない）。
 */
export type PreEventContactDto = {
  preEvent: { id: string; title: string; registrationDeadline: string | null }
  /** メンションで届く回答者。回答の内容（○△×）は問わない */
  respondents: PublicUserDto[]
  /** メンションで届かない回答者の数（Discord）。連絡できないことを画面で言う */
  unreachableCount: number
  viewer: {
    platform: string
    server: string
    /**
     * API が直接投稿を通す相手か。**日程調整は主催者だけ。**
     * 権限（トークン）があるかとは別物なので分けて返す。
     */
    mayPostDirectly: boolean
    /** 実際に送れるか。上に加えて、投稿できる権限で入っているか */
    canPostDirectly: boolean
  }
}

/**
 * メンションで届く相手か。
 *
 * **Discord は届かない。** サーバー名で判定する — `discord.com` と
 * `discord:` の2形式が実データにある（前者が新しい、後者が古い）。
 */
export function isMentionable(user: { server: string; platform: string }): boolean {
  return (
    user.platform.toLowerCase() !== 'discord' &&
    !user.server.startsWith('discord:') &&
    user.server !== 'discord.com'
  )
}

export function serializePreEventContact(input: {
  preEvent: { id: string; title: string; registrationDeadline: Date | null }
  /** 回答者。**userId で畳んだあと**渡す（日程×人で行があるため） */
  respondents: Parameters<typeof serializeUser>[0][]
  viewer: PreEventContactDto['viewer']
}): PreEventContactDto {
  const users = input.respondents.map(serializeUser)
  const reachable = users.filter(isMentionable)

  return {
    preEvent: {
      id: input.preEvent.id,
      title: input.preEvent.title,
      registrationDeadline: input.preEvent.registrationDeadline?.toISOString() ?? null,
    },
    respondents: reachable,
    unreachableCount: users.length - reachable.length,
    viewer: input.viewer,
  }
}
