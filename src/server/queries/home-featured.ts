import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

import { PUBLIC_EVENT_CONDITIONS } from './event-list'

/**
 * トップページに流すイベントの母集合と並び。
 *
 * **一覧（`/api/v1/events/sections`）とは目的が違う。** あちらは
 * 「まだ参加登録していないイベントを見つける」ための面なので、
 * ログイン中の利用者ごとに中身が変わる。こちらは**看板**で、
 * 全閲覧者に同じものを見せる（＝CDN にキャッシュできる）。
 *
 * そのため終わったイベントも外さない。開催日の**近さ**（過去も未来も）で
 * 評価するので、直近で賑わったイベントも「動いているサービス」として出る。
 */

/** 並べ替えの候補として読む件数。ここから絞る */
export const HOME_FEATURED_POOL = 50

/** 実際に流す件数 */
export const HOME_FEATURED_SIZE = 20

/**
 * 看板に出してよいイベント。
 *
 * 公開・表示対象・無効化されていないことは `PUBLIC_EVENT_CONDITIONS` が持つ。
 * **中止だけここで足す。** カードは中止バッジを出すが、看板に並べる意味は
 * もう無い（押しても登録できない）。
 */
export const HOME_FEATURED_WHERE: Prisma.EventWhereInput = {
  AND: [...PUBLIC_EVENT_CONDITIONS, { status: { not: 'cancelled' } }],
}

/** 並べ替えに要る分だけ。`EVENT_LIST_SELECT` の一部 */
type Rankable = {
  startDate: Date
  _count: { participants: number }
}

/** 参加者数の重み。人数の差が線形に効くと、大規模なイベントだけが並ぶ */
function participantScore(count: number): number {
  return Math.log(count + 1) * 10
}

/**
 * 開催日の近さの重み。**過去と未来を区別しない。**
 * 30日より離れたものは 0（それ以上遠ざかっても差を付けない）。
 */
function dateScore(days: number): number {
  return Math.max(0, 30 - Math.min(days, 30))
}

/**
 * 看板に流す順に並べ替える。
 *
 * **DB の `orderBy` では書けない。** 「今日からの距離」は `now` に依存し、
 * 参加者数との合成もクエリでは表せないため、母集合を多めに読んでから
 * ここで決める。純関数にしてあるのは、点数の付け方を目で確かめられないから。
 */
export function rankFeatured<T extends Rankable>(events: T[], now: Date): T[] {
  return events
    .map((event) => {
      const diffMs = Math.abs(event.startDate.getTime() - now.getTime())
      /*
        **時刻帯は要らない。** 「何日離れているか」は瞬間どうしの引き算で
        決まる（CLAUDE.md の Timezone Handling）。JST の壁掛け時計 Date を
        混ぜると非JST環境で9時間ずれる。
      */
      const days = Math.ceil(diffMs / 86_400_000)
      return { event, score: participantScore(event._count.participants) + dateScore(days) }
    })
    // 同点は DB から来た順のまま（Array#sort は安定）
    .sort((a, b) => b.score - a.score)
    .slice(0, HOME_FEATURED_SIZE)
    .map((scored) => scored.event)
}
