/**
 * ログインのときに相手のサーバーへ要求する権限。
 *
 * **要求する文字列と、利用者に見せる説明をここで一緒に持つ。**
 * register ルートがここから scope を組み立て、ログイン画面のモーダルが
 * 同じ表から説明を出す。別々に書くと、権限を足したのに説明が古いまま、
 * が起きる（説明した以上の権限を黙って取ることになる）。
 *
 * isomorphic。サーバー専用のものを import しない。
 */
export type OAuthPlatform = 'mastodon' | 'misskey' | 'pleroma' | 'twitter' | 'discord'

export type OAuthGrant = {
  /** 相手のサーバーへ送る権限の名前 */
  scope: string
  /** この権限で相手のサーバーが許すこと */
  label: string
  /** Hosteka がこれを何に使うか */
  use: string
}

type PlatformRequest = {
  /** scope の区切り。MiAuth だけカンマ */
  separator: ' ' | ','
  read: readonly OAuthGrant[]
  /**
   * 投稿の権限を足したもの。**無いプラットフォームは投稿を頼めない。**
   * 画面の「読み取り＋投稿」もこれの有無で出し分ける。
   */
  write?: readonly OAuthGrant[]
}

const MASTODON_READ_ACCOUNTS: OAuthGrant = {
  scope: 'read:accounts',
  label: 'プロフィールやフォロー関係など、アカウントの情報を読み取る',
  use: 'ログインした人が誰かを確かめ、ユーザー名・表示名・アイコンを表示します',
}

const MISSKEY_READ_ACCOUNT: OAuthGrant = {
  scope: 'read:account',
  label: 'プロフィールなど、アカウントの情報を読み取る',
  use: MASTODON_READ_ACCOUNTS.use,
}

export const OAUTH_REQUESTS: Record<OAuthPlatform, PlatformRequest> = {
  mastodon: {
    separator: ' ',
    read: [MASTODON_READ_ACCOUNTS],
    write: [
      MASTODON_READ_ACCOUNTS,
      {
        scope: 'read:statuses',
        label: '閲覧できる投稿や予約投稿を読み取る',
        use: 'Hosteka から予約した投稿を一覧で確認します',
      },
      {
        scope: 'write:statuses',
        label: 'あなたのアカウントで投稿・削除する',
        use: '参加者への連絡を、あなたのアカウントから投稿します',
      },
    ],
  },
  misskey: {
    separator: ',',
    read: [MISSKEY_READ_ACCOUNT],
    write: [
      MISSKEY_READ_ACCOUNT,
      {
        scope: 'write:notes',
        label: 'あなたのアカウントでノートを作成・削除する',
        use: '参加者への連絡を、あなたのアカウントからノートします',
      },
    ],
  },
  pleroma: {
    separator: ' ',
    read: [MASTODON_READ_ACCOUNTS],
  },
  twitter: {
    separator: ' ',
    read: [
      {
        scope: 'users.read',
        label: 'プロフィールなど、ユーザーの情報を読み取る',
        use: 'ログインした人が誰かを確かめ、ユーザー名・表示名・アイコンを表示します',
      },
      {
        scope: 'tweet.read',
        label: '閲覧できるポストを読み取る',
        use: 'ポストは読みません。X ではユーザーの情報を取得するのに、この権限も合わせて求められます',
      },
    ],
  },
  discord: {
    separator: ' ',
    read: [
      {
        scope: 'identify',
        label: 'ユーザー名やアイコンなど、アカウントの情報を読み取る（メールアドレスは含みません）',
        use: 'ログインした人が誰かを確かめ、ユーザー名・表示名・アイコンを表示します',
      },
    ],
  },
}

/** 投稿の権限を頼めるプラットフォームか */
export function canRequestWrite(platform: OAuthPlatform): boolean {
  return OAUTH_REQUESTS[platform].write !== undefined
}

/**
 * 要求する権限の一覧。**頼めないプラットフォームで write を渡しても
 * 読み取りのものを返す** — 画面の選択とサーバーの要求を食い違わせない。
 */
export function oauthGrants(platform: OAuthPlatform, write: boolean): readonly OAuthGrant[] {
  const request = OAUTH_REQUESTS[platform]
  return write && request.write ? request.write : request.read
}

/** 相手のサーバーへ送る scope の文字列 */
export function oauthScope(platform: OAuthPlatform, write: boolean): string {
  return oauthGrants(platform, write)
    .map((g) => g.scope)
    .join(OAUTH_REQUESTS[platform].separator)
}
