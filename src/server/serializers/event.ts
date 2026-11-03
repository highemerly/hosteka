import 'server-only'

import { serializeUser, type PublicUserDto } from './user'
import type { OptionResponseType } from '@/schemas/event'
import { parseAllowedServers, type AllowedServer } from '@/lib/allowed-servers'
import { canChangeOrganization } from '@/lib/status-transition'
import { composeDateTime, composeDeadline } from '@/lib/event-datetime'

/**
 * イベント詳細のDTO。
 *
 * Prisma のモデルをそのまま返さない。画面が必要とする形に整えることで、
 * 機密の混入を防ぎ、画面側での再計算をなくす。
 *
 * とくに **viewer**（閲覧者から見た状態）はサーバーで決める。
 * 「参加できるか」「満員か」「締切を過ぎたか」の判定は認可と同じ規則に
 * 依存するので、画面側で再実装すると必ずずれる。
 */

export type ParticipantDto = {
  id: string
  user: PublicUserDto
  status: string
  comment: string | null
  isOrganizer: boolean
  /**
   * 選択したオプション。表示用に畳んである。**自由入力の回答も含む**
   * （見る側にとっては、選んだ答えも書いた答えも同じ「回答」）。
   *
   * **質問（グループ名）と組で渡す。** 選択肢の名前だけでは
   * 「はい」「いいえ」が何への答えか分からない。
   * 並びはグループ・選択肢の表示順。
   */
  options: { question: string; name: string }[]
}

export type EventOptionGroupDto = {
  id: string
  title: string
  /** `text` は選択肢を持たない。参加者がその場で書く */
  responseType: OptionResponseType
  options: {
    id: string
    name: string
    maxParticipants: number | null
    takenCount: number
  }[]
}

/**
 * 閲覧者自身の参加記録。
 *
 * **一覧の participants から自分を探させない。** あちらは userId を
 * 持たないので、状態が同じ他人の記録を掴んでしまう。
 * `status` が `cancelled` でも記録自体は残っているので、
 * 再登録は POST（作成）ではなく PUT（更新）になる。
 */
export type ViewerParticipationDto = {
  status: string
  comment: string | null
  termsAccepted: boolean
  /** 選択済みのオプション。変更時の初期値に使う */
  selectedOptionIds: string[]
  /** 自由入力の回答。`{ グループID: 本文 }`。同じく変更時の初期値 */
  optionTextAnswers: Record<string, string>
}

/** 閲覧者から見た状態。EventAction の分岐はこれだけを見る */
export type EventViewerDto = {
  isAuthenticated: boolean
  isOrganizer: boolean
  /**
   * 中止できるか。**幹事とグループのスタッフは `isOrganizer` だが中止はできない**
   * （作成者と所属グループの管理責任者だけ。`checkEventOwnerPermission`）
   */
  canCancel: boolean
  /** グループ（主催の名義）を変えられるか。作成者だけ（`canChangeOrganization`） */
  canChangeOrganization: boolean
  /** 自分の参加記録。一度も登録していなければ null */
  participation: ViewerParticipationDto | null
  /** プラットフォーム/サーバー制限を満たすか */
  isEligible: boolean
  /**
   * 満たさない理由。満たすなら null。
   * 「参加条件を満たしていません」だけでは、別アカウントで入り直せば
   * 済むのか、そもそも無理なのかが分からない。
   */
  ineligibleReason: 'platform' | 'server' | null
}

export type EventDetailDto = {
  id: string
  title: string
  description: string | null
  hashtags: string[]
  startDate: string
  endDate: string | null
  hasStartTime: boolean
  hasEndTime: boolean
  location: string | null
  fee: string | null
  relatedUrl: string | null
  terms: string | null
  status: string
  isPublic: boolean
  isHighlighted: boolean
  maxParticipants: number | null
  /** 日付と時刻を合成した締切。JST。未設定なら null */
  registrationDeadline: string | null
  allowMaybe: boolean
  allowParticipationRequest: boolean
  allowedServers: AllowedServer[]
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  creator: PublicUserDto
  organization: { id: string; slug: string; name: string } | null
  participants: ParticipantDto[]
  optionGroups: EventOptionGroupDto[]
  counts: { attending: number; maybe: number; participationRequest: number }
  viewer: EventViewerDto
  createdAt: string
  updatedAt: string
}

