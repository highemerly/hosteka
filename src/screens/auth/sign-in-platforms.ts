import type * as React from 'react'

import {
  DiscordIcon,
  MastodonIcon,
  MisskeyIcon,
  PleromaIcon,
  XIcon,
} from '@/components/icons/social'
import { canRequestWrite, type OAuthPlatform } from '@/lib/oauth-scopes'

/**
 * ログインに使えるプラットフォーム。
 *
 * **画面ではなくここに表を持つ。** 旧サインイン画面は5つ分の分岐を
 * JSX と `handleSubmit` に散らしていて、「ホスト名が要るか」「投稿の権限を
 * 一緒にもらえるか」「どのエンドポイントを叩くか」がそれぞれ別の
 * 三項演算子になっていた。1つ足すたびに3箇所直す形になっている。
 */
export type LoginPlatform = OAuthPlatform

export type PlatformSpec = {
  value: LoginPlatform
  label: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** OAuth アプリを登録して認証URLをもらうエンドポイント */
  endpoint: string
  /**
   * ホスト名の入力が要るか。Fediverse は行き先がサーバーごとに違う。
   * 前回入ったサーバーを覚えておくのもこれが true のものだけ（`lib/remembered-server.ts`）
   */
  needsServer: boolean
  placeholder?: string
  /**
   * 投稿の権限を一緒に受け取れるか。
   *
   * **手で書かない。** register ルートが要求する権限の表
   * （`lib/oauth-scopes.ts`）から取る。Pleroma は `read:accounts` 固定なので、
   * ここだけ true にすると選べるのに効かない選択肢になる。
   */
  canRequestWrite: boolean
}

export const PLATFORMS: readonly PlatformSpec[] = [
  {
    value: 'mastodon',
    label: 'Mastodon',
    icon: MastodonIcon,
    endpoint: '/api/v1/auth/mastodon/register',
    needsServer: true,
    placeholder: '例: mastodon.social',
    canRequestWrite: canRequestWrite('mastodon'),
  },
  {
    value: 'misskey',
    label: 'Misskey',
    icon: MisskeyIcon,
    endpoint: '/api/v1/auth/misskey/register',
    needsServer: true,
    placeholder: '例: misskey.io',
    canRequestWrite: canRequestWrite('misskey'),
  },
  {
    value: 'pleroma',
    label: 'Pleroma',
    icon: PleromaIcon,
    endpoint: '/api/v1/auth/pleroma/register',
    needsServer: true,
    placeholder: '例: pleroma.social',
    canRequestWrite: canRequestWrite('pleroma'),
  },
  {
    value: 'twitter',
    label: 'X (Twitter)',
    icon: XIcon,
    endpoint: '/api/v1/auth/twitter/register',
    needsServer: false,
    canRequestWrite: canRequestWrite('twitter'),
  },
  {
    value: 'discord',
    label: 'Discord',
    icon: DiscordIcon,
    endpoint: '/api/v1/auth/discord/register',
    needsServer: false,
    canRequestWrite: canRequestWrite('discord'),
  },
]

/** URL パラメータなど、外から来た文字列をプラットフォームとして解釈する */
export function findPlatform(value: string | null | undefined): PlatformSpec | undefined {
  if (!value) return undefined
  return PLATFORMS.find((p) => p.value === value)
}

/**
 * 入力されたホスト名を整える。
 *
 * URL ごと貼られることが多い（`https://misskey.io/` など）。
 * **サーバー側の検証は整形後の形しか受け付けない**ので、ここで揃えないと
 * 貼っただけで「有効なホスト名を入力してください」になる。
 */
export function normalizeServerHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim()
}

/**
 * ホスト名として送ってよい形か。
 *
 * **サーバー側の register ルートと同じ正規表現にしてある。** 画面とサーバーで
 * 書き分けると「送れるのに弾かれる」入力ができる。
 */
export function isValidServerHost(host: string): boolean {
  return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host)
}
