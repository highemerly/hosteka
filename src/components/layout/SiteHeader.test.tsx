import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfirmDialogProvider } from '@/components/common/ConfirmDialog'

// ベルがサマリを取りにいく。ここで見たいのはメニューの中身なので黙らせる
vi.mock('@/lib/api/client', () => ({
  api: { get: vi.fn().mockResolvedValue({ unread: 0, recent: [] }), post: vi.fn() },
  ApiClientError: class extends Error {},
}))

import { SiteHeader } from './SiteHeader'

/**
 * ヘッダーのメニューは**ログイン中かどうかで中身が変わる唯一の場所**。
 * ここが固定値のままだと、ログイン済みでも「ログイン」が出続ける
 * （実際に起きた）。押しても何も起きないので、壊れていることに
 * 気づくのは「押したらサインイン画面に来た」ときになる。
 */

/**
 * ビューア Cookie を実物と同じ形（base64url の JSON）で置く。
 *
 * **btoa は使わない。** 表示名は日本語のことがあり、非 ASCII で落ちる
 * （`ht-viewer` を書くサーバー側も UTF-8 で base64url にしている）。
 */
function setViewerCookie(viewer: Record<string, unknown> | null) {
  if (!viewer) {
    document.cookie = 'ht-viewer=; max-age=0; path=/'
    return
  }
  const raw = Buffer.from(JSON.stringify(viewer), 'utf8').toString('base64url')
  document.cookie = `ht-viewer=${raw}; path=/`
}

const VIEWER = {
  v: 1,
  id: 'u1',
  name: 'ほすてか太郎',
  avatar: null,
  isAdmin: false,
  username: 'taro',
  server: 'handon.club',
}

function openMenu() {
  /*
    ログアウトは確認を挟むので、**実際の layout と同じく provider の中で描く**。
    外で描くと `useConfirm` が投げて、メニューの中身どころではなくなる。
  */
  /*
    ベル（`NotificationBell`）が `useQuery` を使うので provider が要る。
    再試行は切る — 失敗したまま待たされてもテストは何も得られない。
  */
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <SiteHeader />
      </ConfirmDialogProvider>
    </QueryClientProvider>
  )
  // Radix は pointerdown で開く。jsdom に PointerEvent が無いのでキーで開く
  fireEvent.keyDown(screen.getByRole('button', { name: 'メニュー' }), { key: 'Enter' })
}

afterEach(() => setViewerCookie(null))

describe('SiteHeader のメニュー', () => {
  it('未ログインなら「ログイン」を出し、「ログアウト」は出さない', () => {
    setViewerCookie(null)
    openMenu()

    expect(screen.getByRole('menuitem', { name: 'ログイン' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'ログアウト' })).toBeNull()
  })

  it('ログイン済みなら「ログアウト」を出し、「ログイン」は出さない', () => {
    setViewerCookie(VIEWER)
    openMenu()

    expect(screen.getByRole('menuitem', { name: 'ログアウト' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'ログイン' })).toBeNull()
  })

  it('ログイン済みなら、誰として見ているかを出す', () => {
    setViewerCookie(VIEWER)
    openMenu()

    expect(screen.getByText('ほすてか太郎')).toBeTruthy()
    expect(screen.getByText('@taro@handon.club')).toBeTruthy()
  })

  /*
    **名前とアイコンの行そのものが入口。** 以前は「あなたのページ」という
    項目を下に並べていたが、すぐ上に自分のアイコンと名前が出ているのに、
    同じ場所を指す行がもう1つ増える形になっていた。
  */
  it('名前とアイコンの行が、あなたのページへの入口になっている', () => {
    setViewerCookie(VIEWER)
    openMenu()

    const link = screen.getByRole('menuitem', { name: /ほすてか太郎/ })
    expect(link.getAttribute('href')).toBe('/users/taro@handon.club')
  })

  it('「あなたのページ」「プロフィール設定」の項目は並べない', () => {
    setViewerCookie(VIEWER)
    openMenu()

    expect(screen.queryByRole('menuitem', { name: 'あなたのページ' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'プロフィール設定' })).toBeNull()
  })

  /** 未ログインには名前も行も無い。押せる的そのものを作らない */
  it('未ログインなら、あなたのページへの入口を出さない', () => {
    openMenu()
    expect(screen.queryByRole('menuitem', { name: /\/users\// })).toBeNull()
    expect(
      screen.queryAllByRole('menuitem').filter((el) => el.getAttribute('href')?.startsWith('/users/'))
    ).toEqual([])
  })

  /*
    作成の導線は**画面幅によらずメニューの中だけ**に置いている。
    以前は PC 幅でヘッダーに直接2つのボタンを出していたが、
    Tailwind のブレークポイントは jsdom では効かないので、
    「メニューの外にリンクが無い」ことでしか確かめられない。
  */
  it('作成の導線はメニューの中にだけ置く', () => {
    setViewerCookie(VIEWER)
    openMenu()

    expect(screen.getByRole('menuitem', { name: 'イベント作成' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: '日程調整作成' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'イベント作成' })).toBeNull()
    expect(screen.queryByRole('link', { name: '日程調整作成' })).toBeNull()
  })

  it('自分のイベント・日程調整への導線を出す', () => {
    setViewerCookie(VIEWER)
    openMenu()

    expect(
      screen.getByRole('menuitem', { name: 'あなたのイベント' }).getAttribute('href')
    ).toBe('/dashboard/my-events')
    expect(
      screen.getByRole('menuitem', { name: 'あなたの日程調整' }).getAttribute('href')
    ).toBe('/dashboard/my-pre-events')
  })

  it('管理者でなければ「管理画面」を出さない', () => {
    setViewerCookie(VIEWER)
    openMenu()

    expect(screen.queryByRole('menuitem', { name: '管理画面' })).toBeNull()
  })

  it('isAdmin なら「管理画面」を出す', () => {
    setViewerCookie({ ...VIEWER, isAdmin: true })
    openMenu()

    expect(screen.getByRole('menuitem', { name: '管理画面' })).toBeTruthy()
  })
})
