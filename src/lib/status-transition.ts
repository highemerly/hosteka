/**
 * 参加ステータス遷移のルール定義
 *
 * 参加ステータス:
 * - attending: 参加
 * - maybe: 未定
 * - not_attending: 欠席（初回登録時のみ選択可能）
 * - cancelled: キャンセル
 * - participation_request: 参加リクエスト（承認待ち）
 */

export type ParticipantStatus =
  | 'attending'
  | 'maybe'
  | 'not_attending'
  | 'cancelled'
  | 'participation_request'

export interface StatusTransitionResult {
  allowed: boolean
  reason?: string
}

/**
 * 利用者自身が移せる先。**同じ状態への変更（内容の手直し）は常に可。**
 *
 * 骨子は「一度出した回答は、取り下げるならキャンセル」。
 *   - 参加     … キャンセルのみ。未定や欠席へは下げられない
 *   - 未定     … 参加に確定するか、キャンセルするか
 *   - リクエスト … キャンセルのみ。参加への昇格は主催者の承認
 *   - 欠席     … 参加・未定へは戻せる（初回の回答なので拘束しない）。
 *                **キャンセルはできない** — 既に参加していないので取り下げる
 *                ものが無く、回答ごと消せると主催者から見て「答えた人」が
 *                数えられなくなる
 *   - キャンセル … 参加・未定・リクエストとして出し直せる。欠席には戻せない
 *
 * 「参加すると言ったが欠席」と「最初から欠席」を同じ状態にすると、
 * 主催者から見て人数の動きが追えなくなる（cancellationReason も残らない）。
 *
 * **画面側にも同じ規則を反映すること**（ParticipateDialog の choices）。
 * 選べるのに送ると失敗する選択肢を見せないため。
 */
const ALLOWED_USER_TRANSITIONS: Record<ParticipantStatus, ParticipantStatus[]> = {
  attending: ['cancelled'],
  maybe: ['attending', 'cancelled'],
  participation_request: ['cancelled'],
  not_attending: ['attending', 'maybe'],
  cancelled: ['attending', 'maybe', 'participation_request'],
}

/** その状態から選べる先（自分自身を含む）。画面の選択肢を組み立てるのに使う */
export function allowedUserTargets(current: ParticipantStatus): ParticipantStatus[] {
  return [current, ...ALLOWED_USER_TRANSITIONS[current]]
}

/** 参加状態の日本語。**画面ごとに書き写さない**（言い方がずれる） */
export const STATUS_LABEL_JA: Record<ParticipantStatus, string> = {
  attending: '参加',
  maybe: '未定',
  participation_request: '参加リクエスト',
  not_attending: '欠席',
  cancelled: 'キャンセル',
}

/**
 * ユーザー自身によるステータス変更の可否を判定。
 * 許される先は ALLOWED_USER_TRANSITIONS を参照。
 */
export function canUserChangeStatus(
  currentStatus: ParticipantStatus,
  newStatus: ParticipantStatus
): StatusTransitionResult {
  if (allowedUserTargets(currentStatus).includes(newStatus)) {
    return { allowed: true }
  }

  const targets = ALLOWED_USER_TRANSITIONS[currentStatus]
    .map((s) => STATUS_LABEL_JA[s])
    .join('・')
  return {
    allowed: false,
    reason: `${STATUS_LABEL_JA[currentStatus]}から変更できるのは ${targets} だけです`,
  }
}

/**
 * 主催者・幹事が参加者の編集画面でできる操作。
 *
 * **状態を選ばせない。操作を選ばせる。** 以前は移せる先をプルダウンで
 * 選んで一括保存していたが、いまは1つの操作がその場で反映される。
 */
export type ParticipantAdminAction =
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'assign_organizer'
  | 'unassign_organizer'
  | 'delete'

/** 状態を変える操作。移る先の状態 */
export const ADMIN_ACTION_TARGET: Partial<Record<ParticipantAdminAction, ParticipantStatus>> = {
  approve: 'attending',
  reject: 'cancelled',
  cancel: 'cancelled',
}

