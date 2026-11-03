/**
 * Prisma の select プリセット
 *
 * User モデルには accessToken（暗号化済みOAuthトークン）・ipAddresses・lastLoginAt・
 * lastTermsAcceptedAt・isAdmin といった機密フィールドが含まれる。
 * `include: { creator: true }` や `select: { user: true }` はこれらを全て含んでしまい、
 * Client Component へ渡すと RSC ペイロード経由でHTMLに埋め込まれて外部に露出する。
 *
 * ユーザー情報を画面へ渡す際は必ずこのプリセットを使うこと。
 * `tests/lint-rules/no-unrestricted-user-select.test.ts` が違反を検出する。
 */

/** 公開して問題のない User フィールドのみ */
export const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  server: true,
  platform: true,
} as const

/**
 * ユーザーページ（`/users/<handle>`）が読む列。
 *
 * **`USER_PUBLIC_SELECT` の上に、本人が自分で書いたものだけを足す。**
 * OAuth から同期した値や運用の記録（`lastLoginAt` / `ipAddresses` /
 * `isAdmin`）は足さない。
 *
 * `createdAt` は「いつからいるか」を出すため（グループのページの
 * 「◯年◯月◯日に設立」と同じ役）。**意図して公開側へ回している列**。
 *
 * **`email` は入れない。** あれはログイン中の閲覧者が押して初めて見えるもので、
 * 公開プロフィールの応答に現れてはならない
 * （`GET /api/v1/users/[handle]/email` だけが返す）。
 */
export const USER_PROFILE_PUBLIC_SELECT = {
  ...USER_PUBLIC_SELECT,
  bio: true,
  socialAccounts: true,
  homepageUrls: true,
  createdAt: true,
} as const
