/**
 * WebFinger検証ユーティリティ（監査ログ用）
 *
 * RFC 7033に基づき、ユーザーが指定されたサーバーに実際に存在するかを検証します。
 *
 * 注意: この検証は監査ログ目的のみで使用されます。
 * 主要な安全性は Authorization Code Flow (Mastodon/Pleroma) および
 * MiAuth (Misskey) により、Hostekaサーバーが正規サーバーに直接
 * code/sessionId を検証することで担保されています。
 */

import { remoteFetch } from '@/server/remote-fetch'

export interface WebFingerLink {
  rel: string
  type?: string
  href?: string
  template?: string
}

export interface WebFingerResponse {
  subject: string
  aliases?: string[]
  links?: WebFingerLink[]
}

export interface WebFingerValidationResult {
  valid: boolean
  error?: string
  details?: {
    expectedSubject: string
    actualSubject?: string
  }
}

/**
 * WebFingerを使用してユーザーの存在を検証します
 *
 * @param username - 検証するユーザー名
 * @param server - ユーザーが所属するサーバー
 * @param platform - プラットフォーム種別（mastodon, misskey, pleroma）
 * @returns 検証結果
 */
export async function verifyUserWithWebFinger(
  username: string,
  server: string,
  platform: 'mastodon' | 'misskey' | 'pleroma'
): Promise<WebFingerValidationResult> {
  const resource = `acct:${username}@${server}`
  const webfingerUrl = `https://${server}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`

  try {
    const response = await remoteFetch(webfingerUrl, {
      headers: {
        'Accept': 'application/jrd+json, application/json',
        'User-Agent': 'Hosteka/1.0',
      },
      timeoutMs: 10000,
    })

    if (!response.ok) {
      // 404の場合はユーザーが存在しない
      if (response.status === 404) {
        return {
          valid: false,
          error: 'user_not_found',
          details: { expectedSubject: resource },
        }
      }

      // その他のエラー
      return {
        valid: false,
        error: `webfinger_error_${response.status}`,
        details: { expectedSubject: resource },
      }
    }

    const data: WebFingerResponse = await response.json()

    // subjectが期待通りかチェック
    // WebFingerのsubjectは "acct:username@server" 形式
    const expectedSubjects = [
      resource,
      `acct:${username.toLowerCase()}@${server.toLowerCase()}`,
    ]

    const actualSubject = data.subject?.toLowerCase()
    const subjectMatches = expectedSubjects.some(
      expected => expected.toLowerCase() === actualSubject
    )

    if (!subjectMatches) {
      // aliasesにも含まれているか確認
      const aliasMatches = data.aliases?.some(alias => {
        const normalizedAlias = alias.toLowerCase()
        return expectedSubjects.some(
          expected => expected.toLowerCase() === normalizedAlias
        )
      })

      if (!aliasMatches) {
        return {
          valid: false,
          error: 'subject_mismatch',
          details: {
            expectedSubject: resource,
            actualSubject: data.subject,
          },
        }
      }
    }

    // ActivityPub対応サーバーの場合、ActivityPubリンクがあるか確認
    // これにより、正当なFediverseサーバーであることをさらに検証
    if (platform === 'mastodon' || platform === 'pleroma') {
      const hasActivityPubLink = data.links?.some(
        link => link.rel === 'self' && link.type === 'application/activity+json'
      )

      if (!hasActivityPubLink) {
        // ActivityPubリンクがなくても、subjectが一致していれば許可
        // （一部の古いサーバーではリンクがない場合がある）
        console.warn(`WebFinger: No ActivityPub link found for ${resource}, but subject matches`)
      }
    }

    return { valid: true }
  } catch (error) {
    // タイムアウトやネットワークエラー
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return {
          valid: false,
          error: 'webfinger_timeout',
          details: { expectedSubject: resource },
        }
      }
    }

    console.error('WebFinger verification error:', error)
    return {
      valid: false,
      error: 'webfinger_network_error',
      details: { expectedSubject: resource },
    }
  }
}

/**
 * Misskeyサーバー向けの追加検証
 * MisskeyはWebFingerに加えて、独自のAPIでもユーザー検証が可能
 *
 * @param username - 検証するユーザー名
 * @param server - ユーザーが所属するサーバー
 * @param accessToken - Misskeyのアクセストークン
 * @returns 検証結果
 */
export async function verifyMisskeyUser(
  username: string,
  server: string,
  accessToken: string
): Promise<WebFingerValidationResult> {
  // まずWebFingerで検証
  const webfingerResult = await verifyUserWithWebFinger(username, server, 'misskey')

  if (webfingerResult.valid) {
    return webfingerResult
  }

  // WebFingerが失敗した場合、Misskey APIで再検証
  // （一部のMisskeyサーバーではWebFingerが正しく設定されていない場合がある）
  try {
    const response = await remoteFetch(`https://${server}/api/users/show`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hosteka/1.0',
      },
      body: JSON.stringify({
        i: accessToken,
        username: username,
      }),
      timeoutMs: 10000,
    })

    if (!response.ok) {
      return webfingerResult // WebFingerのエラーをそのまま返す
    }

    const userData = await response.json()

    // ユーザー名が一致するか確認
    if (userData.username?.toLowerCase() === username.toLowerCase()) {
      return { valid: true }
    }

    return {
      valid: false,
      error: 'username_mismatch',
      details: {
        expectedSubject: `acct:${username}@${server}`,
        actualSubject: userData.username ? `acct:${userData.username}@${server}` : undefined,
      },
    }
  } catch (error) {
    console.error('Misskey user verification error:', error)
    return webfingerResult // WebFingerのエラーをそのまま返す
  }
}
