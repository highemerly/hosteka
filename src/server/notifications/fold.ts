import 'server-only'

import type { FoldStrategy } from './kinds'

/**
 * 畳む鍵。**これが「連続編集を1件にまとめる」の実装そのもの。**
 *
 * `notifications` には `@@unique([userId, kind, targetType, targetId, foldKey])` が
 * 付いている。同じ鍵の行は1つしか作れないので、2件目以降は
 * `createMany({ skipDuplicates: true })` が黙って飛ばし、`updateMany` が
 * 時刻と回数だけを更新する。**if 文ではなく制約が保証する** — 同時に走っても
 * 重複行ができない。
 *
 * 鍵に入れるのは**受信者がその時点で持っていた既読位置**。
 *
 *   - まだ読んでいない間は既読位置が動かない → 鍵が同じ → 畳まれる
 *   - 通知を見た時点で既読位置が動く         → 鍵が変わる → 次からは新しい行
 *
 * つまり「読む前に何度編集されても1件、読んだ後の編集は新しい1件」が、
 * 判定を書かずに成り立つ。
 *
 * 畳まない種別は null を返す。**Postgres の一意制約は NULL どうしを別物として
 * 扱う**ので、null の行はいくつでも作れる。
 */
export function foldKeyFor(
  strategy: FoldStrategy,
  seenAt: Date,
  actorId: string | null
): string | null {
  switch (strategy) {
    case 'none':
      return null
    case 'target':
      return seenAt.toISOString()
    case 'target+actor':
      return `${seenAt.toISOString()}:${actorId ?? ''}`
  }
}
