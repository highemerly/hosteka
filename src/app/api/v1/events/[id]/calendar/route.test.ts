import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))
vi.mock('@/server/auth/session', () => ({
  getSession: vi.fn(),
  isAdminUser: vi.fn(),
}))

import { getSession } from '@/server/auth/session'
import { GET } from './route'

/**
 * カレンダー（.ics）に書く日時。
 *
 * 開催日時は日付列と時刻列の2列で保存されている。以前はここが日付列だけを
 * サーバーのローカル getter で読んでいて、**19:00 開始のイベントが
 * 09:00 JST 開始の予定として書き出されていた**（本番は UTC で動く）。
 * 画面の表示は正しいので、気づくのは予定を取り込んだ人だけだった。
 */
const EVENT = {
  id: 'evt_1',
  title: '秋のオフ会',
  description: null,
  location: null,
  fee: null,
  maxParticipants: null,
  isPublic: true,
  isDisabled: false,
  // 新形式: 日付文字列をそのまま Date にしたもの（UTC 0時）
  startDate: new Date('2026-09-12T00:00:00Z'),
  startTime: '19:00' as string | null,
  hasStartTime: true,
  endDate: null as Date | null,
  endTime: null as string | null,
  hasEndTime: false,
  creator: { displayName: 'テスト太郎', username: 'taro', server: 'example.social' },
}

const ctx = { params: Promise.resolve({ id: 'evt_1' }) }

async function ics(event: Partial<typeof EVENT> = {}): Promise<string> {
  prismaMock.event.findUnique.mockResolvedValue({ ...EVENT, ...event })
  const res = await GET(makeRequest('/api/v1/events/evt_1/calendar'), ctx)
  expect(res.status).toBe(200)
  return res.text()
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(getSession).mockReset()
  vi.mocked(getSession).mockResolvedValue(PERSONAS.anonymous)
  vi.stubEnv('NEXTAUTH_URL', 'https://hosteka.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/v1/events/[id]/calendar', () => {
  /*
    **主催者の表示名から、ICS に行を書き足させない。** 表示名は相手の
    サーバーが決める値で、`ics` は `CN=` の値の改行を逃がさない。
  */
  it('主催者の表示名に改行があっても、別の行にならない', async () => {
    const text = await ics({
      creator: {
        displayName: 'Alice\r\nURL:https://evil.example\r\nBEGIN:VALARM',
        username: 'alice',
        server: 'example.social',
      },
    })
    const lines = text.split(/\r?\n/)
    expect(lines.some((line) => line.startsWith('URL:https://evil.example'))).toBe(false)
    expect(lines.some((line) => line.startsWith('BEGIN:VALARM'))).toBe(false)
  })

  it('開始時刻は時刻列から読む。19:00 JST は 10:00 UTC', async () => {
    expect(await ics()).toContain('DTSTART:20260912T100000Z')
  })

  it('旧形式の日付（JST 0時で保存された行）でも同じ日時になる', async () => {
    const text = await ics({ startDate: new Date('2026-09-11T15:00:00Z') })
    expect(text).toContain('DTSTART:20260912T100000Z')
  })

  it('終了日時があれば、終了も時刻列から読む', async () => {
    const text = await ics({
      endDate: new Date('2026-09-12T00:00:00Z'),
      endTime: '21:30',
      hasEndTime: true,
    })
    expect(text).toContain('DTEND:20260912T123000Z')
  })

  it('終了が無ければ開始と同じにする。長さをこちらで決めない', async () => {
    expect(await ics()).toContain('DTEND:20260912T100000Z')
  })

  it('終了が開始より前に組み上がるなら開始に揃える（終了日だけで時刻が無い）', async () => {
    const text = await ics({ endDate: new Date('2026-09-12T00:00:00Z') })
    expect(text).toContain('DTEND:20260912T100000Z')
  })

  describe('開始時刻が無いイベントは終日の予定にする', () => {
    it('1日だけなら、終了は翌日（終了日を含まない決まり）', async () => {
      const text = await ics({ startTime: null, hasStartTime: false })
      expect(text).toContain('DTSTART;VALUE=DATE:20260912')
      expect(text).toContain('DTEND;VALUE=DATE:20260913')
    })

    it('複数日なら、終了は最終日の翌日。月末も繰り上がる', async () => {
      const text = await ics({
        startDate: new Date('2026-09-29T00:00:00Z'),
        startTime: null,
        hasStartTime: false,
        endDate: new Date('2026-09-30T00:00:00Z'),
      })
      expect(text).toContain('DTSTART;VALUE=DATE:20260929')
      expect(text).toContain('DTEND;VALUE=DATE:20261001')
    })
  })
})
