/**
 * 何をしようとしてログイン画面へ来たのか。
 *
 * **弾かれた人には、まず理由が要る。** `/events/create` を押した人が
 * 何の説明もなくログイン画面に立たされると、押し間違えたのか、
 * 作成機能が消えたのかが分からない。戻り先（`callbackUrl`）は
 * `proxy.ts` と各画面が付けているので、そこから読み取る。
 *
 * **表に無い行き先では何も出さない。** 直接ログイン画面へ来た人に
 * 「◯◯するにはログインが必要です」と言うと、こちらが用も無いのに
 * 用件を決めつけたことになる。
 */
const REASONS: { pattern: RegExp; action: string }[] = [
  { pattern: /^\/events\/create$/, action: 'イベントを作成する' },
  { pattern: /^\/pre-events\/create$/, action: '日程調整を作成する' },
  { pattern: /^\/orgs\/create$/, action: 'グループを作成する' },

  { pattern: /^\/events\/[^/]+\/edit$/, action: 'イベントを編集する' },
  { pattern: /^\/pre-events\/[^/]+\/edit$/, action: '日程調整を編集する' },
  { pattern: /^\/orgs\/[^/]+\/edit$/, action: 'グループを編集する' },
  { pattern: /^\/events\/[^/]+\/edit-participants$/, action: '参加者を編集する' },
  { pattern: /^\/events\/[^/]+\/register$/, action: '出欠を記録する' },
  { pattern: /^\/events\/[^/]+\/cancel$/, action: 'イベントを中止する' },
  { pattern: /^\/(events|pre-events)\/[^/]+\/contact$/, action: '参加者へ連絡する' },

  /*
    詳細ページ。**作成・ハッシュタグ一覧と同じ形なので、上の行より
    後ろに置く。** `/events/create` が「イベントに参加登録する」に
    化けると、押した操作と説明が食い違う。
  */
  // 旧URL（`/hashtags/…` へ送られる）。戻り先に残っていることがある
  { pattern: /^\/events\/hashtag\//, action: '' },
  { pattern: /^\/events\/[^/]+$/, action: 'イベントに参加登録する' },
  { pattern: /^\/pre-events\/[^/]+$/, action: '日程調整に回答する' },

  { pattern: /^\/dashboard(\/|$)/, action: 'マイページを開く' },
  { pattern: /^\/account(\/|$)/, action: 'アカウントの設定を開く' },
  { pattern: /^\/admin(\/|$)/, action: '管理画面を開く' },
]

/**
 * 戻り先から用件を引く。分からなければ `null`。
 *
 * 外から来る値なので、**自サイトの相対パス以外は受け取らない。**
 * ここで返した文字列は画面にそのまま出る（といっても表の中の定数しか
 * 返さないので、行き先の文字が画面へ漏れることはない）。
 */
export function signInReason(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl) return null
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//')) return null

  const path = callbackUrl.split(/[?#]/)[0]
  const hit = REASONS.find((r) => r.pattern.test(path))

  return hit?.action || null
}
