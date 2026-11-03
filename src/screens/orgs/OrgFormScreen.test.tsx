import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError } from '@/lib/api/client'

import OrgFormScreen from './OrgFormScreen'

/**
 * グループのフォーム。
 *
 * **管理者の追加は、足す前に実在を確かめる。** サーバーは知らない
 * ユーザーを `continue` で読み飛ばすので（`PUT /api/v1/orgs/[orgId]`）、
 * 確かめずに送ると**保存は成功したのに管理者は増えない。**
 * 押した側は成功したと思ったままになる。
 */
const get = vi.fn()
const post = vi.fn()

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/api/queries/orgs', () => ({
  useOrg: () => ({ data: undefined, isPending: false, error: undefined }),
}))
vi.mock('@/hooks/useViewer', () => ({
  useViewer: () => ({
    viewer: {
      id: 'u1',
      name: '主催者',
      username: 'owner',
      server: 'handon.club',
      avatar: null,
      platform: 'mastodon',
      isAdmin: false,
      v: 1,
    },
    status: 'authed',
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/common/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))

beforeEach(() => {
  get.mockReset()
  post.mockReset()
})

function fillAdmin(username: string) {
  fireEvent.change(screen.getByLabelText('ユーザー名'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('サーバー'), { target: { value: 'handon.club' } })
  fireEvent.click(screen.getByRole('button', { name: /追加/ }))
}

describe('サーバー欄の説明', () => {
  /**
   * **X と Discord は入れる値が名前と違う。** アカウントに「サーバー」が
   * 無いので、画面からは何を入れるのか分からない。実際に保存されている
   * 値（`x.com` / `discord.com`）をそのまま案内する。
   */
  it('X と Discord に何を入れるかを出す', async () => {
    render(<OrgFormScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'サーバーに何を入れるかの説明' }))

    expect(await screen.findByText('x.com')).toBeTruthy()
    expect(screen.getByText('discord.com')).toBeTruthy()
  })
})

describe('管理者の追加', () => {
  it('実在する人は行として並ぶ', async () => {
    get.mockResolvedValue({
      id: 'u_new',
      username: 'newbie',
      displayName: '新入り',
      avatar: null,
      server: 'handon.club',
    })
    render(<OrgFormScreen />)
    fillAdmin('newbie')

    expect(await screen.findByText('新入り')).toBeTruthy()
    expect(screen.getByText('@newbie@handon.club')).toBeTruthy()
  })

  /**
   * **これが本題。** 確かめずに足すと、保存は通るのに増えない。
   */
  it('ログインしたことがない人は足せず、理由を出す', async () => {
    get.mockRejectedValue(
      new ApiClientError({
        code: 'NOT_FOUND',
        message:
          'ユーザー @nobody@handon.club が見つかりません。このサービスに一度もログインしていないユーザーは追加できません。',
        status: 404,
      })
    )
    render(<OrgFormScreen />)
    fillAdmin('nobody')

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('@nobody@handon.club')).toBeNull()
  })

  /**
   * **作成時は保存された管理者が1人もいない。** サーバーが作成者を admin に
   * するのは保存のあとなので、空のリストは「自分を足さないと管理者が0人に
   * なる」と読める。確定している自分の行を先に見せる。
   */
  it('作成時は自分が作成者として並ぶ', () => {
    render(<OrgFormScreen />)

    expect(screen.getByText('主催者')).toBeTruthy()
    expect(screen.getByText('@owner@handon.club')).toBeTruthy()
    expect(screen.getByText('作成者')).toBeTruthy()
  })

  /** サーバーは作成者を `continue` で読み飛ばす。足せたように見せない */
  it('自分は足せず、すでに管理者だと言う', async () => {
    get.mockResolvedValue({
      id: 'u1',
      username: 'owner',
      displayName: '主催者',
      avatar: null,
      server: 'handon.club',
    })
    render(<OrgFormScreen />)
    fillAdmin('owner')

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('追加しなくても管理者です')
    )
    // 行は増えない（作成者の行が1つだけ）
    expect(screen.getAllByText('@owner@handon.club')).toHaveLength(1)
  })

  it('同じ人は2回足せない', async () => {
    get.mockResolvedValue({
      id: 'u_new',
      username: 'newbie',
      displayName: '新入り',
      avatar: null,
      server: 'handon.club',
    })
    render(<OrgFormScreen />)
    fillAdmin('newbie')
    await screen.findByText('新入り')

    fillAdmin('newbie')
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('もう管理者に入っています')
    )
  })
})
