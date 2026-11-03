import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const apiGet = vi.fn()
const apiPost = vi.fn()
vi.mock('@/lib/api/client', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
  },
  ApiClientError: class extends Error {},
}))

import { NotificationBell } from './NotificationBell'

/**
 * ヘッダーのベル。**全ページに出る**ので、未ログインの閲覧者に対して
 * 何も描かず、何も叩かないことが効いてくる。
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

const NOTIFICATION = {
  id: 'ntf_1',
  kind: 'participation_requested' as const,
  category: 'organizer' as const,
  targetType: 'event' as const,
  targetId: 'evt_1',
  href: '/events/evt_1',
  actor: {
    id: 'u2',
    username: 'hanako',
    displayName: 'テスト花子',
    avatar: null,
    server: 'handon.club',
    platform: 'mastodon',
  },
  payload: { title: '花見の会' },
  occurredAt: '2026-09-18T06:00:00.000Z',
  repeatCount: 1,
  unread: true,
}

function renderBell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationBell />
    </QueryClientProvider>
  )
}

/* Popover は click で開く（DropdownMenu の pointerdown とは違う） */
const openBell = () => fireEvent.click(screen.getByRole('button', { name: /通知/ }))

beforeEach(() => {
  apiGet.mockReset()
  apiPost.mockReset()
  apiGet.mockResolvedValue({ unread: 2, recent: [NOTIFICATION] })
  apiPost.mockResolvedValue({ seenAt: '2026-09-18T06:00:00.000Z' })
})

afterEach(() => setViewerCookie(null))

describe('通知のベル', () => {
  /** 匿名の閲覧者が開くたびに401が1本飛ぶことになる */
  it('未ログインでは何も描かず、叩きもしない', () => {
    setViewerCookie(null)
    const { container } = renderBell()

    expect(container.textContent).toBe('')
    expect(apiGet).not.toHaveBeenCalled()
  })

  it('ログイン中は未読件数を読み上げに載せる', async () => {
    setViewerCookie(VIEWER)
    renderBell()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知（未読2件）' })).toBeTruthy()
    })
  })

  /** 0件のときにバッジを出すと、押す理由が無いのに押させることになる */
  it('未読が無ければ件数を言わない', async () => {
    setViewerCookie(VIEWER)
    apiGet.mockResolvedValue({ unread: 0, recent: [] })
    renderBell()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '通知' })).toBeTruthy()
    })
  })

  it('開くと直近の通知と「すべて見る」を出す', async () => {
    setViewerCookie(VIEWER)
    renderBell()
    await waitFor(() => expect(apiGet).toHaveBeenCalled())

    openBell()

    await waitFor(() => {
      expect(screen.getByText('テスト花子さんが『花見の会』に参加リクエストを出しました')).toBeTruthy()
    })
    expect(screen.getByRole('link', { name: 'すべて見る' })).toBeTruthy()
  })

  /**
   * 既読位置を動かすのは、ベルを開いたときと一覧画面を開いたときの2つだけ。
   * 画面遷移のたびに動かすと、連続編集がまとまらなくなる
   */
  it('開くまでは既読にしない', async () => {
    setViewerCookie(VIEWER)
    renderBell()
    await waitFor(() => expect(apiGet).toHaveBeenCalled())

    expect(apiPost).not.toHaveBeenCalled()

    openBell()

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/api/v1/notifications/seen')
    })
  })

  it('通知が1件も無ければ、そう言う', async () => {
    setViewerCookie(VIEWER)
    apiGet.mockResolvedValue({ unread: 0, recent: [] })
    renderBell()
    await waitFor(() => expect(apiGet).toHaveBeenCalled())

    openBell()

    await waitFor(() => expect(screen.getByText('通知はありません。')).toBeTruthy())
  })
})
