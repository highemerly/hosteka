'use client'

import * as React from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

import { AnnouncementTypeIcon } from '@/components/content/AnnouncementTypeIcon'
import {
  COOKIE_ANNOUNCEMENTS_READ,
  COOKIE_MAX_AGE_ANNOUNCEMENTS_READ,
  COOKIE_SECURE,
} from '@/lib/cookie-names'
import { readIdsAfterDismiss, unreadAnnouncements } from '@/lib/announcements'
import { useBannerAnnouncements } from '@/lib/api/queries/announcements'
import { formatJstDate } from '@/lib/jst'
import { readCookie } from '@/lib/viewer'
import type { AnnouncementType } from '@/schemas/announcement'

/**
 * 重要度ごとの塗りと文字色。
 *
 * **塗りで出す。** 文字色だけでは、ヘッダーの下の細い1行は地の一部として
 * 読み飛ばされる（全員宛ての掲示なので、見落とされては意味がない）。
 * 色は2系統だけ（DESIGN_GUIDELINES「配色」）で、"low" はそもそも
 * ここに来ない（`isBannerEligible`）。
 */
const TONES: Record<AnnouncementType, string> = {
  warning: 'bg-destructive/10 text-destructive',
  info: 'bg-primary/10 text-primary',
  low: 'bg-muted text-muted-foreground',
}

/**
 * ヘッダーの下に出る運営からのお知らせ。
 *
 * **出すかどうかはサーバーが決め、閉じたかどうかだけを画面が見る。**
 * 掲載期間の判定を端末の時計に任せると、ずれている人にだけ出たり消えたりする。
 *
 * **ヘッダーと違い、これは居座る。** 一度に出るのは掲載中のものだけで、
 * ×を押せばその全部が消える（1件ずつ閉じさせない — 押す回数が増えるだけで、
 * 読んだかどうかは変わらない）。
 *
 * 初回レンダリングでは何も描かない。取得はマウント後なので、サーバーが描いた
 * HTML は全閲覧者で同一のまま（CDN キャッシュ。CLAUDE.md のレンダリング方針）。
 */
export function AnnouncementBanner() {
  const { data } = useBannerAnnouncements()
  const [readIds, setReadIds] = React.useState<string | null>(null)

  /*
    Cookie はブラウザにしか無いので、マウント後に取り込む。
    `data` が届くのもマウント後なので、ここで1フレーム遅れても何も点滅しない。
  */
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReadIds(readCookie(COOKIE_ANNOUNCEMENTS_READ, document.cookie) ?? '')
  }, [])

  const active = data?.items ?? []
  const unread = readIds === null ? [] : unreadAnnouncements(active, readIds)

  const dismiss = () => {
    const value = readIdsAfterDismiss(active)
    document.cookie = [
      `${COOKIE_ANNOUNCEMENTS_READ}=${value}`,
      'Path=/',
      `Max-Age=${COOKIE_MAX_AGE_ANNOUNCEMENTS_READ}`,
      'SameSite=Lax',
      // `__Host-` は Secure が無いとブラウザが黙って捨てる（cookie-names.ts）
      ...(COOKIE_SECURE ? ['Secure'] : []),
    ].join('; ')
    setReadIds(value)
  }

  if (unread.length === 0) return null

  return (
    /*
      **帯は全幅を塗る。** 文字だけ色を変えても、ヘッダーの下の1行は
      本文の一部として読み飛ばされる。塗りの左右をヘッダーに合わせると、
      今度は「画面の中の箱」になって、全員宛ての掲示に見えない。
      塗りは端まで、文字の左端だけヘッダーのロゴと揃える。
    */
    <aside aria-label="運営からのお知らせ" className="border-b border-border">
      <ul>
        {unread.map((announcement, index) => (
          // 重要度ごとに塗り分ける。同時に出るのは普通1件なので、
          // 帯は1色で埋まる
          <li key={announcement.id} className={TONES[announcement.type]}>
            <div className="mx-auto flex w-full max-w-5xl items-center gap-1.5 px-4 py-1 text-xs">
              <AnnouncementTypeIcon type={announcement.type} className="size-3.5 text-current" />
              <span className="shrink-0 tabular-nums">
                {formatJstDate(announcement.publishedAt, { month: 'numeric', day: 'numeric' })}
              </span>
              {announcement.body ? (
                <Link
                  href={`/announcements/${announcement.id}`}
                  className="min-w-0 truncate underline underline-offset-2 hover:no-underline"
                >
                  {announcement.title}
                </Link>
              ) : (
                <span className="min-w-0 truncate">{announcement.title}</span>
              )}

              {/*
                ×は**塗りの外に出さない**。帯を画面の端まで塗ったまま右端に
                置くと、その列だけ先頭の重要度の色になり、2件目以降の行との
                境目に切り欠きが出る。ヘッダーの右端（`max-w-5xl`）に揃える。

                帯が細いので、的は行の高さいっぱいに広げる（`-my-1`）。
              */}
              {index === 0 ? (
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="お知らせを閉じる"
                  className="-my-1 ml-auto grid shrink-0 place-items-center self-stretch pl-2 transition-opacity hover:opacity-60"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