/** JSON文字列で保存されている配列を安全に読む。壊れていても落とさない */
function parseJsonArray(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []
  } catch {
    return []
  }
}

type EventRow = {
  id: string
  title: string
  description: string | null
  hashtags: string | null
  startDate: Date
  startTime: string | null
  hasStartTime: boolean
  endDate: Date | null
  endTime: string | null
  hasEndTime: boolean
  location: string | null
  fee: string | null
  relatedUrl: string | null
  terms: string | null
  status: string
  isPublic: boolean
  isHighlighted: boolean
  maxParticipants: number | null
  registrationDeadlineDate: Date | null
  registrationDeadlineTime: string | null
  allowMaybe: boolean
  allowParticipationRequest: boolean
  allowedFediverseServers: string | null
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  createdAt: Date
  updatedAt: Date
  creator: Parameters<typeof serializeUser>[0]
  organization: { id: string; slug: string; name: string } | null
  participants: {
    id: string
    userId: string
    status: string
    comment: string | null
    termsAccepted: boolean
    isOrganizer: boolean
    user: Parameters<typeof serializeUser>[0]
    groupSelections?: GroupSelectionRow[]
  }[]
  optionGroups: OptionGroupRow[]
}

/** `participant_group_selections` 1行。**自由入力は `textAnswer` にだけ入る** */
export type GroupSelectionRow = {
  groupId: string
  textAnswer: string | null
  options: { option: { id: string; name: string } }[]
}

export type OptionGroupRow = {
  id: string
  title: string
  responseType: string
  options: { id: string; name: string; maxParticipants: number | null }[]
}

/**
 * 閲覧者の識別。参加記録の解決はシリアライザ側で行う。
 * ルート側で探すと、探し方が画面ごとに散らばる。
 */
export type ViewerInput = {
  isAuthenticated: boolean
  isOrganizer: boolean
  canCancel: boolean
  /** 未ログインなら null */
  userId: string | null
  isEligible: boolean
  ineligibleReason: 'platform' | 'server' | null
}

/**
 * 選択肢と見出しに、画面へ出す順番を振る。
 *
 * **並びの出どころは `optionGroups`（主催者が決めた表示順）。**
 * 参加者の選択の記録は保存順で並んでいるので、そのまま出すと
 * 人によって「はい」と「懇親会」の前後が入れ替わる。
 *
 * 見出しにも番号を振るのは、自由入力の回答がそのグループに属するため
 * （選択肢が無いので、選択肢の番号を借りられない）。
 */
function optionOrderIndex(groups: OptionGroupRow[]) {
  const byGroup = new Map<string, { question: string; order: number }>()
  const byOption = new Map<string, { question: string; order: number }>()
  let order = 0
  for (const g of groups) {
    byGroup.set(g.id, { question: g.title, order: order++ })
    for (const o of g.options) {
      byOption.set(o.id, { question: g.title, order: order++ })
    }
  }
  return { byGroup, byOption }
}

/**
 * 参加者1人の回答を表示用に畳む。**選んだ答えと書いた答えを混ぜて並べる** —
 * 見る側にとってはどちらも「この人の回答」で、種類ごとに置き場を分ける
 * 理由が無い。
 */
function answerViews(
  selections: GroupSelectionRow[] | undefined,
  index: ReturnType<typeof optionOrderIndex>
): { question: string; name: string }[] {
  return (selections ?? [])
    .flatMap((sel) => {
      const rows: { question: string; name: string; order: number }[] = []

      const group = index.byGroup.get(sel.groupId)
      if (sel.textAnswer && group) {
        rows.push({ question: group.question, name: sel.textAnswer, order: group.order })
      }

      for (const { option } of sel.options) {
        const found = index.byOption.get(option.id)
        if (found) rows.push({ ...found, name: option.name })
      }
      return rows
    })
    .sort((a, b) => a.order - b.order)
    .map(({ question, name }) => ({ question, name }))
}

/** 自由入力の回答を `{ グループID: 本文 }` にする。変更時の初期値に使う */
function textAnswersOf(selections: GroupSelectionRow[] | undefined): Record<string, string> {
  return Object.fromEntries(
    (selections ?? [])
      .filter((sel) => sel.textAnswer)
      .map((sel) => [sel.groupId, sel.textAnswer as string])
  )
}

