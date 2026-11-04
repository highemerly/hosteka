import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))

import { getEventMetadata } from './event'
import { getPreEventMetadata } from './pre-event'

/**
 * **非公開のものは、メタデータにも中身を出さない。**
 *
 * `robots: { index: false }` は検索避けのお願いで、URL を踏んだ人には
 * 何も効かない。API が 401 を返しても、head に中身を載せれば読める。
 */

const SECRET = {
  title: '退職祝いサプライズ',
  description: '田中さんには内緒で',
  location: '田中さん自宅',
}

beforeEach(() => {
  resetPrismaMock()
})

/** メタデータのあらゆる文字列を1つに畳む（og / twitter の中も見る） */
function allText(meta: unknown): string {
  return JSON.stringify(meta)
}

describe('非公開のイベントのメタデータ', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...SECRET,
      startDate: new Date('2026-06-15T10:00:00+09:00'),
      endDate: null,
      isPublic: false,
      isDisabled: false,
    })
  })

  it('題名・説明・場所を出さない', async () => {
    const text = allText(await getEventMetadata('e1'))
    expect(text).not.toContain(SECRET.title)
    expect(text).not.toContain(SECRET.description)
    expect(text).not.toContain(SECRET.location)
  })

  it('検索避けは index も follow も止める', async () => {
    const meta = await getEventMetadata('e1')
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  /* 共通の画像（題名などを含まない）は載せてよいが、イベント固有の画像は載せない */
  it('イベント固有のリンクカードの画像は載せない', async () => {
    const meta = await getEventMetadata('e1')
    expect(JSON.stringify(meta.openGraph?.images ?? [])).not.toContain('/og/events/')
  })
})

describe('公開のイベントのリンクカードの画像', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_URL', 'https://hosteka.test')
    prismaMock.event.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...SECRET,
      startDate: new Date('2026-06-15T10:00:00+09:00'),
      endDate: null,
      isPublic: true,
      isDisabled: false,
      isHighlighted: true,
    })
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  /*
    クローラーは相対URLを解決しないので絶対URLで書く。版（updatedAt）を付けて、
    編集したら別の URL になるようにする（画像は CDN に長く持たせる）。
  */
  it('版の付いた絶対URLで載せる', async () => {
    const meta = await getEventMetadata('e1')
    expect(meta.openGraph?.images).toEqual([
      expect.objectContaining({
        url: `https://hosteka.test/og/events/e1?v=${new Date('2026-09-01T00:00:00Z').getTime()}`,
        width: 1200,
        height: 630,
      }),
    ])
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
  })
})

describe('非公開の日程調整のメタデータ', () => {
  beforeEach(() => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      ...SECRET,
      isPublic: false,
      isDisabled: false,
      dateOptions: [{ startDate: new Date('2026-06-15T10:00:00+09:00') }],
    })
  })

  it('題名・説明・場所を出さない', async () => {
    const text = allText(await getPreEventMetadata('p1'))
    expect(text).not.toContain(SECRET.title)
    expect(text).not.toContain(SECRET.description)
    expect(text).not.toContain(SECRET.location)
  })

  it('候補日を出さない', async () => {
    const text = allText(await getPreEventMetadata('p1'))
    expect(text).not.toContain('6月15日')
  })

  it('検索避けは index も follow も止める', async () => {
    const meta = await getPreEventMetadata('p1')
    expect(meta.robots).toEqual({ index: false, follow: false })
  })
})

describe('公開されているものは中身を出す', () => {
  it('イベントは題名を出す', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...SECRET,
      startDate: new Date('2026-06-15T10:00:00+09:00'),
      endDate: null,
      isPublic: true,
      isHighlighted: true,
      isDisabled: false,
    })
    expect(allText(await getEventMetadata('e1'))).toContain(SECRET.title)
  })

  it('日程調整は題名と候補日を出す', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      ...SECRET,
      isPublic: true,
      isHighlighted: true,
      isDisabled: false,
      dateOptions: [{ startDate: new Date('2026-06-15T10:00:00+09:00') }],
    })
    const text = allText(await getPreEventMetadata('p1'))
    expect(text).toContain(SECRET.title)
    expect(text).toContain('6月15日')
  })
})

describe('掲載中のもの', () => {
  it('イベントは検索避けを付けない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...SECRET,
      startDate: new Date('2026-06-15T10:00:00+09:00'),
      endDate: null,
      isPublic: true,
      isHighlighted: true,
      isDisabled: false,
    })
    expect((await getEventMetadata('e1')).robots).toBeUndefined()
  })

  it('日程調整は検索避けを付けない', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      ...SECRET,
      isPublic: true,
      isHighlighted: true,
      isDisabled: false,
      dateOptions: [],
    })
    expect((await getPreEventMetadata('p1')).robots).toBeUndefined()
  })
})

/*
  **一覧に載せないものは、中身は出して索引だけ止める。** URL を知っている人は
  開けるので、共有したときのリンクプレビューは要る。sitemap から外すだけでは、
  グループのページや SNS に貼られた URL から辿られて索引されていた。
*/
describe('一覧に載せないイベントのメタデータ', () => {
  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...SECRET,
      startDate: new Date('2026-06-15T10:00:00+09:00'),
      endDate: null,
      isPublic: true,
      isHighlighted: false,
      isDisabled: false,
    })
  })

  it('検索エンジンに索引させない', async () => {
    expect((await getEventMetadata('e1')).robots).toEqual({ index: false })
  })

  it('リンクプレビュー用に題名は出す', async () => {
    const meta = await getEventMetadata('e1')
    expect(JSON.stringify(meta.openGraph)).toContain(SECRET.title)
  })
})

describe('一覧に載せない日程調整のメタデータ', () => {
  beforeEach(() => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      ...SECRET,
      isPublic: true,
      isHighlighted: false,
      isDisabled: false,
      dateOptions: [{ startDate: new Date('2026-06-15T10:00:00+09:00') }],
    })
  })

  it('検索エンジンに索引させない', async () => {
    expect((await getPreEventMetadata('p1')).robots).toEqual({ index: false })
  })

  it('リンクプレビュー用に題名は出す', async () => {
    const meta = await getPreEventMetadata('p1')
    expect(JSON.stringify(meta.openGraph)).toContain(SECRET.title)
  })
})

describe('無効化されたもの', () => {
  it('イベントは中身を出さない', async () => {
    prismaMock.event.findUnique.mockResolvedValue({
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      ...SECRET,
      startDate: new Date('2026-06-15T10:00:00+09:00'),
      endDate: null,
      isPublic: true,
      isDisabled: true,
    })
    expect(allText(await getEventMetadata('e1'))).not.toContain(SECRET.title)
  })

  it('日程調整は中身を出さない', async () => {
    prismaMock.preEvent.findUnique.mockResolvedValue({
      ...SECRET,
      isPublic: true,
      isDisabled: true,
      dateOptions: [],
    })
    expect(allText(await getPreEventMetadata('p1'))).not.toContain(SECRET.title)
  })
})
