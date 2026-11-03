import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { prismaMock, resetPrismaMock } from '@/test/contract'

import {
  deliver,
  notifyEventUpdated,
  notifyParticipationChanged,
  notifyPreEventUpdated,
} from './notify'

/**
 * 通知の送出。
 *
 * ここが守るのは2つ。**受信者が何人でもクエリ数が一定であること**と、
 * **同時に走っても重複行ができないこと**。
 */
const NOW = new Date('2026-09-18T12:00:00+09:00')
const SEEN = new Date('2026-09-18T09:00:00+09:00')

function users(ids: string[], seenAt = SEEN) {
  return ids.map((id) => ({ id, notificationsSeenAt: seenAt }))
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'event_updated' as const,
    targetType: 'event' as const,
    targetId: 'evt_1',
    actorId: 'host_1',
    payload: { title: '花見の会' },
    recipientIds: ['user_1', 'user_2'],
    now: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findMany.mockResolvedValue(users(['user_1', 'user_2']))
  prismaMock.notification.createMany.mockResolvedValue({ count: 2 })
  prismaMock.notification.updateMany.mockResolvedValue({ count: 0 })
})

describe('宛先', () => {
  /**
   * 自分がイベントを編集して、自分に「編集されました」が届いてはならない。
   * 落とすのは deliver の中だけ — 呼び出し側でやると必ずどこかで忘れる
   */
  it('原因になった本人には送らない', async () => {
    prismaMock.user.findMany.mockResolvedValue(users(['user_1']))

    await deliver(base({ recipientIds: ['user_1', 'host_1'] }))

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user_1'] } },
      select: { id: true, notificationsSeenAt: true },
    })
  })

  it('同じ人が2回入っていても1件しか作らない', async () => {
    prismaMock.user.findMany.mockResolvedValue(users(['user_1']))

    await deliver(base({ recipientIds: ['user_1', 'user_1'] }))

    expect(prismaMock.notification.createMany.mock.calls[0][0].data).toHaveLength(1)
  })

  it('宛先が本人だけなら何も書かない', async () => {
    const result = await deliver(base({ recipientIds: ['host_1'] }))

    expect(result).toEqual({ created: 0, folded: 0 })
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })

  it('宛先のユーザーが1人も見つからなければ何も書かない', async () => {
    prismaMock.user.findMany.mockResolvedValue([])

    const result = await deliver(base())

    expect(result).toEqual({ created: 0, folded: 0 })
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })
})

describe('行の作成', () => {
  it('createdAt と occurredAt に同じ now を書く', async () => {
    await deliver(base())

    const rows = prismaMock.notification.createMany.mock.calls[0][0].data
    for (const row of rows) {
      expect(row.createdAt).toBe(NOW)
      expect(row.occurredAt).toBe(NOW)
    }
  })

  /** 「読んで、無ければ作る」は同時実行で2行できる。一意制約に当てて DB に決めさせる */
  it('重複は DB に任せる（skipDuplicates）', async () => {
    await deliver(base())

    expect(prismaMock.notification.createMany.mock.calls[0][0]).toMatchObject({
      skipDuplicates: true,
    })
  })

  it('畳む種別では、受信者の既読位置を鍵にする', async () => {
    await deliver(base())

    const rows = prismaMock.notification.createMany.mock.calls[0][0].data
    expect(rows[0].foldKey).toBe(SEEN.toISOString())
  })

  it('既読位置が人ごとに違えば、鍵も人ごとに違う', async () => {
    const other = new Date('2026-09-18T11:00:00+09:00')
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'user_1', notificationsSeenAt: SEEN },
      { id: 'user_2', notificationsSeenAt: other },
    ])

    await deliver(base())

    const rows = prismaMock.notification.createMany.mock.calls[0][0].data
    expect(rows[0].foldKey).toBe(SEEN.toISOString())
    expect(rows[1].foldKey).toBe(other.toISOString())
  })

  it('畳まない種別は鍵を持たず、更新もしない', async () => {
    prismaMock.notification.createMany.mockResolvedValue({ count: 2 })

    const result = await deliver(base({ kind: 'participation_requested' }))

    const rows = prismaMock.notification.createMany.mock.calls[0][0].data
    expect(rows.every((r: { foldKey: string | null }) => r.foldKey === null)).toBe(true)
    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled()
    expect(result.folded).toBe(0)
  })
})

