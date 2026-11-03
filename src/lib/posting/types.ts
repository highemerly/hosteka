// 投稿処理の共通型定義

/**
 * 失敗の種類。
 *
 * **「権限が足りない」だけは区別する。** 入り直せば直るものなので、
 * 画面は再ログインへ案内できなければならない。旧実装はエラーの文言を
 * 「権限」「403」で文字列マッチして判定していた（CLAUDE.md が禁じている、
 * message への依存）。相手のサーバーの言語や文言が変われば黙って壊れる。
 */
export type PostFailureKind = 'permission' | 'other'

export type PostResult = {
  success: boolean
  postId?: string
  error?: string
  kind?: PostFailureKind
}

export type ScheduledPostResult = {
  success: boolean
  scheduledStatusId?: string
  scheduledFor?: string
  error?: string
  kind?: PostFailureKind
}

/** 相手のサーバーが「その権限では駄目」と言っているか */
export function isPermissionStatus(status: number): boolean {
  return status === 401 || status === 403
}

export type UserCredentials = {
  server: string
  accessToken: string
  platform?: string
}

export type PostVisibility = 'public' | 'unlisted' | 'private' | 'direct'

// Misskey用のvisibility
export type MisskeyVisibility = 'public' | 'home' | 'followers' | 'specified'
