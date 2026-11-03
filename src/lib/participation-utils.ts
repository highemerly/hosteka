/**
 * 参加登録に関するユーティリティ関数
 */

// =============================================================================
// サーバー制限判定
// =============================================================================

/**
 * allowedFediverseServers からサーバー名の配列を抽出
 * 新形式（オブジェクト配列）と旧形式（文字列配列）の両方に対応
 */
export function extractServerNamesFromAllowedServers(allowedServers: unknown): string[] {
  if (!Array.isArray(allowedServers)) return []
  if (allowedServers.length === 0) return []

  // 新形式: オブジェクト配列
  if (typeof allowedServers[0] === 'object' && allowedServers[0] !== null && 'server' in allowedServers[0]) {
    return allowedServers.map((item: { server: string }) => item.server)
  }

  // 旧形式: 文字列配列
  if (typeof allowedServers[0] === 'string') {
    return allowedServers as string[]
  }

  return []
}

/**
 * ユーザーがイベント/日程調整に参加可能かどうかを判定
 */
export function isUserAllowed(
  userPlatform: string | undefined,
  userServer: string | undefined,
  settings: {
    isAllowedForFediverse: boolean
    isAllowedForDiscord: boolean
    isAllowedForTwitter?: boolean
    allowedFediverseServers?: string | null
  }
): boolean {
  if (!userPlatform) return false

  const isFediverseUser = ['mastodon', 'misskey', 'pleroma'].includes(userPlatform)
  const isDiscordUser = userPlatform === 'discord'
  const isTwitterUser = userPlatform === 'twitter'

  // プラットフォーム許可チェック
  if (isFediverseUser && !settings.isAllowedForFediverse) return false
  if (isDiscordUser && !settings.isAllowedForDiscord) return false
  if (isTwitterUser && !settings.isAllowedForTwitter) return false
  if (!isFediverseUser && !isDiscordUser && !isTwitterUser) return false

  // Fediverseサーバー制限チェック
  if (isFediverseUser && settings.allowedFediverseServers) {
    try {
      const parsed = JSON.parse(settings.allowedFediverseServers)
      const serverNames = extractServerNamesFromAllowedServers(parsed)
      // **サーバーが分からないなら通さない。** 「参加できる」に倒すと、
      // 制限を掛けたのに素通りする
      if (serverNames.length > 0) {
        return !!userServer && serverNames.includes(userServer)
      }
    } catch {
      // JSONパースエラーの場合は制限なしとして扱う
    }
  }

  return true
}

/** 参加できない理由。プラットフォーム自体か、Fediverse のサーバーか */
export type IneligibilityReason = 'platform' | 'server'

/**
 * なぜ参加できないかを返す。参加できるなら null。
 *
 * isUserAllowed は真偽しか返さないため、画面は「参加条件を満たしていません」
 * としか言えなかった。**理由が分からないと、利用者は次に何をすればいいか
 * 決められない。** 別アカウントで入り直せば済むのか、そもそも無理なのかは
 * ここでしか分からない。
 *
 * 判定順は isUserAllowed と同じにしてある。ずれると
 * 「参加できないのに理由が null」が起きる。
 */
export function explainIneligibility(
  userPlatform: string | undefined,
  userServer: string | undefined,
  settings: {
    isAllowedForFediverse: boolean
    isAllowedForDiscord: boolean
    isAllowedForTwitter?: boolean
    allowedFediverseServers?: string | null
  }
): IneligibilityReason | null {
  if (isUserAllowed(userPlatform, userServer, settings)) return null
  if (!userPlatform) return 'platform'

  const isFediverseUser = ['mastodon', 'misskey', 'pleroma'].includes(userPlatform)

  // Fediverse が許可されていて弾かれたなら、原因はサーバー限定しかない
  if (isFediverseUser && settings.isAllowedForFediverse) return 'server'

  return 'platform'
}

/**
 * プラットフォームとサーバーの制限を満たすか。
 *
 * イベントと日程調整で**完全に同一**のロジックだが、
 * api/v1/events/route.ts と api/v1/pre-events/route.ts にそれぞれ private な
 * checkUserCanParticipate として書き写されていた。片方だけ直る事故を防ぐため
 * ここへ切り出す。前後の条件（中止・満員・期限など）は種別ごとに異なるので
 * 呼び出し側に残す。
 */
export function isPlatformAllowed(
  target: {
    isAllowedForDiscord: boolean
    isAllowedForFediverse: boolean
    allowedFediverseServers: string | null
  },
  userPlatform: string | undefined,
  userServer: string | undefined
): boolean {
  if (userPlatform === 'discord') {
    return target.isAllowedForDiscord
  }

  // Fediverse (mastodon / misskey / pleroma)
  if (!target.isAllowedForFediverse) return false

  if (target.allowedFediverseServers) {
    try {
      const serverNames = extractServerNamesFromAllowedServers(
        JSON.parse(target.allowedFediverseServers)
      )
      if (serverNames.length > 0 && (!userServer || !serverNames.includes(userServer))) {
        return false
      }
    } catch {
      // 壊れた JSON は「制限なし」として扱う（従来の挙動を踏襲）
    }
  }

  return true
}
