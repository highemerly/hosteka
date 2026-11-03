import 'server-only'

/**
 * Prisma のモデルをワイヤ上のDTOへ変換する**唯一の場所**。
 *
 * `include: { creator: true }` で取得した User をそのまま Client Component へ
 * 渡すと、accessToken / ipAddresses / isAdmin / lastLoginAt が HTML に載る。
 * 呼び出し側の select に頼ると、同じ間違いをいつでも繰り返せる。
 * ここを通すことで、**機密が漏れないことが型と実装で保証される**
 * （漏らすには意図的にこのファイルを書き換える必要がある）。
 */

/** 機密フィールド。DTOに現れてはならない */
export const FORBIDDEN_USER_FIELDS = [
  'accessToken',
  'ipAddresses',
  'lastLoginAt',
  'lastTermsAcceptedAt',
  /*
    連絡先のメールアドレス。**共有のDTOには絶対に現れない。**
    ログイン中の閲覧者が押して初めて見えるもので、置き場は
    `GET /api/v1/users/[handle]/email` と設定画面のDTOだけ。
  */
  'email',
] as const

export type PublicUserDto = {
  id: string
  username: string
  displayName: string
  avatar: string | null
  server: string
  platform: string
}

type UserLike = {
  id: string
  username: string
  displayName: string
  avatar: string | null
  server: string
  platform: string
}

/**
 * 公開してよいユーザー情報。
 * 引数に何が渡ってきても、返るのはこの6フィールドだけ。
 */
export function serializeUser(user: UserLike): PublicUserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    server: user.server,
    platform: user.platform,
  }
}

export type UserSocialAccountDto = {
  platform: string
  username: string
  server: string
}

/**
 * ユーザーページに出す、本人が書いたプロフィール。
 *
 * **`user` を入れ子にしてある。** `serializeUser` が返す6列がどれかを
 * 見た目で分けておかないと、次にここを触る人が `email` を足す先として
 * 平らな並びを選ぶ。
 */
export type PublicUserProfileDto = {
  user: PublicUserDto
  /** 初回ログインの日時。「いつからいるか」 */
  joinedAt: string
  bio: string | null
  socialAccounts: UserSocialAccountDto[]
  homepageUrls: string[]
}

type UserProfileLike = UserLike & {
  bio: string | null
  socialAccounts: string | null
  homepageUrls: string | null
  createdAt: Date
}

/**
 * JSON を入れた Text 列を読む。
 *
 * **壊れていても落とさない。** 手で直された行や、上限を変える前の行が
 * 混ざりうる。ページが 500 になる価値はないので、読めた分だけ返す。
 * （`events.hashtags` / `users.ipAddresses` と同じ持ち方）
 */
function parseJsonArray(raw: string | null): unknown[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseSocialAccounts(raw: string | null): UserSocialAccountDto[] {
  return parseJsonArray(raw).flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []
    const { platform, username, server } = row as Record<string, unknown>
    if (typeof platform !== 'string' || typeof username !== 'string') return []
    return [{ platform, username, server: typeof server === 'string' ? server : '' }]
  })
}

function parseUrlArray(raw: string | null): string[] {
  return parseJsonArray(raw).filter((v): v is string => typeof v === 'string')
}

export function serializeUserProfile(user: UserProfileLike): PublicUserProfileDto {
  return {
    user: serializeUser(user),
    joinedAt: user.createdAt.toISOString(),
    bio: user.bio,
    socialAccounts: parseSocialAccounts(user.socialAccounts),
    homepageUrls: parseUrlArray(user.homepageUrls),
  }
}
