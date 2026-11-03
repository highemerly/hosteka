import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', () => ({ getSession: vi.fn(), isAdminUser: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ checkPreEventOrganizerPermission: vi.fn() }))

import { getSession } from '@/server/auth/session'
import { checkPreEventOrganizerPermission } from '@/lib/permissions'
import { GET } from './route'

const mockGetSession = vi.mocked(getSession)
const mockIsOrganizer = vi.mocked(checkPreEventOrganizerPermission)

const params = Promise.resolve({ id: 'pre_1' })

/** 候補日2つ。2つ目は「あとから足した」もので、回答が無い人がいる */
const DATE_OPTIONS = [
  { id: 'opt_1', startDate: new Date('2026-09-12T10:00:00Z'), endDate: null },
  { id: 'opt_2', startDate: new Date('2026-09-13T10:00:00Z'), endDate: null },
]

const USER = {
  id: 'user_2',
  username: 'hanako',
  displayName: '花子',
  avatar: null,
  server: 'example.social',
  platform: 'mastodon',
}

function preEvent(participants: unknown[]) {
  return {
    id: 'pre_1',
    title: '忘年会の日程',
    location: '渋谷',
    fee: null,
    dateOptions: DATE_OPTIONS,
    creator: { ...USER, id: 'user_1' },
    participants,
  }
}

/** 1候補日ぶんの回答 */
function answer(dateOptionId: string, status: string, comment: string | null = null) {
  return {
    userId: USER.id,
    user: USER,
    dateOptionId,
    status,
    comment,
    autoRegisterWhenPromoted: false,
    createdAt: new Date('2026-07-01T00:30:00Z'), // JST では 09:30
    dateOption: DATE_OPTIONS.find((o) => o.id === dateOptionId),
  }
}

/** 先頭の `#` 行と空行を除いた、見出しから先の行 */
async function csvOf(response: Response) {
  const lines = await linesOf(response)
  return lines.slice(lines.indexOf('') + 1)
}

async function linesOf(response: Response) {
  const text = await response.text()
  // BOM を落として行に割る
  return text.replace(/^﻿/, '').split('\n')
}

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockIsOrganizer.mockReset()
})

describe('GET /api/v1/pre-events/[id]/export', () => {
  it('未ログインは401', async () => {
    mockGetSession.mockResolvedValue(null)
    await expectContract(await GET(makeRequest('/x'), { params }))
  })

  it('主催者・幹事でなければ403', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    prismaMock.preEvent.findUnique.mockResolvedValue({ id: 'pre_1' })
    mockIsOrganizer.mockResolvedValue(false)

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(403)
    await expectContract(response)
  })

  /*
    **ここが本題。** `defineRoute` は `NextResponse` しか素通ししない作りで、
    このルートだけが素の `Response` を返していた。結果 CSV が
    `{"data":{}}` という JSON に包まれて配信され、開いても中身が無かった。
    `Content-Type` と本文の両方を見る — どちらか片方だと、
    ヘッダーだけ CSV で中身が JSON という状態を見逃す。
  */
  it('CSV をそのまま返す（JSON に包まない）', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEvent([answer('opt_1', 'available')])
    )

    const response = await GET(makeRequest('/x'), { params })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    expect(response.headers.get('Content-Disposition')).toContain('attachment')

    /*
      BOM は生のバイトで確かめる。`Response.text()` は復号のときに
      先頭の BOM を落とすので、文字列で見ると「付けたつもりで付いていない」
      ことに気づけない。Excel はこれが無いと日本語を文字化けさせる。
    */
    const bytes = new Uint8Array(await response.clone().arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])

    const text = await response.text()
    expect(text).not.toContain('"data"')
    expect(text).toContain('日程調整ID')
  })

  it('先頭に # 行で日程調整の情報を載せ、空行のあとに見出しが来る', async () => {
    process.env.NEXTAUTH_URL = 'https://hosteka.test'
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue(preEvent([]))

    const lines = await linesOf(await GET(makeRequest('/x'), { params }))
    expect(lines.slice(0, 5)).toEqual([
      '# 日程調整名,"忘年会の日程"',
      '# 日程調整ID,"pre_1"',
      '# 開催場所,"渋谷"',
      '# 参加費,""',
      '# 日程調整URL,"https://hosteka.test/pre-events/pre_1"',
    ])
    expect(lines[5]).toMatch(/^# 出力日時,"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00"$/)
    expect(lines[6]).toBe('')
    expect(lines[7]).toContain('"ユーザー名","ユーザーID"')
    expect(lines[7]).toContain('"ユーザーコメント"')
  })

  it('候補日が列になり、回答が並ぶ', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEvent([answer('opt_1', 'available'), answer('opt_2', 'maybe')])
    )

    const [header, row] = await csvOf(await GET(makeRequest('/x'), { params }))
    // JST の 9/12 19:00 と 9/13 19:00（UTC 10:00）
    expect(header).toContain('"2026-09-12T19:00:00+09:00"')
    expect(header).toContain('"2026-09-13T19:00:00+09:00"')
    expect(row).toContain('"参加可能"')
    expect(row).toContain('"未定"')
  })

  it('終了のある候補日は区間、時刻の無い候補日は日付だけ', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue({
      ...preEvent([]),
      dateOptions: [
        {
          id: 'opt_1',
          startDate: new Date('2026-09-12T19:00:00+09:00'),
          endDate: new Date('2026-09-12T22:00:00+09:00'),
        },
        { id: 'opt_2', startDate: new Date('2026-09-13T00:00:00+09:00'), endDate: null },
      ],
    })

    const [header] = await csvOf(await GET(makeRequest('/x'), { params }))
    expect(header).toContain('"2026-09-12T19:00:00+09:00/2026-09-12T22:00:00+09:00"')
    expect(header.endsWith('"2026-09-13"')).toBe(true)
  })

  /*
    **答えていない候補日を「参加不可」にしない。** 回答は候補日ごとに1行
    なので、行が無い＝まだ答えていない。あとから足した候補日が全員
    「参加不可」で出ると、主催者からは全員が×を付けたのと区別がつかない。
  */
  it('回答が無い候補日は「未回答」', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEvent([answer('opt_1', 'available')])
    )

    const [, row] = await csvOf(await GET(makeRequest('/x'), { params }))
    expect(row.endsWith('"未回答"')).toBe(true)
  })

  /*
    引用符を含むコメントで列がずれないこと。
    `"` をそのまま挟むと、そこから先の行がすべて壊れる。
  */
  it('コメントの引用符を逃がす', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEvent([answer('opt_1', 'available', '"最高" だった')])
    )

    const [, row] = await csvOf(await GET(makeRequest('/x'), { params }))
    expect(row).toContain('"""最高"" だった"')
  })

  /** 登録日時はサーバーのタイムゾーンに依らせない（UTC 00:30 → JST 9:30） */
  it('登録日時は +09:00 付きの ISO 8601', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.user)
    mockIsOrganizer.mockResolvedValue(true)
    prismaMock.preEvent.findUnique.mockResolvedValue(
      preEvent([answer('opt_1', 'available')])
    )

    const [, row] = await csvOf(await GET(makeRequest('/x'), { params }))
    expect(row).toContain('"2026-07-01T09:30:00+09:00"')
  })
})
