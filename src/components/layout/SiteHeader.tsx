'use client'

import Link from 'next/link'
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Shield,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { useConfirmedLogout } from '@/hooks/useConfirmedLogout'
import { useViewer } from '@/hooks/useViewer'
import { userProfilePath } from '@/lib/user-handle'

/**
 * 全ページ共通のヘッダー。
 *
 * Liquid Glass を適用する層のひとつ（背景の上に浮いているため）。
 * layout.tsx で一度だけ描画し、各画面から import しない。
 *
 * テーマ切替はここに置かない。日常的に触るものではないのでフッターへ回し、
 * この位置はハンバーガーメニューに使う。
 */
export function SiteHeader() {
  /*
    **ログイン中かどうかで中身を変える。** 以前はビューアを見ておらず、
    ログイン済みでも「ログイン」が出たままだった（押すとサインイン画面に
    行き、既にログインしていることに気づく）。

    `useViewer` は Cookie を同期的に読むが、**初回レンダリングでは必ず
    null を返す** — サーバーで描いた HTML を全閲覧者で同一に保つため
    （CDN キャッシュ。CLAUDE.md のレンダリング方針を参照）。
    そのため `status === 'loading'` の間はログイン／ログアウトの
    どちらも出さない。**どちらかを仮に出すと、必ず一瞬だけ嘘をつく。**
  */
  const { viewer, status } = useViewer()
  const requestLogout = useConfirmedLogout()

  return (
    // ガラスの境界は淡すぎて本文との切れ目が分からないため、
    // 下辺だけは通常の border 色を使い、影も足して層を分ける
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0 border-b-border shadow-sm">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-1 text-lg font-bold tracking-tight">
          <span className="text-foreground">Host</span>
          <span className="font-medium text-muted-foreground">eka</span>
        </Link>

        <nav className="flex items-center gap-2">
          {/* ログイン中だけ出る。未ログインでは何も描かず、叩きもしない */}
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/*
                **隣のベルと同じ寸法にする**（`NotificationBell` も
                size="icon-sm" + max-md:size-11）。横並びの要素で高さが違うと、
                意味の差ではなく作りの粗さとして読まれる。

                md 未満で44px に戻すのは指の的のため
                （docs/DESIGN_GUIDELINES.md：立体より操作しやすさ）。
              */}
              <Button
                variant="default"
                size="icon-sm"
                className="max-md:size-11"
                aria-label="メニュー"
              >
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/*
                誰として見ているかを最初に出す。**メニューを開いた人が
                自分のアカウントを確かめる場所はここしかない**
                （ヘッダーの引き金はハンバーガーのアイコンだけなので、
                アバターも名前もどこにも出ていない）。

                **この行そのものが、あなたのページへの入口。** 以前は
                「あなたのページ」という項目を下に並べていたが、すぐ上に
                自分のアイコンと名前が出ているのに、同じ場所を指す行が
                もう1つ増える形になっていた。名前を押して自分のページへ
                行くのは、どのSNSでも同じ動き。
              */}
              {viewer ? (
                <>
                  <DropdownMenuItem asChild className="px-2 py-2">
                    <Link href={userProfilePath(viewer)}>
                      <UserAvatar name={viewer.name} src={viewer.avatar} size="xs" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {viewer.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          @{viewer.username}@{viewer.server}
                        </span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}

              <DropdownMenuItem asChild>
                <Link href="/dashboard">
                  <LayoutDashboard className="size-4" />
                  マイページ
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/*
                **作成と一覧を対にして並べる。** 以前は作成だけが
                PC のヘッダーに常時出ていたが、押す頻度は一覧のほうが高い。
                入口を1か所に集めて、イベントと日程調整で同じ形にした。
              */}
              <DropdownMenuItem asChild>
                <Link href="/events/create">
                  <CalendarPlus className="size-4" />
                  イベント作成
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/my-events">
                  <CalendarDays className="size-4" />
                  あなたのイベント
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link href="/pre-events/create">
                  <CalendarRange className="size-4" />
                  日程調整作成
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/my-pre-events">
                  <CalendarCheck className="size-4" />
                  あなたの日程調整
                </Link>
              </DropdownMenuItem>

              {/*
                管理画面。**ビューア Cookie の `isAdmin` は出し分けの
                ヒントに過ぎない**（書き換えられる）。実際の権限は
                `/admin` 側が DB で確かめるので、ここで偽っても入れない。
              */}
              {viewer?.isAdmin ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="size-4" />
                      管理画面
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}

              {status === 'loading' ? null : (
                <>
                  <DropdownMenuSeparator />
                  {viewer ? (
                    <DropdownMenuItem variant="destructive" onSelect={() => void requestLogout()}>
                      <LogOut className="size-4" />
                      ログアウト
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem asChild>
                      <Link href="/auth/signin">
                        <LogIn className="size-4" />
                        ログイン
                      </Link>
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  )
}
