import { STATUS_LABEL_JA, type ParticipantStatus } from '@/lib/status-transition'
import type { NotificationKind } from '@/schemas/notification'

/**
 * 通知の文言。
 *
 * **文をDBに焼き込まない。** `notifications` が持つのは `kind` と
 * 値の写し（`payload`）だけで、日本語はここが組み立てる。焼き込むと、
 * あとから言い回しを直したときに過去の行だけが古いまま残る。
 *
 * isomorphic（`prisma` も `server-only` も import しない）。一覧画面と
 * ベルのポップオーバーが同じ関数を通る。
 */

/**
 * 文言に使う値の写し。**文ではなく値を入れる。**
 *
 * 対象が消えたあとも行は残るので、名前はここに写しておく
 * （消えた対象を引き直すことはしない）。
 */
export type NotificationPayload = {
  /** 対象の名前。イベント名・日程調整名・グループ名 */
  title?: string
  /** 何が変わったか。`['日時', '場所']`（`src/server/events/event-change.ts` が作る） */
  changed?: string[]
  /** 本人が選んだ参加状態 */
  status?: ParticipantStatus
  /** 参加リクエストが見送られた理由。'closed' はイベントが受け付けをやめた場合 */
  reason?: 'closed'
  /** グループの slug。導線を組むのに使う */
  orgSlug?: string
}

/**
 * `payload` 列を読む。**壊れていても投げない。**
 *
 * 通知は表示するだけのもので、1行読めないことがページ全体を落とす理由にならない。
 */
export function parseNotificationPayload(raw: string | null | undefined): NotificationPayload {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as NotificationPayload
  } catch {
    return {}
  }
}

export type NotificationTextInput = {
  kind: NotificationKind
  /** 原因になった人。退会していれば null */
  actor: { displayName: string } | null
  payload: NotificationPayload
  /** 畳んだ回数。1 なら畳んでいない */
  repeatCount: number
}

/** 『花見の会』。名前が無ければ総称（「イベント」など）で通す */
function target(payload: NotificationPayload, fallback: string): string {
  return payload.title ? `『${payload.title}』` : fallback
}

/** 「たろうさん」。退会していれば「退会した利用者」 */
function who(actor: { displayName: string } | null): string {
  return actor ? `${actor.displayName}さん` : '退会した利用者'
}

/** 「日時・場所」。何も無ければ「内容」 */
function changedLabels(payload: NotificationPayload): string {
  const changed = payload.changed
  if (!Array.isArray(changed) || changed.length === 0) return '内容'
  return changed.filter((v) => typeof v === 'string' && v).join('・') || '内容'
}

/**
 * 通知1件の文。
 *
 * **`Record` で全部の kind を型強制する。** kind を足すと、文言を決めるまで
 * typecheck が通らない。
 */
const TEMPLATES: Record<NotificationKind, (n: NotificationTextInput) => string> = {
  participation_requested: (n) =>
    `${who(n.actor)}が${target(n.payload, 'イベント')}に参加リクエストを出しました`,

  /*
    畳む種別（対象＋本人ごと）。同じ人が出したり直したりを1行にまとめるので、
    2回目以降は「何で登録したか」を言わない — 見に行った時点の状態が答えになる。
  */
  participation_registered: (n) =>
    n.repeatCount > 1
      ? `${who(n.actor)}が${target(n.payload, 'イベント')}の参加内容を変えました`
      : `${who(n.actor)}が${target(n.payload, 'イベント')}に${
          n.payload.status ? STATUS_LABEL_JA[n.payload.status] : '参加'
        }で登録しました`,

  participation_cancelled: (n) =>
    `${who(n.actor)}が${target(n.payload, 'イベント')}への参加を取り消しました`,

  /*
    畳む種別（対象ごと）。20人が回答したら20行ではなく1行にまとめる。
    まとまったら人名を出さない — 名前の配列を持たずに済ませるため。
  */
  pre_event_answered: (n) =>
    n.repeatCount > 1
      ? `${target(n.payload, '日程調整')}に回答が${n.repeatCount}件届きました`
      : `${who(n.actor)}が${target(n.payload, '日程調整')}に回答しました`,

  participation_approved: (n) => `${target(n.payload, 'イベント')}への参加が承認されました`,

  /*
    主催者が見送った場合と、イベントが参加リクエストの受け付けをやめた場合の両方。
    後者は本人の回答への判断ではないので、そう読めない文にする。
  */
  participation_rejected: (n) =>
    n.payload.reason === 'closed'
      ? `${target(n.payload, 'イベント')}が参加リクエストの受け付けをやめました`
      : `${target(n.payload, 'イベント')}への参加リクエストは見送られました`,

  /*
    主催者が参加者をキャンセルにした。**本人の取り下げと言い分けること** —
    「取り消しました」だと自分でやったように読める。
  */
  participation_removed: (n) =>
    `${target(n.payload, 'イベント')}への参加が主催者によって取り消されました`,

  event_updated: (n) => `${target(n.payload, 'イベント')}の${changedLabels(n.payload)}が変わりました`,
  event_cancelled: (n) => `${target(n.payload, 'イベント')}が中止になりました`,

  pre_event_updated: (n) =>
    `${target(n.payload, '日程調整')}の${changedLabels(n.payload)}が変わりました`,
  pre_event_deleted: (n) => `${target(n.payload, '日程調整')}が取り消されました`,

  organizer_assigned: (n) => `${target(n.payload, 'イベント')}の幹事になりました`,
  organizer_unassigned: (n) => `${target(n.payload, 'イベント')}の幹事ではなくなりました`,
  org_admin_added: (n) => `${target(n.payload, 'グループ')}の管理者になりました`,
}

export function notificationText(n: NotificationTextInput): string {
  return TEMPLATES[n.kind](n)
}

/** 一覧の種別バッジ。**中立色で出す**（青は未読のために空けておく） */
export const KIND_LABEL_JA: Record<NotificationKind, string> = {
  participation_requested: '参加リクエスト',
  participation_registered: '参加登録',
  participation_cancelled: 'キャンセル',
  pre_event_answered: '日程調整の回答',
  participation_approved: '承認',
  participation_rejected: '見送り',
  participation_removed: 'キャンセル',
  event_updated: 'イベントの変更',
  event_cancelled: '中止',
  pre_event_updated: '日程調整の変更',
  pre_event_deleted: '取り消し',
  organizer_assigned: '幹事',
  organizer_unassigned: '幹事',
  org_admin_added: 'グループ',
}
