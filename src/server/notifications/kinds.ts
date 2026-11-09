import 'server-only'

import type { NotificationKind } from '@/schemas/notification'

/**
 * 種別ごとの畳み方。**サーバーだけが知っていればよい**（画面には要らない）。
 *
 *   - none         … 1件1件が別の出来事。必ず新しい行になる
 *   - target       … 対象ごとにまとめる。誰がやったかを問わない
 *   - target+actor … 対象と「やった人」ごとにまとめる
 *
 * 畳む相手は**未読の行だけ**。既読になった行は二度と畳まれない
 * （`fold.ts` の `foldKeyFor` を参照）。
 */
export type FoldStrategy = 'none' | 'target' | 'target+actor'

export const KIND_FOLD: Record<NotificationKind, FoldStrategy> = {
  /*
    連続編集をまとめる。この機能を作った動機そのもの。
    主催者が10分かけて日時・場所・会費を直しても、参加者に届くのは1件。
  */
  event_updated: 'target',
  pre_event_updated: 'target',

  /*
    20人が回答したら20行ではなく「回答が20件届きました」の1行。
    人名は畳んだ時点で出さなくなるので、名前の配列を持たずに済む。
  */
  pre_event_answered: 'target',

  /*
    同じ人が登録して直して、を1行に。**人ごとに分ける** — まとめてしまうと
    「3人が登録した」のか「1人が3回直した」のかが区別できなくなる。
  */
  participation_registered: 'target+actor',
  participation_cancelled: 'target+actor',

  /*
    ここから下は畳まない。1件ずつが別の出来事で、
    まとめると「何件あったか」ではなく「何があったか」が失われる。
  */
  participation_requested: 'none',
  participation_approved: 'none',
  participation_rejected: 'none',
  participation_removed: 'none',
  event_cancelled: 'none',
  pre_event_deleted: 'none',
  pre_event_promoted: 'none',
  organizer_assigned: 'none',
  organizer_unassigned: 'none',
  org_admin_added: 'none',
}