/** オプションの定義。**埋まり具合は呼び出し側が数える**（数え方を1つに保つため） */
function serializeOptionGroups(
  groups: OptionGroupRow[],
  takenByOption: Map<string, number>
): EventOptionGroupDto[] {
  return groups.map((g) => ({
    id: g.id,
    title: g.title,
    responseType: g.responseType as OptionResponseType,
    options: g.options.map((o) => ({
      id: o.id,
      name: o.name,
      maxParticipants: o.maxParticipants,
      takenCount: takenByOption.get(o.id) ?? 0,
    })),
  }))
}

export function serializeEventDetail(
  event: EventRow,
  viewerInput: ViewerInput
): EventDetailDto {
  const mine = viewerInput.userId
    ? event.participants.find((p) => p.userId === viewerInput.userId)
    : undefined

  const viewer: EventViewerDto = {
    isAuthenticated: viewerInput.isAuthenticated,
    isOrganizer: viewerInput.isOrganizer,
    canCancel: viewerInput.canCancel,
    canChangeOrganization: canChangeOrganization(event.creator.id, viewerInput.userId),
    isEligible: viewerInput.isEligible,
    ineligibleReason: viewerInput.ineligibleReason,
    participation: mine
      ? {
          status: mine.status,
          comment: mine.comment,
          termsAccepted: mine.termsAccepted,
          selectedOptionIds: (mine.groupSelections ?? []).flatMap((sel) =>
            sel.options.map((o) => o.option.id)
          ),
          optionTextAnswers: textAnswersOf(mine.groupSelections),
        }
      : null,
  }

  const index = optionOrderIndex(event.optionGroups)

  const participants: ParticipantDto[] = event.participants.map((p) => ({
    id: p.id,
    // ユーザー情報は必ず serializeUser を通す。直接展開すると
    // accessToken 等が混入する
    user: serializeUser(p.user),
    status: p.status,
    comment: p.comment,
    isOrganizer: p.isOrganizer,
    options: answerViews(p.groupSelections, index),
  }))

  // オプションの選択数は参加者の選択から数える。
  // 画面側で数えさせると、非表示の参加者を含めるかどうかでずれる。
  const takenByOption = new Map<string, number>()
  for (const p of event.participants) {
    if (p.status !== 'attending' && p.status !== 'maybe') continue
    for (const sel of p.groupSelections ?? []) {
      for (const o of sel.options) {
        takenByOption.set(o.option.id, (takenByOption.get(o.option.id) ?? 0) + 1)
      }
    }
  }

  const count = (status: string) =>
    event.participants.filter((p) => p.status === status).length

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    hashtags: parseJsonArray(event.hashtags),
    startDate: composeDateTime(event.startDate, event.startTime, event.hasStartTime),
    endDate: event.endDate
      ? composeDateTime(event.endDate, event.endTime, event.hasEndTime)
      : null,
    hasStartTime: event.hasStartTime,
    hasEndTime: event.hasEndTime,
    location: event.location,
    fee: event.fee,
    relatedUrl: event.relatedUrl,
    terms: event.terms,
    status: event.status,
    isPublic: event.isPublic,
    isHighlighted: event.isHighlighted,
    maxParticipants: event.maxParticipants,
    registrationDeadline: composeDeadline(
      event.registrationDeadlineDate,
      event.registrationDeadlineTime
    ),
    allowMaybe: event.allowMaybe,
    allowParticipationRequest: event.allowParticipationRequest,
    allowedServers: parseAllowedServers(event.allowedFediverseServers),
    isAllowedForFediverse: event.isAllowedForFediverse,
    isAllowedForDiscord: event.isAllowedForDiscord,
    isAllowedForTwitter: event.isAllowedForTwitter,
    creator: serializeUser(event.creator),
    organization: event.organization
      ? {
          id: event.organization.id,
          slug: event.organization.slug,
          name: event.organization.name,
        }
      : null,
    participants,
    optionGroups: serializeOptionGroups(event.optionGroups, takenByOption),
    counts: {
      attending: count('attending'),
      maybe: count('maybe'),
      participationRequest: count('participation_request'),
    },
    viewer,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

// =============================================================================
// 一覧用
// =============================================================================

/**
 * 一覧カード1件分。
 *
 * **詳細DTOを使い回さない。** 詳細は参加者全員・オプショングループ・規約まで
 * 含む。一覧は12件×4セクションを1往復で返すので、そのまま載せると
 * ペイロードが桁で変わる。カードが描くものだけを持たせる。
 *
 * 参加者はアバターを数個出すだけなので、先頭の数人と総数に落とす。
 */
export type EventListItemDto = {
  id: string
  title: string
  hashtags: string[]
  startDate: string
  endDate: string | null
  hasStartTime: boolean
  hasEndTime: boolean
  location: string | null
  fee: string | null
  status: string
  maxParticipants: number | null
  registrationDeadline: string | null
  attendingCount: number
  /** カードに出すアバターだけ。全員は返さない */
  attendees: PublicUserDto[]
  creator: PublicUserDto
  organization: { id: string; slug: string; name: string } | null
}

/** カードに出すアバターの数。これ以上は「+N」にまとめる */
export const LIST_AVATAR_LIMIT = 5

/**
 * 一覧の入力。
 *
 * **participants は「参加中の先頭数人」だけを渡す。** 全員を取ってから
 * 絞ると、48件のカードのために参加者を全部読むことになる。
 * 総数は Prisma の filtered count（`_count`）で別に数えて渡す。
 */
type EventListSource = {
  id: string
  title: string
  hashtags: string | null
  startDate: Date
  startTime: string | null
  endDate: Date | null
  endTime: string | null
  hasStartTime: boolean
  hasEndTime: boolean
  location: string | null
  fee: string | null
  status: string
  maxParticipants: number | null
  registrationDeadlineDate: Date | null
  registrationDeadlineTime: string | null
  creator: Parameters<typeof serializeUser>[0]
  organization: { id: string; slug: string; name: string } | null
  participants: { user: Parameters<typeof serializeUser>[0] }[]
  _count: { participants: number }
}

export function serializeEventListItem(event: EventListSource): EventListItemDto {
  return {
    id: event.id,
    title: event.title,
    hashtags: parseJsonArray(event.hashtags),
    startDate: composeDateTime(event.startDate, event.startTime, event.hasStartTime),
    endDate: event.endDate
      ? composeDateTime(event.endDate, event.endTime, event.hasEndTime)
      : null,
    hasStartTime: event.hasStartTime,
    hasEndTime: event.hasEndTime,
    location: event.location,
    fee: event.fee,
    status: event.status,
    maxParticipants: event.maxParticipants,
    registrationDeadline: composeDeadline(
      event.registrationDeadlineDate,
      event.registrationDeadlineTime
    ),
    attendingCount: event._count.participants,
    attendees: event.participants.slice(0, LIST_AVATAR_LIMIT).map((p) => serializeUser(p.user)),
    creator: serializeUser(event.creator),
    organization: event.organization,
  }
}

// =============================================================================
// 参加者への連絡
// =============================================================================

/**
 * 連絡画面に要るもの。
 *
 * **1リクエストで全部返す。** 画面は「誰に・どこから・何を送るか」を
 * 同時に決めるので、宛先と自分の投稿手段が別々に届くと、
 * 選べる投稿方法が後から変わることになる。
 *
 * アクセストークンそのものは**返さない。** 直接投稿できるかどうかだけを
 * サーバーで判定して真偽値にする。
 */
export type EventContactDto = {
  event: { id: string; title: string; registrationDeadline: string | null }
  /**
   * 宛先の候補。**参加状態ごとに束ねる。**
   * 「参加予定の人だけ」「欠席の人にも」を主催者が選ぶため。
   */
  groups: { status: string; users: PublicUserDto[] }[]
  /** メンションで届かない人の数（Discord）。連絡できないことを画面で言う */
  unreachableCount: number
  viewer: {
    platform: string
    server: string
    /**
     * API が直接投稿を通す相手か。**イベントは参加者なら送れる**
     * （幹事だけではない）。権限があるかとは別物なので分けて返す。
     */
    mayPostDirectly: boolean
    /** 実際に送れるか。上に加えて、投稿できる権限で入っているか */
    canPostDirectly: boolean
  }
}

/** 連絡の宛先に出す参加状態と、その並び。**キャンセルは最後** */
export const CONTACT_STATUS_ORDER = [
  'attending',
  'maybe',
  'participation_request',
  'not_attending',
  'cancelled',
] as const

/**
 * メンションで届く相手か。
 *
 * **Discord は届かない。** サーバー名で判定する — `discord.com` と
 * `discord:` の2形式が実データにある（前者が新しい、後者が古い）。
 */
export function isMentionableUser(user: { server: string; platform: string }): boolean {
  return (
    user.platform.toLowerCase() !== 'discord' &&
    !user.server.startsWith('discord:') &&
    user.server !== 'discord.com'
  )
}

export function serializeEventContact(input: {
  /**
   * 締切は**日付と時刻の2列のまま**受け取る。
   * 呼び出し側で合成させると、合成の仕方が散らばる
   * （詳細ページとずれ、壊れた時刻列で 500 になる経路も増える）。
   */
  event: {
    id: string
    title: string
    registrationDeadlineDate: Date | null
    registrationDeadlineTime: string | null
  }
  participants: { status: string; user: Parameters<typeof serializeUser>[0] }[]
  viewer: EventContactDto['viewer']
}): EventContactDto {
  const groups: { status: string; users: PublicUserDto[] }[] = []
  let unreachableCount = 0

  for (const status of CONTACT_STATUS_ORDER) {
    const users: PublicUserDto[] = []
    for (const row of input.participants) {
      if (row.status !== status) continue
      const user = serializeUser(row.user)
      if (isMentionableUser(user)) users.push(user)
      else unreachableCount += 1
    }
    // 誰もいない状態は束ごと出さない。空の選択肢を並べても選べない
    if (users.length > 0) groups.push({ status, users })
  }

  return {
    event: {
      id: input.event.id,
      title: input.event.title,
      registrationDeadline: composeDeadline(
        input.event.registrationDeadlineDate,
        input.event.registrationDeadlineTime
      ),
    },
    groups,
    unreachableCount,
    viewer: input.viewer,
  }
}

// =============================================================================
// 参加者の管理
// =============================================================================

/**
 * 参加者を編集する画面に要るもの。
 *
 * **詳細のDTOでは足りない。** あちらの `participants` は表示用で、
 * 選んだオプションを名前でしか持たない。編集にはIDが要る。
 * かといって詳細に足すと、閲覧するだけの人にも配ることになる。
 */
export type ManageParticipantDto = {
  id: string
  user: PublicUserDto
  status: string
  comment: string | null
  isOrganizer: boolean
  /** イベントの作成者。**幹事にはできない**（自分が主催者なので） */
  isCreator: boolean
  /** 選んだオプションのID。編集の初期値になる */
  selectedOptionIds: string[]
  /** 自由入力の回答。`{ グループID: 本文 }` */
  optionTextAnswers: Record<string, string>
  joinedAt: string
}

export type ManageParticipantsDto = {
  event: {
    id: string
    title: string
    status: string
    /** 「未定」を受け付けるか。選べる状態が変わる */
    allowMaybe: boolean
    /** 参加リクエストを受け付けるか。受け付けないなら承認待ちへは移せない */
    allowParticipationRequest: boolean
  }
  optionGroups: EventOptionGroupDto[]
  participants: ManageParticipantDto[]
  viewer: {
    /** 幹事の指定は**作成者だけ**ができる（`allowedAdminActions`） */
    isCreator: boolean
  }
}

type ManageRow = {
  id: string
  title: string
  status: string
  allowMaybe: boolean
  allowParticipationRequest: boolean
  creatorId: string
  participants: {
    id: string
    userId: string
    status: string
    comment: string | null
    isOrganizer: boolean
    createdAt: Date
    user: Parameters<typeof serializeUser>[0]
    groupSelections?: GroupSelectionRow[]
  }[]
  optionGroups: OptionGroupRow[]
}

export function serializeManageParticipants(
  event: ManageRow,
  viewerId: string
): ManageParticipantsDto {
  /*
    オプションの埋まり具合は詳細と同じ数え方にする（参加中と未定だけ）。
    **画面側で数えさせない** — 数え方がずれると、残席の表示が
    詳細ページと食い違う。
  */
  const takenByOption = new Map<string, number>()
  for (const p of event.participants) {
    if (p.status !== 'attending' && p.status !== 'maybe') continue
    for (const sel of p.groupSelections ?? []) {
      for (const o of sel.options) {
        takenByOption.set(o.option.id, (takenByOption.get(o.option.id) ?? 0) + 1)
      }
    }
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      allowMaybe: event.allowMaybe,
      allowParticipationRequest: event.allowParticipationRequest,
    },
    optionGroups: serializeOptionGroups(event.optionGroups, takenByOption),
    participants: event.participants.map((p) => ({
      id: p.id,
      user: serializeUser(p.user),
      status: p.status,
      comment: p.comment,
      isOrganizer: p.isOrganizer,
      isCreator: p.userId === event.creatorId,
      selectedOptionIds: (p.groupSelections ?? []).flatMap((sel) =>
        sel.options.map((o) => o.option.id)
      ),
      optionTextAnswers: textAnswersOf(p.groupSelections),
      joinedAt: p.createdAt.toISOString(),
    })),
    viewer: { isCreator: event.creatorId === viewerId },
  }
}

