import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * セッション失効のプロセス内キャッシュ。
 *
 * JWT の署名検証はステートレスに行えるが、それだけでは「失効させる」ことが
 * できない。かといってリクエスト毎に sessions を引くのは避けたい。
 *
 * そこで **失効済みかつ未期限切れのセッションIDだけ**をメモリに持ち、
 * 一定間隔で差分だけを取り込む。DBコストは「リクエスト毎」ではなく
 * 「ポッド毎・ポーリング間隔毎に1クエリ」になる。
 *
 * 保持するのは失効済みのみ・最大14日なので、10万件でも約6MBに収まる。
 */

const POLL_MS = Number(process.env.SESSION_REVOCATION_POLL_MS ?? 30_000)
/** これを超えて更新できていない場合、キャッシュを信用せずDBに問い合わせる */
const STALE_HARD_LIMIT_MS = 5 * 60_000
/** 劣化モード時の個別問い合わせのメモ化時間 */
const DEGRADED_MEMO_MS = 10_000
/**
 * watermark より手前も、この幅だけ重ねて取り直す。
 *
 * **`revokedAt` は失効させたポッドの時計で入る**（`session.ts` の
 * `new Date()`）うえ、コミットの順は `revokedAt` の順と一致しない。
 * ポッド A が 100 で書いてコミットが遅れ、その間に B が 101 でコミットすると、
 * 101 を見て watermark を進めたポッドは、後から入った 100 を二度と取り込まない
 * （＝失効したセッションが期限の14日まで通る）。時計のずれでも同じことが起きる。
 *
 * 重ねて取った行を入れ直しても `Map.set` は同じ結果になるので害は無い。
 * 幅は「ポッド間の時計のずれ＋書いてからコミットまで」を十分に覆う大きさにする。
 */
const WATERMARK_OVERLAP_MS = 5 * 60_000

type State = {
  /** sessionId -> 失効エントリが不要になる時刻(ms) */
  revoked: Map<string, number>
  /** ここまでの revokedAt は取り込み済み、という基準時刻 */
  watermark: Date
  loadedAt: number
  ready: Promise<void> | null
  timer: ReturnType<typeof setInterval> | null
  degradedMemo: Map<string, { at: number; revoked: boolean }>
}

const state: State = {
  revoked: new Map(),
  watermark: new Date(0),
  loadedAt: 0,
  ready: null,
  timer: null,
  degradedMemo: new Map(),
}

/** テスト用。モジュール状態を初期化する */
export function __resetRevocationCache(): void {
  if (state.timer) clearInterval(state.timer)
  state.revoked = new Map()
  state.watermark = new Date(0)
  state.loadedAt = 0
  state.ready = null
  state.timer = null
  state.degradedMemo = new Map()
}

function prune(now: number): void {
  for (const [sid, expMs] of state.revoked) {
    // JWT 自体が期限切れなら、失効エントリを持つ意味はない
    if (expMs <= now) state.revoked.delete(sid)
  }
}

/**
 * watermark 以降に失効した行を取り込む（`WATERMARK_OVERLAP_MS` だけ手前から）。
 *
 * watermark は **DB が返した revokedAt** から進める。読み込んだポッドの時計で
 * 進めると、失効させたポッドとのずれの分だけ取りこぼす。
 */
async function refresh(): Promise<void> {
  const rows = await prisma.session.findMany({
    where: {
      revokedAt: { gt: new Date(state.watermark.getTime() - WATERMARK_OVERLAP_MS) },
      expiresAt: { gt: new Date() },
    },
    select: { id: true, expiresAt: true, revokedAt: true },
    orderBy: { revokedAt: 'asc' },
  })

  for (const row of rows) {
    state.revoked.set(row.id, row.expiresAt.getTime())
    if (row.revokedAt && row.revokedAt > state.watermark) state.watermark = row.revokedAt
  }

  state.loadedAt = Date.now()
  prune(state.loadedAt)
}

/**
 * 起動時に必ず一度読み込んでから応答する。
 * 空集合のまま配信を始めると、その間だけ失効が効かない窓ができてしまう。
 */
function ensureStarted(): Promise<void> {
  if (state.ready) return state.ready

  state.ready = refresh().catch((e) => {
    // 起動時に失敗した場合は ready を落として次回に再試行させる。
    // ここで握り潰すと「一度も読み込めていないのに ready」になってしまう。
    state.ready = null
    throw e
  })

  if (!state.timer) {
    state.timer = setInterval(() => {
      refresh().catch(() => {
        // 失敗しても stale なまま配信を続ける。閾値を超えたら劣化モードへ落ちる。
      })
    }, POLL_MS)
    // Node のイベントループを掴んだままにしない
    state.timer.unref?.()
  }

  return state.ready
}

async function isRevokedDegraded(sessionId: string): Promise<boolean> {
  const now = Date.now()
  const memo = state.degradedMemo.get(sessionId)
  if (memo && now - memo.at < DEGRADED_MEMO_MS) return memo.revoked

  const row = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { revokedAt: true },
  })
  const revoked = row?.revokedAt != null
  state.degradedMemo.set(sessionId, { at: now, revoked })
  return revoked
}

/**
 * セッションが失効しているか。
 *
 * 失敗時は **open ではなく DB に落ちる**。どのルートもいずれ Prisma に触れるので、
 * DBが死んでいるときに認証が通らなくなるのは新しい障害モードではない。
 * 逆に「キャッシュが stale なまま open で通す」は静かな穴になるので採らない。
 */
export async function isRevoked(sessionId: string): Promise<boolean> {
  try {
    await ensureStarted()
  } catch {
    return isRevokedDegraded(sessionId)
  }

  // タイマーだけに頼ると、イベントループが詰まった場合に古さを検知できない
  if (Date.now() - state.loadedAt > STALE_HARD_LIMIT_MS) {
    return isRevokedDegraded(sessionId)
  }

  return state.revoked.has(sessionId)
}

/** 失効させたポッドでは即座に反映する（他ポッドは次のポーリングで追いつく） */
export function markRevokedLocally(sessionId: string, expiresAt: Date): void {
  state.revoked.set(sessionId, expiresAt.getTime())
}

/** テスト・監視用 */
export function __cacheStats() {
  return {
    size: state.revoked.size,
    watermark: state.watermark,
    loadedAt: state.loadedAt,
    started: state.ready !== null,
  }
}
