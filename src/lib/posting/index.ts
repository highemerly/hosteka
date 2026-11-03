// 投稿処理のエクスポート

export type {
  PostResult,
  ScheduledPostResult,
  UserCredentials,
  PostVisibility,
  MisskeyVisibility
} from './types'

export { isPermissionStatus } from './types'
export { postToMastodon, scheduleToMastodon } from './mastodon'
export { postToMisskey, mapVisibilityToMisskey } from './misskey'