// =============================================================================
// 出欠登録（当日の記録）
// =============================================================================

/** 当日の出欠。`not_entered` は「まだ記録していない」で、欠席とは別 */
export type AttendStatus = 'present' | 'absent' | 'not_entered'
/** 集金の状態。同じく `not_entered` は未記録 */
export type FeeStatus = 'paid' | 'unpaid' | 'not_entered'

/**
 * 出欠登録の1行。
 *
 * **鍵は `userId`。** 参加者の行のIDではない（記録は `eventId_userId` で
 * 持つ）。参加者の一括編集で、名前と実体が食い違って 500 になった経緯がある。
 */
export type AttendanceRowDto = {
  userId: string
  user: PublicUserDto
  /** 事前の回答（参加・未定・欠席）。当日の出欠とは別物 */
  participantStatus: string
  comment: string | null
  /**
   * 選んだオプション。**当日その場で要る** — 食事の受け渡しや、
   * 2次会の集金はここを見て決める。グループ名まで出す
   * （「肉」だけでは何の選択か分からない）。
   */
  options: { title: string; names: string[] }[]
  attendStatus: AttendStatus
  feeStatus: FeeStatus
  memo: string | null
}

/*
  **「誰がいつ記録したか」は画面に出さない。** 受付では1人につき1行しか
  読まないので、記録のたびに現れる行が邪魔になる。追いたいのは後日
  （集金が合わないときなど）なので、CSV出力に列を持たせてある
  （`events/[id]/export`）。
*/

