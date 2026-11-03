import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /*
          ボタンの色は primary とそれ以外の2系統のみ（docs/DESIGN_GUIDELINES.md）。
          用途ごとに色を増やさない。
          押せる要素を影だけで示さないため、いずれの variant も
          背景色か境界のどちらかを必ず持つ。
        */

        /** その画面で最も進めたい操作。1画面に原則1つ */
        primary:
          'raised-on-color bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] active:translate-y-px',

        /** それ以外すべて。中立色 */
        default:
          'raised border border-border bg-card text-foreground hover:bg-accent active:translate-y-px',

        /** 削除・BAN など取り消せない操作。確認ダイアログと必ず併用する */
        destructive:
          'raised-on-color bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 active:translate-y-px focus-visible:ring-destructive/40',

        /**
         * 状態を兼ねるボタン。「もう済んでいる」ことを示す。
         *
         * **primary と同じ青のトーナル（淡い面）**で、色相は変えない。
         * primary が「押してほしい」を意味するのに対し、こちらは
         * 「押す必要はないが、変更もできる」を意味する。差は塗りの強さで
         * 付ける（塗りつぶし → 淡い面＋濃い文字）。
         *
         * 以前は緑（success）だった。緑は青の系統から外れるうえ、面が
         * ほぼ白でボタンに見えず、「押せるもの」として読まれなかった。
         * **新しい色相を増やさずに強弱で状態を出す。**
         */
        state:
          'raised-on-color border border-primary/70 bg-primary-surface text-primary-surface-foreground hover:bg-primary-surface-hover active:translate-y-px',

        /*
          以下は「ボタンに見せない」ための variant。新しい色は導入していない。
          ツールバーのアイコンや本文中のリンクに使う。立体表現は付けない。
        */
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      /*
        高さの段階。
        **既定を h-12（48px）にしてある。** 以前の既定は h-8（32px）で、
        指の的として小さすぎた。標準を大きい側に置き、小さくするのは
        「行の中に置く補助的な操作」だけに限る。
      */
      size: {
        /** 標準。押させたい操作はこれ */
        default: "h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        /**
         * 情報行の右端など、本文の流れを崩したくない場所。
         * **イベント・日程調整の詳細画面の操作列もこれ**で、情報行の
         * 「カレンダーに追加」と高さを合わせている（本文の頭に単独で置く
         * 参加ボタンだけは既定の h-12 のまま）。
         */
        sm: "h-9 gap-1.5 rounded-lg px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-4",
        /** ツールバーなど、さらに詰めたい場所 */
        xs: "h-8 gap-1 rounded-lg px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        /** 正方形。高さは同名のサイズに揃える */
        icon: "size-12 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-9",
        "icon-xs": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