/**
 * その参加者に対してできる操作。**画面のボタンもサーバーの判定もここから作る。**
 *
 *   - 参加リクエスト … 承認（→ 参加）か拒否（→ キャンセル）
 *   - 参加・未定     … キャンセルにする。作成者が見ているときは幹事の指定・解除も。
 *                      **幹事と作成者はキャンセルにできない**（下）
 *   - 欠席・キャンセル … 削除だけ。回答の記録ごと消す
 *
 * **参加へ引き上げられるのは承認だけ。** 規約への同意を取っているのは本人が
 * 参加・未定・参加リクエストを選んだときだけで、欠席やキャンセルから主催者が
 * 引き上げると規約に同意していない参加者ができる。未定は同意を取っているが、
 * 本人が「まだ決められない」と言っている状態で、主催者が代わりに確定させる
 * ものではない。
 *
 * **欠席・キャンセルは削除しかできない。** 状態を動かす代わりに記録を消す。
 * 消えた人は本人が一から登録し直せる。
 *
 * 幹事の指定は**作成者だけ**ができ、作成者自身は対象にならない。
 * 参加・未定の人だけが対象。
 *
 * **幹事と作成者の行には、誰が見ていても「キャンセルにする」を出さない。** キャンセルに
 * すると幹事も外れるので、作成者でない幹事（グループのスタッフを含む）がほかの幹事を
 * キャンセルにすると、作成者にしかできない「幹事を外す」ができてしまう。作成者が幹事を
 * 参加から外したいときは、先に幹事を解除してからキャンセルにする。
 */
export function allowedAdminActions(
  participant: { status: ParticipantStatus; isOrganizer: boolean; isCreator: boolean },
  viewer: { isCreator: boolean }
): ParticipantAdminAction[] {
  switch (participant.status) {
    case 'participation_request':
      return ['approve', 'reject']
    case 'attending':
    case 'maybe': {
      if (participant.isCreator) return []
      if (participant.isOrganizer) return viewer.isCreator ? ['unassign_organizer'] : []
      return viewer.isCreator ? ['cancel', 'assign_organizer'] : ['cancel']
    }
    case 'not_attending':
    case 'cancelled':
      return ['delete']
  }
}

/**
 * 組織管理者のロール変更可否を判定
 *
 * ルール:
 * - admin役割のユーザーのみが変更可能
 * - 自分自身のロールは変更不可
 * - 組織作成者のロールは変更不可
 */
export function canChangeOrgAdminRole(
  targetUserId: string,
  currentUserId: string,
  creatorId: string,
  isCurrentUserAdmin: boolean
): StatusTransitionResult {
  // admin役割のユーザーのみが変更可能
  if (!isCurrentUserAdmin) {
    return {
      allowed: false,
      reason: 'Only admin can change admin roles',
    }
  }

  // 自分自身のロールは変更不可
  if (targetUserId === currentUserId) {
    return {
      allowed: false,
      reason: 'Cannot change your own role',
    }
  }

  // 組織作成者のロールは変更不可
  if (targetUserId === creatorId) {
    return {
      allowed: false,
      reason: 'Cannot change creator role',
    }
  }

  return { allowed: true }
}

/**
 * 組織管理者の削除可否を判定
 *
 * ルール:
 * - admin役割のユーザーのみが削除可能
 * - 自分自身は削除不可
 * - 組織作成者は削除不可
 */
export function canRemoveOrgAdmin(
  targetUserId: string,
  currentUserId: string,
  creatorId: string,
  isCurrentUserAdmin: boolean
): StatusTransitionResult {
  // admin役割のユーザーのみが削除可能
  if (!isCurrentUserAdmin) {
    return {
      allowed: false,
      reason: 'Only admin can remove admins',
    }
  }

  // 自分自身は削除不可
  if (targetUserId === currentUserId) {
    return {
      allowed: false,
      reason: 'Cannot remove yourself',
    }
  }

  // 組織作成者は削除不可
  if (targetUserId === creatorId) {
    return {
      allowed: false,
      reason: 'Cannot remove creator',
    }
  }

  return { allowed: true }
}

/**
 * イベント・日程調整の「グループ」（主催の名義）を変えられるか。**作成者だけ。**
 *
 * 幹事やグループのスタッフも編集はできるが、名義は変えさせない。自分が
 * 管理するグループへ付け替えると、そのグループの管理責任者として中止や
 * 削除の権限まで手に入る。外すのも同じで、元のグループの管理者から取り上げられる。
 * 画面（欄を出すか）とサーバー（PUT で断るか）が同じものを見る。
 */
export function canChangeOrganization(creatorId: string, viewerId: string | null): boolean {
  return viewerId !== null && viewerId === creatorId
}
