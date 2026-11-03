import type { Metadata } from 'next'

import UserProfileScreen from '@/screens/users/UserProfileScreen'
import { getUserProfileMetadata } from '@/server/metadata/user'

/**
 * ユーザーのページ。
 *
 * **このページはセッションもデータも取得しない。** `generateMetadata` だけが
 * サーバーで動く（OGP はクローラーが JS を実行しないため、サーバー側に残す）。
 * 本文は `UserProfileScreen` がクライアントから `/api/v1` 経由で取る。
 *
 * `handle` は `alice@mastodon.social` の形。`%40` に符号化された形でも、
 * Fediverse の書き方（`@alice@server`）でも同じ人に着く
 * （解釈は `src/lib/user-handle.ts` が1箇所で持つ）。
 */
type Props = { params: Promise<{ handle: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  return getUserProfileMetadata(handle)
}

export default async function UserProfilePage({ params }: Props) {
  const { handle } = await params
  return <UserProfileScreen handle={handle} />
}
