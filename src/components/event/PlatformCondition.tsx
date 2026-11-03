'use client'

import * as React from 'react'

import { ConditionLink } from '@/components/event/ConditionLink'
import {
  DiscordIcon,
  MastodonIcon,
  MisskeyIcon,
  PleromaIcon,
  XIcon,
} from '@/components/icons/social'

import {
  PLATFORM_LABEL,
  resolvePlatformRestriction,
  type PlatformKey,
  type PlatformRestriction,
  type PlatformRestrictionInput,
} from './allowed-platforms'

const PLATFORM_ICON: Record<PlatformKey, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  mastodon: MastodonIcon,
  misskey: MisskeyIcon,
  pleroma: PleromaIcon,
  discord: DiscordIcon,
  twitter: XIcon,
}

function Logos({ platforms, className }: { platforms: PlatformKey[]; className?: string }) {
  return (
    <>
      {platforms.map((key) => {
        const Icon = PLATFORM_ICON[key]
        return <Icon key={key} className={className ?? 'size-3.5'} />
      })}
    </>
  )
}

/**
 * 参加できるアカウントの内訳。
 *
 * サーバー限定があるときは、そのサーバーが属する実装の下にぶら下げる。
 *   Mastodon
 *     handon.club
 *     mastodon.social
 *   X
 * 平たい一覧にすると「このサーバーは何なのか」を利用者が知っている前提に
 * なる。ロゴだけ出して一覧を別に置くと、読む側が突き合わせることになる。
 *
 * **入れ子がサーバー限定の適用範囲をそのまま表している。** サーバー限定は
 * Fediverse にしか掛からないが、それは X が子を持たないことで分かるので、
 * 「サーバー限定は Fediverse のみに適用されます」と書き足す必要はない。
 */
export function AllowedAccountTree({ r }: { r: PlatformRestriction }) {
  const rows: { key: PlatformKey | 'fediverse'; label: string; servers: string[] }[] = []

  if (r.serverLimited) {
    for (const group of r.serverGroups) {
      rows.push({
        key: group.platform ?? 'fediverse',
        label: group.platform ? PLATFORM_LABEL[group.platform] : 'Fediverse',
        servers: group.servers,
      })
    }
  } else {
    for (const p of r.fediversePlatforms) {
      rows.push({ key: p, label: PLATFORM_LABEL[p], servers: [] })
    }
  }

  for (const p of r.otherPlatforms) {
    rows.push({ key: p, label: PLATFORM_LABEL[p], servers: [] })
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const Icon = row.key === 'fediverse' ? null : PLATFORM_ICON[row.key]
        return (
          <li key={row.key}>
            <div className="flex items-center gap-2 text-xs font-medium">
              {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
              {row.label}
            </div>
            {row.servers.length > 0 ? (
              <ul className="mt-1 ml-[7px] space-y-0.5 border-l border-border pl-3">
                {row.servers.map((srv) => (
                  <li key={srv} className="font-mono text-xs break-all text-muted-foreground">
                    {srv}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 参加できるアカウントの条件。
 *
 * **プラットフォームとサーバーで分けない。** 利用者から見れば
 * 「誰が参加できるか」という1つの条件で、2つ並べると読む側が
 * 突き合わせることになる。
 *
 *   [Mastodon] (2サーバー) [X] のみ
 *
 * サーバー数は Fediverse のロゴの直後に置く。**サーバー限定は Fediverse に
 * しか掛からない**ので、末尾に置くと X にも掛かるように読める。
 *
 * 文言ではなくロゴで示す。「Mastodon・Misskey・Pleroma のユーザーのみです」は
 * 1行を使い切るうえ、読んでも結局ロゴを思い浮かべることになる。
 */
export function PlatformCondition({ event }: { event: PlatformRestrictionInput }) {
  const r = resolvePlatformRestriction(event)

  // 制限なしなら何も出さない。「誰でも参加できます」は情報ではない
  if (!r.showChip) return null

  return (
    <ConditionLink
      icon={
        <span className="flex items-center gap-1">
          <Logos platforms={r.fediversePlatforms} />
          {r.serverLimited ? <span className="opacity-100">（{r.serverCount}サーバー）</span> : null}
          <Logos platforms={r.otherPlatforms} />
        </span>
      }
      label="のみ"
      title="参加できるアカウント"
    >
      {/* 制限を掛けているのはサービスではなく主催者だと先に言う。
          これが無いと「対応していないのか」と読まれる */}
      <p className="mb-3 text-xs text-muted-foreground">
        主催者が参加登録できる
        {r.serverLimited && r.otherPlatforms.length === 0 ? 'サーバー' : 'プラットフォーム'}
        を制限しています。
      </p>

      <AllowedAccountTree r={r} />
    </ConditionLink>
  )
}
