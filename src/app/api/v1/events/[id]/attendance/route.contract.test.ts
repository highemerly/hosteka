import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ checkOrganizerPermission: vi.fn() }))

import { getSession } from '@/server/auth/session'
import { checkOrganizerPermission } from '@/lib/permissions'
import { GET, POST } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsOrganizer = vi.mocked(checkOrganizerPermission)

const params = Promise.resolve({ id: 'evt_1' })

const USER = {
  id: 'user_2',
  username: 'hanako',
  displayName: '花子',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
  // Prisma が返しうる機密。DTOに出てはならない
  accessToken: 'enc:v1:SECRET',
}

const EVENT = {
  id: 'evt_1',
  title: '交流会',
  fee: '3,000円',
  participants: [
    {
      userId: 'user_2',
      status: 'attending',
      comment: '遅れます',
      user: USER,
      groupSelections: [
        { group: { title: '食事' }, options: [{ option: { name: '肉' } }] },
        // 何も選ばれていないグループは出さない
        { group: { title: '2次会' }, options: [] },
      ],
    },
    { userId: 'user_3', status: 'maybe', comment: null, user: { ...USER, id: 'user_3' } },
  ],
  attendances: [
    { userId: 'user_2', attendStatus: 'present', feeStatus: 'paid', memo: 'お釣り渡した' },
  ],
}

async function dataOf(response: Response) {
  const payload = (await response.json()) as { data: Record<string, unknown> }
  return payload.data
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsOrganizer.mockReset()
  mockIsOrganizer.mockResolvedValue(true)
  mockGetSession.mockResolvedValue(PERSONAS.user)
})

describe('GET /api/v1/events/[id]/attendance', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('主催者・幹事でなければ403', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 'evt_1' })
    mockIsOrganizer.mockResolvedValue(false)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  it('存在しないイベントは404', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('参加者と記録を1行にまとめて返す', async () => {
    prismaMock.event.findUnique.mockResolvedValue(EVENT)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(200)
    await expectContract(response)
  })

  /*
    **記録が無い人は「未記録」。** 欠席と混ぜると、受付が終わったのか
    どうかが分からなくなる。
  */
  it('記録が無い参加者は未記録として返す', async () => {
    prismaMock.event.findUnique.mockResolvedValue(EVENT)

    const data = (await dataOf(await GET(makeRequest('/x'), { params }))) as {
      rows: { userId: string; attendStatus: string; feeStatus: string }[]
    }
    expect(data.rows.find((r) => r.userId === 'user_3')).toMatchObject({
      attendStatus: 'not_entered',
      feeStatus: 'not_entered',
    })
  })

  /*
    **当日その場で要る**（食事の受け渡しなど）。グループ名まで返す —
    「肉」だけでは何の選択か分からない。
  */
  it('選んだオプションをグループ名付きで返す', async () => {
    prismaMock.event.findUnique.mockResolvedValue(EVENT)

    const data = (await dataOf(await GET(makeRequest('/x'), { params }))) as {
      rows: { userId: string; options: { title: string; names: string[] }[] }[]
    }
    expect(data.rows.find((r) => r.userId === 'user_2')?.options).toEqual([
      { title: '食事', names: ['肉'] },
    ])
    expect(data.rows.find((r) => r.userId === 'user_3')?.options).toEqual([])
  })

  it('機密が混じらない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(EVENT)
    const response = await GET(makeRequest('/x'), { params })
    expect(JSON.stringify(await response.json())).not.toContain('SECRET')
  })
})

describe('POST /api/v1/events/[id]/attendance', () => {
  const postRequest = (body: unknown) => makeRequest('/x', { method: 'POST', body })

  it('その人が参加者でなければ404', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 'evt_1' })
    prismaMock.eventParticipant.findUnique.mockResolvedValue(null)

    const response = await POST(postRequest({ userId: 'user_9', attendStatus: 'present' }), {
      params,
    })
    expect(response.status).toBe(404)
    await expectContract(response)
  })

  it('知らない出欠の値は400', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 'evt_1' })
    await expectContract(
      await POST(postRequest({ userId: 'user_2', attendStatus: 'maybe' }), { params })
    )
  })

  /*
    画面は押した瞬間に見た目を変える。**返ってきた値で確定させる**ので、
    保存した結果をそのまま返す。
  */
  it('保存した結果を返す', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ id: 'evt_1' })
    prismaMock.eventParticipant.findUnique.mockResolvedValue({ id: 'p1', userId: 'user_2' })
    prismaMock.eventAttendance.upsert.mockResolvedValue({
      userId: 'user_2',
      attendStatus: 'present',
      feeStatus: 'not_entered',
      memo: null,
    })

    const response = await POST(postRequest({ userId: 'user_2', attendStatus: 'present' }), {
      params,
    })
    expect(response.status).toBe(200)
    await expectContract(response)
  })
})
