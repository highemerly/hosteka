import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmDialogProvider } from '@/components/common/ConfirmDialog'
import { ApiClientError } from '@/lib/api/client'

import AdminReportDetailScreen from './AdminReportDetailScreen'

/**
 * 通報の詳細。
 *
 * **旧画面は対象の節が出ていなかった。** DTO が `target` に畳まれたのに
 * `report.event` / `report.preEvent` を読んでいたため、無効化も BAN も
 * できなかった。画面が名乗る型と実際の応答がずれても typecheck は通るので、
 * DTO の形で描けることをここで固定する。
 */
const state: { data?: unknown; isPending: boolean; error?: unknown } = { isPending: true }

vi.mock('@/lib/api/queries/admin', () => ({
  useAdminReport: () => state,
  useUpdateReport: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDisabled: () => ({ mutate: vi.fn(), isPending: false }),
  useBanUser: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/admin/reports/r1',
}))

const USER = {
  id: 'user_9',
  username: 'host',
  displayName: '主催さん',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    reason: 'スパムです',
    status: 'pending',
    adminNote: null,
    reportedAt: '2026-09-01T03:00:00.000Z',
    resolvedAt: null,
    reporter: { ...USER, id: 'user_1', displayName: '通報した人' },
    target: {
      kind: 'pre-event',
      id: 'pe_1',
      title: '怪しい日程調整',
      createdAt: '2026-08-30T01:00:00.000Z',
      isPublic: false,
      isDisabled: true,
      creator: USER,
      organization: null,
      description: '[ここを押す](https://spam.example)',
      creatorHosted: { events: 0, preEvents: 2 },
    },
    ...overrides,
  }
}

function renderScreen() {
  render(
    <ConfirmDialogProvider>
      <AdminReportDetailScreen id="r1" />
    </ConfirmDialogProvider>
  )
}

beforeEach(() => {
  state.data = undefined
  state.isPending = false
  state.error = undefined
})

describe('通報の詳細', () => {
  it('target から対象を描き、対象のページへのリンクを張る', () => {
    state.data = report()
    renderScreen()

    expect(screen.getByRole('heading', { name: '対象の日程調整' })).toBeTruthy()
    const link = screen.getByRole('link', { name: '怪しい日程調整' })
    expect(link.getAttribute('href')).toBe('/pre-events/pe_1')
  })

  it('無効化済みなら「有効化する」を出す', () => {
    state.data = report()
    renderScreen()
    expect(screen.getByRole('button', { name: '有効化する' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '無効化する' })).toBeNull()
  })

  it('説明は Markdown として描かず、書かれたままの文字で見せる（リンク先を隠さない）', () => {
    state.data = report()
    renderScreen()
    expect(screen.getByText('[ここを押す](https://spam.example)')).toBeTruthy()
  })

  it('未処理なら「解決済みにする」、解決済みなら「未処理に戻す」', () => {
    state.data = report()
    const { unmount } = render(
      <ConfirmDialogProvider>
        <AdminReportDetailScreen id="r1" />
      </ConfirmDialogProvider>
    )
    expect(screen.getByRole('button', { name: '解決済みにする' })).toBeTruthy()
    unmount()

    state.data = report({ status: 'resolved', resolvedAt: '2026-09-02T03:00:00.000Z' })
    renderScreen()
    expect(screen.getByRole('button', { name: '未処理に戻す' })).toBeTruthy()
  })

  it('メモを書き換えるまで「メモを保存」は出さない', () => {
    state.data = report({ adminNote: '確認中' })
    renderScreen()
    expect(screen.queryByRole('button', { name: 'メモを保存' })).toBeNull()
  })

  it('一般ユーザーには中身ではなく「管理者だけ」と案内する', () => {
    state.error = new ApiClientError({ code: 'FORBIDDEN', message: 'x', status: 403 })
    renderScreen()
    expect(screen.getByText('管理画面は管理者だけが開けます。')).toBeTruthy()
  })
})
