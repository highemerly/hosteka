// Misskey投稿処理

import { isPermissionStatus } from './types'
import type { PostResult, UserCredentials, PostVisibility, MisskeyVisibility } from './types'
import { remoteFetch } from '@/server/remote-fetch'

/**
 * Mastodon形式のvisibilityをMisskey形式に変換する
 *
 * Mastodon → Misskey:
 * - public → public
 * - unlisted → home
 * - private → followers
 * - direct → specified (※visibleUserIds が必要なため非対応)
 *
 * Misskey形式はそのまま通す:
 * - public, home, followers, specified
 */
export function mapVisibilityToMisskey(visibility: string): MisskeyVisibility {
  switch (visibility) {
    // Misskey ネイティブの値
    case 'public':
      return 'public'
    case 'home':
      return 'home'
    case 'followers':
      return 'followers'
    case 'specified':
      return 'specified'
    // Mastodon 形式からの変換
    case 'unlisted':
      return 'home'
    case 'private':
      return 'followers'
    case 'direct':
      return 'specified'
    default:
      return 'public'
  }
}

/**
 * Misskeyに即時投稿する
 */
export async function postToMisskey(
  user: UserCredentials,
  message: string,
  visibility: PostVisibility | MisskeyVisibility = 'public'
): Promise<PostResult> {
  try {
    if (!user.accessToken) {
      return { success: false, error: 'No access token available', kind: 'permission' }
    }

    const misskeyUrl = `https://${user.server}/api/notes/create`
    const misskeyVisibility = mapVisibilityToMisskey(visibility)

    const response = await remoteFetch(misskeyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        i: user.accessToken,
        text: message,
        visibility: misskeyVisibility
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        success: false,
        error: `Misskey API error: ${error}`,
        kind: isPermissionStatus(response.status) ? 'permission' : 'other',
      }
    }

    const postData = await response.json()
    return { success: true, postId: postData.createdNote?.id }

  } catch (error) {
    return { success: false, error: `Network error: ${error}` }
  }
}
