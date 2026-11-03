import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * セッションの「最終利用」（`sessions.lastUsedAt`）を進める。
 *
 * **以前はどこからも更新していなかった。** 列の既定値（`now()`）が入ったきり
 * なので、`/account/sessions` の「最終利用」は常にログインした時刻だった。
 *
 * リクエストのたびに書くと、読むだけのAPIがすべて書き込みを伴う
 * （書き込み増幅）。**セッションあたり最大1時間に1回**に絞る。
 * 表示は最大でその分だけ古い — 「身に覚えのない端末が最近使われたか」を
 * 見るには足りる。
 *
 * 絞り込みは2段:
 * 1. プロセス内の覚え書き。1時間以内に試したセッションは DB へ行かない
 * 2. `WHERE lastUsedAt < 1時間前`。ポッドが複数あっても、再起動で
 *    覚え書きが消えても、行が書き換わるのは1時間に1回
 */
export const TOUCH_INTERVAL_MS = 60 * 60_000

/** sessionId -> 最後に更新を試した時刻(ms) */
const attemptedAt = new Map<string, number>()
let sweptAt = 0

/** テスト用。モジュール状態を初期化する */
export function __resetSessionActivity(): void {
  attemptedAt.clear()
  sweptAt = 0
}

/** 間隔を過ぎた覚え書きはもう判定に使わない。持ち続けると単調に増える */
function sweep(now: number): void {
  if (now - sweptAt < TOUCH_INTERVAL_MS) return
  sweptAt = now
  for (const [sid, at] of attemptedAt) {
    if (now - at >= TOUCH_INTERVAL_MS) attemptedAt.delete(sid)
  }
}

/**
 * セッションが使われたことを記録する。**待たない・投げない。**
 *
 * 応答を書き込みの完了まで待たせる理由が無く、失敗しても認証は通してよい
 * （表示が古くなるだけ）。握り潰すと気づけないのでログには残す。
 */
export function touchSession(sessionId: string): void {
  const now = Date.now()
  const last = attemptedAt.get(sessionId)
  if (last !== undefined && now - last < TOUCH_INTERVAL_MS) return

  sweep(now)
  attemptedAt.set(sessionId, now)

  prisma.session
    .updateMany({
      // 失効済みの行は動かさない。切ったあとに「使われた」ことにしない
      where: {
        id: sessionId,
        revokedAt: null,
        lastUsedAt: { lt: new Date(now - TOUCH_INTERVAL_MS) },
      },
      data: { lastUsedAt: new Date(now) },
    })
    .catch((error: unknown) => {
      // 次のリクエストでやり直せるように、試したことを忘れる
      attemptedAt.delete(sessionId)
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'session.touch_failed',
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
    })
}
