// Mastodon投稿処理

import { isPermissionStatus } from './types'
import type { PostResult, ScheduledPostResult, UserCredentials, PostVisibility } from './types'
import { remoteFetch } from '@/server/remote-fetch'

/**
 * Mastodonに即時投稿する
 */
export async function postToMastodon(
  user: UserCredentials,
  message: string,
  visibility: PostVisibility = 'public'
): Promise<PostResult> {
  try {
    if (!user.accessToken) {
      return { success: false, error: 'No access token available', kind: 'permission' }
    }

    const mastodonUrl = `https://${user.server}/api/v1/statuses`

    const response = await remoteFetch(mastodonUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: message,
        visibility: visibility
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        success: false,
        error: `Mastodon API error: ${error}`,
        kind: isPermissionStatus(response.status) ? 'permission' : 'other',
      }
    }

    const postData = await response.json()
    return { success: true, postId: postData.id }

  } catch (error) {
    return { success: false, error: `Network error: ${error}` }
  }
}

/**
 * Mastodonに予約投稿する
 */
export async function scheduleToMastodon(
  user: UserCredentials,
  message: string,
  scheduledFor: string,
  visibility: PostVisibility = 'public'
): Promise<ScheduledPostResult> {
  try {
    if (!user.accessToken) {
      return { success: false, error: 'No access token available', kind: 'permission' }
    }

    const scheduledAt = new Date(scheduledFor).toISOString()
    const mastodonUrl = `https://${user.server}/api/v1/statuses`

    const response = await remoteFetch(mastodonUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: message,
        scheduled_at: scheduledAt,
        visibility: visibility
      })
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        success: false,
        error: `Mastodon API error: ${error}`,
        kind: isPermissionStatus(response.status) ? 'permission' : 'other',
      }
    }

    const scheduledStatus = await response.json()
    return {
      success: true,
      scheduledStatusId: scheduledStatus.id,
      scheduledFor: scheduledAt
    }

  } catch (error) {
    return { success: false, error: `Network error: ${error}` }
  }
}