describe('畳み', () => {
  /** 作れなかった分＝既に未読の同種行を持っている人 */
  it('作れなかった行があるときだけ更新する', async () => {
    prismaMock.notification.createMany.mockResolvedValue({ count: 2 })

    await deliver(base())

    expect(prismaMock.notification.updateMany).not.toHaveBeenCalled()
  })

  it('回数は読まずに DB 側で足す', async () => {
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 })
    prismaMock.notification.updateMany.mockResolvedValue({ count: 2 })

    const result = await deliver(base())

    expect(prismaMock.notification.updateMany.mock.calls[0][0].data).toMatchObject({
      occurredAt: NOW,
      repeatCount: { increment: 1 },
    })
    expect(result.folded).toBe(2)
  })

  /** 古い写しを残すと「編集されました」と言いながら変更前のタイトルを出す */
  it('畳むときに actor と payload も書き換える', async () => {
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 })
    prismaMock.notification.updateMany.mockResolvedValue({ count: 2 })

    await deliver(base({ payload: { title: '花見の会（改）', changed: ['日時'] } }))

    expect(prismaMock.notification.updateMany.mock.calls[0][0].data).toMatchObject({
      actorId: 'host_1',
      payload: JSON.stringify({ title: '花見の会（改）', changed: ['日時'] }),
    })
  })

  /** 直前に作った行まで畳むと、作った瞬間に repeatCount が 2 になる */
  it('いま作った行を巻き込まない', async () => {
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 })

    await deliver(base())

    expect(prismaMock.notification.updateMany.mock.calls[0][0].where).toMatchObject({
      kind: 'event_updated',
      targetType: 'event',
      targetId: 'evt_1',
      occurredAt: { lt: NOW },
    })
  })

  it('人ごとの鍵で狙い撃つ（他人の既読の行を蘇らせない）', async () => {
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 })

    await deliver(base())

    expect(prismaMock.notification.updateMany.mock.calls[0][0].where.OR).toEqual([
      { userId: 'user_1', foldKey: SEEN.toISOString() },
      { userId: 'user_2', foldKey: SEEN.toISOString() },
    ])
  })
})

describe('受信者が多いとき', () => {
  const many = Array.from({ length: 450 }, (_, i) => `user_${i}`)

  beforeEach(() => {
    prismaMock.user.findMany.mockResolvedValue(users(many))
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 })
    prismaMock.notification.updateMany.mockResolvedValue({ count: 200 })
  })

  /** 人ごとにループしてクエリを撃つと、編集のたびに数百本走る */
  it('既読位置の取得と作成はそれぞれ1本', async () => {
    await deliver(base({ recipientIds: many }))

    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.notification.createMany).toHaveBeenCalledTimes(1)
  })

  /** 450項の OR を1本にするとプランナがつらい */
  it('更新の OR は 200 件ずつに割る', async () => {
    await deliver(base({ recipientIds: many }))

    expect(prismaMock.notification.updateMany).toHaveBeenCalledTimes(3)
    const sizes = prismaMock.notification.updateMany.mock.calls.map(
      (call) => call[0].where.OR.length
    )
    expect(sizes).toEqual([200, 200, 50])
  })
})

describe('状態ごとの振り分け', () => {
  /**
   * 登録と変更の両方がここを通る。POST と PUT の両方に書き分けると、
   * 片方だけ直した日に通知の種類が食い違う
   */
  function kindOf() {
    return prismaMock.notification.createMany.mock.calls[0][0].data[0].kind
  }

  beforeEach(() => {
    prismaMock.event.findUnique.mockResolvedValue({
      creatorId: 'host_1',
      organizationId: null,
      participants: [],
    })
    prismaMock.user.findMany.mockResolvedValue(users(['host_1']))
    prismaMock.notification.createMany.mockResolvedValue({ count: 1 })
  })

  const event = { id: 'evt_1', title: '花見の会' }

  it('参加リクエストは専用の種別になる', async () => {
    await notifyParticipationChanged(event, 'user_1', 'participation_request')
    expect(kindOf()).toBe('participation_requested')
  })

  it('キャンセルは取り下げとして届く', async () => {
    await notifyParticipationChanged(event, 'user_1', 'cancelled')
    expect(kindOf()).toBe('participation_cancelled')
  })

  it('参加・未定・欠席はまとめて参加登録', async () => {
    for (const status of ['attending', 'maybe', 'not_attending'] as const) {
      resetPrismaMock()
      prismaMock.event.findUnique.mockResolvedValue({
        creatorId: 'host_1',
        organizationId: null,
        participants: [],
      })
      prismaMock.user.findMany.mockResolvedValue(users(['host_1']))
      prismaMock.notification.createMany.mockResolvedValue({ count: 1 })

      await notifyParticipationChanged(event, 'user_1', status)
      expect(kindOf(), status).toBe('participation_registered')
    }
  })
})

describe('変更が無いときは送らない', () => {
  /** 説明の誤字を直しただけで全参加者に通知が飛ぶのを防ぐ最後の砦 */
  it('知らせる変更が空なら、宛先すら引かない', async () => {
    expect(await notifyEventUpdated({ id: 'evt_1', title: '花見の会' }, [], 'host_1')).toEqual({
      created: 0,
      folded: 0,
    })
    expect(await notifyPreEventUpdated({ id: 'pre_1', title: '歓迎会' }, [], 'host_1')).toEqual({
      created: 0,
      folded: 0,
    })

    expect(prismaMock.eventParticipant.findMany).not.toHaveBeenCalled()
    expect(prismaMock.preEventParticipant.findMany).not.toHaveBeenCalled()
    expect(prismaMock.notification.createMany).not.toHaveBeenCalled()
  })
})
