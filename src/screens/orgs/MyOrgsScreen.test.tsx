import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '@/lib/api/client'

import MyOrgsScreen from './MyOrgsScreen'

/**
 * あなたのグループ。
 *
 * **旧画面は開くと例外で落ちていた。** API 標準化で応答が `serializeOrg` を
 * 通るようになり `_count.events` が `eventCount` へ変わったのに、画面が
 * `org._count.events` を読んだままだった。型は `Organization[]` を自称して
 * いたので typecheck も通り、**開くまで誰も気づかない。**
 */
const state: { data?: unknown; isPending: boolean; error?: unknown } = {
  data: undefined,
  isPending: true,
}

vi.mock('@/lib/api/queries/orgs', () => ({
  useMyOrgs: () => state,
}))

vi.mock('@/hooks/useViewer', () => ({
  useViewer: () => ({ viewer: { id: 'user_1' }, status: 'authed' }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

function org(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org_1',
    slug: 'my-group',
    name: 'テストグループ',
    description: null,
    relatedUrl: null,
    creatorId: 'user_1',
    createdAt: '2026-01-15T00:00:00.000Z',
    admins: [{ id: 'oa_1', role: 'admin', user: {} }],
    eventCount: 3,
    ...overrides,
  }
}

beforeEach(() => {
  state.data = undefined
  state.isPending = false
  state.error = undefined
})

describe('あなたのグループ', () => {
  it('シリアライザが返す eventCount を読む', () => {
    state.data = [org()]
    render(<MyOrgsScreen />)

    expect(screen.getByText(/イベント 3件/)).toBeTruthy()
    expect(screen.getByText(/管理者 1人/)).toBeTruthy()
  })

  /** 件数が無いグループもある（一覧の select が `_count` を取らない経路） */
  it('eventCount が無くても落ちない', () => {
    state.data = [org({ eventCount: undefined })]
    render(<MyOrgsScreen />)

    expect(screen.getByText(/イベント 0件/)).toBeTruthy()
  })

  it('自分が作ったグループには作成者の印を付ける', () => {
    state.data = [org(), org({ id: 'org_2', slug: 'other', name: 'よそ', creatorId: 'user_9' })]
    render(<MyOrgsScreen />)

    expect(screen.getAllByText('作成者')).toHaveLength(1)
  })

  it('ログインしていなければログインへ案内する', () => {
    // **本物の ApiClientError を投げる。** 画面は instanceof で見るので、
    // 形だけ似せた Error では素通りして「読み込めませんでした」になる
    state.error = new ApiClientError({
      code: 'UNAUTHENTICATED',
      message: 'ログインが必要です',
      status: 401,
    })
    render(<MyOrgsScreen />)

    expect(screen.getByText(/ログインが必要です/)).toBeTruthy()
  })

  it('1件も無ければ、作る導線を出す', () => {
    state.data = []
    render(<MyOrgsScreen />)

    expect(screen.getByText('所属しているグループがありません。')).toBeTruthy()
  })
})
