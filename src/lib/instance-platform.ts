/**
 * anypost.dev API を使用してサーバーのプラットフォームを取得するユーティリティ
 */

export type ServerPlatformInfo = {
  server: string
  type: string
}

/**
 * anypost.dev APIからサーバーのプラットフォーム情報を取得
 */
async function fetchServerPlatform(server: string): Promise<string> {
  try {
    const response = await fetch(`https://anypost.dev/api/v1/instances/${encodeURIComponent(server)}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // タイムアウト設定（5秒）
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.warn(`Failed to fetch platform for ${server}: HTTP ${response.status}`)
      return 'unknown'
    }

    const data = await response.json()
    return data.type || 'unknown'
  } catch (error) {
    console.warn(`Failed to fetch platform for ${server}:`, error)
    return 'unknown'
  }
}

/**
 * サーバー名の配列からプラットフォーム情報付きの配列を生成
 * @param servers サーバー名の配列
 * @returns プラットフォーム情報付きのサーバー配列
 */
export async function enrichServersWithPlatform(servers: string[]): Promise<ServerPlatformInfo[]> {
  if (!servers || servers.length === 0) {
    return []
  }

  // 並列でAPIを呼び出す
  const results = await Promise.all(
    servers.map(async (server) => {
      const type = await fetchServerPlatform(server)
      return { server, type }
    })
  )

  return results
}

/**
 * プラットフォームタイプからアイコンカテゴリを判定
 * @param type anypost.dev APIから返されるtype
 * @returns アイコンカテゴリ
 */
export function getPlatformCategory(type: string): 'mastodon' | 'misskey' | 'pleroma' | 'fediverse' {
  const normalizedType = type.toLowerCase()

  // Mastodon系
  if (['mastodon', 'fedibird', 'hometown', 'glitch-soc', 'kmyblue'].includes(normalizedType)) {
    return 'mastodon'
  }

  // Misskey系
  if (['misskey', 'firefish', 'sharkey', 'foundkey', 'calckey', 'iceshrimp', 'catodon', 'cherrypick'].includes(normalizedType)) {
    return 'misskey'
  }

  // Pleroma系
  if (['pleroma', 'akkoma'].includes(normalizedType)) {
    return 'pleroma'
  }

  // その他（Fediverse汎用）
  return 'fediverse'
}
