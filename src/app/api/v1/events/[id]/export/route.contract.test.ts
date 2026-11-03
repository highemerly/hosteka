import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ checkOrganizerPermission: vi.fn() }))

import { getSession } from '@/server/auth/session'
import { checkOrganizerPermission } from '@/lib/permissions'
import { GET } from './route'

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
}

function participant(status: string) {
  return {
    userId: USER.id,
    user: USER,
    status,
    cancellationReason: null,
    isOrganizer: false,
    comment: null,
    createdAt: new Date('2026-07-01T09:30:00+09:00'),
    groupSelections: [
      {
        group: { id: 'grp_1', title: '懇親会' },
        options: [{ option: { id: 'opt_1', name: '出る' } }],
      },
    ],
  }
}

function event(participants: unknown[]) {
  return {
    id: 'evt_1',
    title: '勉強会, 第3回',
    isDisabled: false,
    creatorId: 'user_1',
    startDate: new Date('2026-09-12T19:00:00+09:00'),
    hasStartTime: true,
    endDate: new Date('2026-09-12T22:00:00+09:00'),
    hasEndTime: true,
    location: '渋谷',
    fee: '1000円',
    participants,
    attendances: [],
    optionGroups: [{ id: 'grp_1', title: '懇親会', options: [] }],
  }
}

async function linesOf(response: Response) {
  return (await response.text()).replace(/^﻿/, '').split('\n')
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsOrganizer.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  mockIsOrganizer.mockResolvedValue(true)
  process.env.NEXTAUTH_URL = 'https://hosteka.test'
})

describe('GET /api/v1/events/[id]/export', () => {
  it('先頭に # 行でイベントの情報を載せ、空行のあとに見出しが来る', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([]))

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines.slice(0, 6)).toEqual([
      '# イベント名,"勉強会, 第3回"',
      '# イベントID,"evt_1"',
      '# 開催日時,"2026-09-12T19:00:00+09:00/2026-09-12T22:00:00+09:00"',
      '# 開催場所,"渋谷"',
      '# 参加費,"1000円"',
      '# イベントURL,"https://hosteka.test/events/evt_1"',
    ])
    expect(lines[6]).toMatch(/^# 出力日時,"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00"$/)
    expect(lines[7]).toBe('')
    expect(lines[8]).toContain('"ユーザー名","ユーザーID"')
    expect(lines[8]).toContain('"ユーザーコメント"')
    expect(lines[8]).toContain('"出欠登録記録者","出欠登録記録日時"')
  })

  /** 名前だけだと「会費」などの固定の列と見分けがつかない */
  it('オプションの列は「オプション：」を付ける', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([participant('attending')]))

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines[8].endsWith('"オプション：懇親会"')).toBe(true)
    expect(lines[9].endsWith('"出る"')).toBe(true)
  })

  it('参加リクエストを英語の値のまま出さない', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([participant('participation_request')]))

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines[9]).toContain('"参加リクエスト"')
    expect(lines[9]).not.toContain('participation_request')
  })

  /** 時刻を指定していない開催日は、日付だけにする（オフセットを付けられない） */
  it('時刻の無い開催日は日付だけ', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      ...event([]),
      startDate: new Date('2026-09-12T00:00:00+09:00'),
      hasStartTime: false,
      endDate: null,
      hasEndTime: false,
    })

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines[2]).toBe('# 開催日時,"2026-09-12"')
  })

  it('登録日時は +09:00 付きの ISO 8601', async () => {
    prismaMock.event.findUnique.mockResolvedValue(event([participant('attending')]))

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines[9]).toContain('"2026-07-01T09:30:00+09:00"')
  })

  it('コメントの引用符を逃がす', async () => {
    prismaMock.event.findUnique.mockResolvedValue(
      event([{ ...participant('attending'), comment: '"最高" だった' }])
    )

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines[9]).toContain('"""最高"" だった"')
  })
})