export type AttendanceDto = {
  event: {
    id: string
    title: string
    /** 参加費。当日の集金に使うので画面に出す */
    fee: string | null
  }
  rows: AttendanceRowDto[]
}

function toAttendStatus(value: string | undefined): AttendStatus {
  return value === 'present' || value === 'absent' ? value : 'not_entered'
}

function toFeeStatus(value: string | undefined): FeeStatus {
  return value === 'paid' || value === 'unpaid' ? value : 'not_entered'
}

type AttendanceEventRow = {
  id: string
  title: string
  fee: string | null
  participants: {
    userId: string
    status: string
    comment: string | null
    user: Parameters<typeof serializeUser>[0]
    groupSelections?: {
      group: { title: string }
      textAnswer: string | null
      options: { option: { name: string } }[]
    }[]
  }[]
  attendances: {
    userId: string
    attendStatus: string
    feeStatus: string
    memo: string | null
  }[]
}

export function serializeAttendance(event: AttendanceEventRow): AttendanceDto {
  const byUser = new Map(event.attendances.map((a) => [a.userId, a]))

  return {
    event: { id: event.id, title: event.title, fee: event.fee },
    rows: event.participants.map((p) => {
      const record = byUser.get(p.userId)
      return {
        userId: p.userId,
        user: serializeUser(p.user),
        participantStatus: p.status,
        comment: p.comment,
        options: (p.groupSelections ?? [])
          .map((sel) => ({
            title: sel.group.title,
            // 自由入力は答えが1つ。選択肢と同じ並びに混ぜる
            names: sel.textAnswer ? [sel.textAnswer] : sel.options.map((o) => o.option.name),
          }))
          // 何も選ばれていないグループは出さない。空の行が並ぶだけ
          .filter((g) => g.names.length > 0),
        attendStatus: toAttendStatus(record?.attendStatus),
        feeStatus: toFeeStatus(record?.feeStatus),
        memo: record?.memo ?? null,
      }
    }),
  }
}
