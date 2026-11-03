import type { OAuthPlatform } from '@/lib/oauth-scopes'
import { STORAGE_SERVER } from '@/lib/storage-keys'

/**
 * 前回ログインに使ったサーバーを覚えておく。
 *
 * **Cookie に置かない。** 読むのはログイン画面だけで、サーバーは使わない。
 * Cookie だと全リクエストで送られ、画面側で書いた Cookie は Safari が
 * 7日に切り詰める。
 *
 * 1つのキーにプラットフォームごとのホスト名を持つ（`{ mastodon: 'handon.club' }`）。
 */

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Remembered = Partial<Record<OAuthPlatform, string>>

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    // プライベートブラウズ等で触れないことがある。覚えていないだけで済ませる
    return null
  }
}

function readAll(storage: StorageLike): Remembered {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_SERVER) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Remembered)
      : {}
  } catch {
    // 壊れた値は無かったことにする（手で書き換えられる場所）
    return {}
  }
}

export function readRememberedServer(
  platform: OAuthPlatform,
  storage: StorageLike | null = defaultStorage()
): string | null {
  if (!storage) return null
  const host = readAll(storage)[platform]
  return typeof host === 'string' && host ? host : null
}

export function rememberServer(
  platform: OAuthPlatform,
  host: string,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_SERVER, JSON.stringify({ ...readAll(storage), [platform]: host }))
  } catch {
    // 容量超過など。覚えられなくてもログインは進める
  }
}

/** アカウント削除のときに使う。消したアカウントの痕跡を残さない */
export function forgetRememberedServers(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_SERVER)
  } catch {
    // 消せなくても続ける
  }
}
