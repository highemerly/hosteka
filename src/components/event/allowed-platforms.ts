import {
  distinctPlatforms,
  FEDIVERSE_PLATFORM_ORDER,
  groupByPlatform,
  type AllowedServer,
  type FediversePlatform,
} from '@/lib/allowed-servers'

/**
 * 参加できるプラットフォームの解決。
 *
 * DB では Fediverse / Discord / X が3つの boolean、サーバー限定が
 * Fediverse だけに掛かる別カラムになっている。**この非対称が表示を誤らせる。**
 * 「2サーバー限定」とだけ出すと、X から参加できる人にはサーバー限定が
 * 効いていないのに、効いているように読めてしまう。
 * その判定をここに集約する。
 */

export type PlatformKey = FediversePlatform | 'discord' | 'twitter'

export const PLATFORM_LABEL: Record<PlatformKey, string> = {
  mastodon: 'Mastodon',
  misskey: 'Misskey',
  pleroma: 'Pleroma',
  discord: 'Discord',
  twitter: 'X',
}

export type PlatformRestrictionInput = {
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  allowedServers: AllowedServer[]
}

export type PlatformRestriction = {
  /**
   * Fediverse 側で出すロゴ。
   *
   * サーバー限定があり、全サーバーの種別が分かっているなら、実際に
   * 現れる実装だけに絞る（handon.club と mastodon.social なら Mastodon だけ）。
   * 分からないサーバーが混じるなら3つとも出す。
   */
  fediversePlatforms: FediversePlatform[]
  /** Fediverse 以外で出すロゴ */
  otherPlatforms: ('discord' | 'twitter')[]
  /** ロゴを並べる順の全体 */
  platforms: PlatformKey[]
  /** どのプラットフォームからでも、どのサーバーからでも参加できる */
  unrestricted: boolean
  /** Fediverse のサーバー限定が効いている */
  serverLimited: boolean
  serverCount: number
  /** バッジを出すか */
  showChip: boolean
  /** ポップオーバーの入れ子表示用 */
  serverGroups: { platform: FediversePlatform | null; servers: string[] }[]
}

export function resolvePlatformRestriction(
  event: PlatformRestrictionInput
): PlatformRestriction {
  const servers = event.allowedServers
  // サーバー限定は Fediverse にしか掛からない
  const serverLimited = event.isAllowedForFediverse && servers.length > 0

  const narrowed = serverLimited ? distinctPlatforms(servers) : null
  const fediversePlatforms = event.isAllowedForFediverse
    ? (narrowed ?? [...FEDIVERSE_PLATFORM_ORDER])
    : []

  const otherPlatforms: ('discord' | 'twitter')[] = []
  if (event.isAllowedForDiscord) otherPlatforms.push('discord')
  if (event.isAllowedForTwitter) otherPlatforms.push('twitter')

  const unrestricted =
    event.isAllowedForFediverse &&
    event.isAllowedForDiscord &&
    event.isAllowedForTwitter &&
    !serverLimited

  return {
    fediversePlatforms,
    otherPlatforms,
    platforms: [...fediversePlatforms, ...otherPlatforms],
    unrestricted,
    serverLimited,
    serverCount: servers.length,
    showChip: !unrestricted,
    serverGroups: serverLimited ? groupByPlatform(servers) : [],
  }
}
