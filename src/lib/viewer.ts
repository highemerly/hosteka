/**
 * ビューア Cookie（`ht-viewer`）の読み出し。
 *
 * **この値は認可に使ってはならない。** httpOnly ではないので閲覧者が
 * 自由に書き換えられる。ヘッダーの名前やアバター、ログイン済みかどうかの
 * 出し分けといった**表示のためだけ**に使う。実際の権限は毎回 API が決める。
 *
 * 署名も検証もしない。署名すると「信頼してよい」という誤ったシグナルになる。
 * サーバー側からは一切参照しない（`src/server/auth/cookies.ts` が書くだけ）。
 */

export type Viewer = {
  id: string
  name: string
  avatar: string | null
  isAdmin: boolean
  username: string
  server: string
  platform: string
  v: 1
}

const FEDIVERSE_PLATFORMS = ['mastodon', 'misskey', 'pleroma']

export function isFediverseViewer(viewer: Viewer | null): boolean {
  return Boolean(viewer && FEDIVERSE_PLATFORMS.includes(viewer.platform))
}

/** base64url をブラウザで復号する。Buffer は使えない */
function decodeBase64Url(raw: string): string {
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Cookie 値を Viewer にする。
 * **壊れた値・バージョン違いはすべて null に倒す。** 書き換えられる前提で扱う。
 */
export function parseViewerCookie(raw: string | undefined | null): Viewer | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(decodeBase64Url(raw))
    if (parsed?.v !== 1) return null
    if (typeof parsed.id !== 'string' || !parsed.id) return null
    if (typeof parsed.name !== 'string') return null
    return parsed as Viewer
  } catch {
    return null
  }
}

/** document.cookie から1つ取り出す */
export function readCookie(name: string, cookieString: string): string | undefined {
  for (const part of cookieString.split('; ')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1)
  }
  return undefined
}
