import type * as React from 'react'

import { getAvatarUrl } from '@/lib/mediaProxy'

/**
 * イベント情報の1行。左にアイコン、右に操作を置く。
 * 罫線で区切った箇条書きとして並べる。
 */
export function EventInfoRow({
  icon,
  children,
  action,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  /*
    右の操作ボタン（h-7）と本文（line-height 20px）の中心を揃える。
    items-start のままだと上辺が揃うので、本文だけが 4px 上にずれて
    「ボタンの中で文字がセンタリングされていない」ように見える。
    本文に py-1 を入れて1行目の中心を 14px に落とし、アイコンも
    同じ高さの箱に入れて中央寄せする。2行以上に伸びたときは
    1行目がボタンに揃い、続きが下に流れる。
  */
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-7 shrink-0 items-center text-muted-foreground">{icon}</span>
        <div className="min-w-0 py-1 text-sm text-foreground">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/** 名前の頭文字を出す簡易アバター。画像がある場合は差し替える */
export function UserAvatar({
  name,
  src,
  size = 'md',
}: {
  name: string
  src?: string | null
  size?: 'md' | 'sm' | 'xs'
}) {
  const cls =
    size === 'md'
      ? 'size-10 text-sm'
      : size === 'sm'
        ? 'size-8 text-xs'
        : 'size-7 text-[11px] ring-1 ring-background'

  if (src) {
    /*
      **必ず media proxy を通す。** 元URLを直に貼ると、
      閲覧者の IP と Referer が相手のサーバーへ渡り、サイズも形式も
      向こう任せになる（一覧では数十枚が並ぶ）。
      proxy 側で webp 化・リサイズ・失敗時のフォールバックまで済む。

      next/image は使わない。proxy が既に最適化しているので二重になる。
    */
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={getAvatarUrl(src)}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={`${cls} shrink-0 rounded-full bg-muted object-cover`}
      />
    )
  }

  return (
    <span
      className={`${cls} grid shrink-0 place-items-center rounded-full bg-muted font-medium text-muted-foreground`}
      aria-hidden
    >
      {name.slice(0, 1)}
    </span>
  )
}
