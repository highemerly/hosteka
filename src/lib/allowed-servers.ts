import { getPlatformCategory } from './instance-platform'

/**
 * 参加を許可されたサーバーの解釈。
 *
 * `Event.allowedFediverseServers` は2つの形式が混在している。
 *   旧: `["handon.club", "mastodon.social"]`
 *   新: `[{ "server": "handon.club", "type": "mastodon" }, …]`
 * 新形式はイベント作成/更新時に anypost.dev で種別を引いて保存したもの
 * （api/v1/events の enrichServersWithPlatform）。**表示のたびに外部APIへ
 * 問い合わせない。** 保存済みの値を読む。
 *
 * 旧形式のイベントは種別が分からない。その場合は platform を null にして、
 * 呼び出し側が「Fediverse 一般」として扱えるようにする。
 */

export type FediversePlatform = 'mastodon' | 'misskey' | 'pleroma'

export type AllowedServer = {
  server: string
  /** 分からない場合は null（旧形式、または未知の実装） */
  platform: FediversePlatform | null
}

/** 表示順。ロゴを並べる順序をここに固定する */
export const FEDIVERSE_PLATFORM_ORDER: readonly FediversePlatform[] = [
  'mastodon',
  'misskey',
  'pleroma',
]

function toPlatform(type: unknown): FediversePlatform | null {
  if (typeof type !== 'string' || !type) return null
  const category = getPlatformCategory(type)
  return category === 'fediverse' ? null : category
}

/** 保存された JSON 文字列を、種別つきのサーバー一覧にする */
export function parseAllowedServers(value: string | null | undefined): AllowedServer[] {
  if (!value) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    // 壊れた JSON は「制限なし」として扱う（isUserAllowed と同じ挙動）
    return []
  }
  if (!Array.isArray(parsed)) return []

  const result: AllowedServer[] = []
  for (const item of parsed) {
    if (typeof item === 'string') {
      if (item) result.push({ server: item, platform: null })
      continue
    }
    if (item && typeof item === 'object' && 'server' in item) {
      const server = (item as { server: unknown }).server
      if (typeof server === 'string' && server) {
        result.push({ server, platform: toPlatform((item as { type?: unknown }).type) })
      }
    }
  }
  return result
}

/**
 * サーバー一覧に実際に現れるプラットフォーム。
 *
 * **1つでも種別不明があれば null を返す。** 「handon.club と mastodon.social
 * だから Mastodon のみ」と言えるのは、全部の種別が分かっているときだけ。
 * 一部だけ分かっている状態で絞り込むと、分からなかったサーバーの利用者に
 * 「対象外」と読める表示を出すことになる。
 */
export function distinctPlatforms(servers: AllowedServer[]): FediversePlatform[] | null {
  if (servers.length === 0) return null
  if (servers.some((s) => s.platform === null)) return null

  const present = new Set(servers.map((s) => s.platform))
  return FEDIVERSE_PLATFORM_ORDER.filter((p) => present.has(p))
}

/**
 * プラットフォームごとにまとめる。ポップオーバーの入れ子表示用。
 * 種別不明のサーバーは最後に platform: null のグループとして残す。
 */
export function groupByPlatform(
  servers: AllowedServer[]
): { platform: FediversePlatform | null; servers: string[] }[] {
  const groups: { platform: FediversePlatform | null; servers: string[] }[] = []

  for (const platform of FEDIVERSE_PLATFORM_ORDER) {
    const matched = servers.filter((s) => s.platform === platform).map((s) => s.server)
    if (matched.length > 0) groups.push({ platform, servers: matched })
  }

  const unknown = servers.filter((s) => s.platform === null).map((s) => s.server)
  if (unknown.length > 0) groups.push({ platform: null, servers: unknown })

  return groups
}
