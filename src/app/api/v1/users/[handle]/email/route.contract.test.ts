import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/server/auth/session')>(
    '@/server/auth/session'
  )
  return { ...actual, getSession: vi.fn(), isAdminUser: vi.fn() }
})

import { getSession } from '@/server/auth/session'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)
const ctx = (handle: string) => ({ params: Promise.resolve({ handle }) })
const request = () => makeRequest('/api/v1/users/taro@example.social/email')

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.user.findUnique.mockResolvedValue({ email: 'taro@example.test', ban: null })
})

describe('GET /api/v1/users/[handle]/email', () => {
  it('ログインしていればアドレスを返す', async () => {
    await expectContract(await GET(request(), ctx('taro@example.social')))
  })

  /*
    **これが公開されていないことが、この機能の全部。** 公開プロフィールに
    載せると、未ログインのクローラーが一覧を舐めるだけで収集できる。
  */
  it('未ログインでは401。DBも引かない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(request(), ctx('taro@example.social')))
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('未登録なら null を返す', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ email: null, ban: null })
    await expectContract(await GET(request(), ctx('taro@example.social')))
  })

  it('居ない人は404', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expectContract(await GET(request(), ctx('nobody@example.social')))
  })

  it('停止中の人は404。公開ページと扱いをそろえる', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      email: 'taro@example.test',
      ban: { id: 'ban_1' },
    })
    const response = await GET(request(), ctx('taro@example.social'))
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('taro@example.test')
  })

  it('ハンドルの形になっていなければ404', async () => {
    await expectContract(await GET(request(), ctx('taro')))
  })
})
