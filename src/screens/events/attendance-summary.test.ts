import { describe, expect, it } from 'vitest'

import type { AttendanceRowDto } from '@/server/serializers/event'

import {
  byUnenteredFirst,
  filterRows,
  isFiltering,
  NO_FILTER,
  summarize,
} from './attendance-summary'

const row = (over: Partial<AttendanceRowDto> = {}): AttendanceRowDto => ({
  userId: 'u1',
  user: {
    id: 'u1',
    username: 'taro',
    displayName: '太郎',
    avatar: null,
    server: 'handon.club',
    platform: 'mastodon',
  },
  participantStatus: 'attending',
  comment: null,
  options: [],
  attendStatus: 'not_entered',
  feeStatus: 'not_entered',
  memo: null,
  ...over,
})

describe('summarize', () => {
  /*
    **未記録は欠席ではない。** 混ぜると「受付が終わったか」が分からなくなる。
  */
  it('未記録と欠席を分けて数える', () => {
    const summary = summarize([
      row({ attendStatus: 'present' }),
      row({ attendStatus: 'absent' }),
      row(),
      row(),
    ])
    expect(summary).toMatchObject({ total: 4, present: 1, absent: 1, notEntered: 2 })
  })

  it('集金も未記録を数に入れない', () => {
    const summary = summarize([
      row({ feeStatus: 'paid' }),
      row({ feeStatus: 'unpaid' }),
      row(),
    ])
    expect(summary).toMatchObject({ paid: 1, unpaid: 1 })
  })

  it('誰もいなければ全部0', () => {
    expect(summarize([])).toEqual({
      total: 0,
      present: 0,
      absent: 0,
      notEntered: 0,
      paid: 0,
      unpaid: 0,
    })
  })
})

describe('filterRows', () => {
  const taro = row()
  const hanako = row({
    userId: 'u2',
    user: {
      id: 'u2',
      username: 'hanako',
      displayName: '花子',
      avatar: null,
      server: 'misskey.io',
      platform: 'misskey',
    },
  })
  const by = (over: Partial<typeof NO_FILTER>) => ({ ...NO_FILTER, ...over })

  it('表示名で引ける', () => {
    expect(filterRows([taro, hanako], by({ query: '花' }))).toEqual([hanako])
  })

  /*
    **ユーザー名でも引ける。** 受付では名乗られた名前と表示名が
    一致しないことがある（ハンドルで名乗る人）。
  */
  it('ユーザー名でも引ける', () => {
    expect(filterRows([taro, hanako], by({ query: 'taro' }))).toEqual([taro])
  })

  it('大文字小文字は区別しない', () => {
    expect(filterRows([taro, hanako], by({ query: 'TARO' }))).toEqual([taro])
  })

  it('サーバー名でも引ける。同名の人を見分けるため', () => {
    expect(filterRows([taro, hanako], by({ query: 'misskey.io' }))).toEqual([hanako])
  })

  it('空なら全部返す', () => {
    expect(filterRows([taro, hanako], by({ query: '   ' }))).toHaveLength(2)
  })

  it('出欠で絞る', () => {
    const present = row({ userId: 'p', attendStatus: 'present' })
    expect(filterRows([present, taro], by({ attend: 'present' }))).toEqual([present])
  })

  it('集金で絞る', () => {
    const unpaid = row({ userId: 'u', feeStatus: 'unpaid' })
    expect(filterRows([unpaid, taro], by({ fee: 'unpaid' }))).toEqual([unpaid])
  })

  /*
    **条件はすべてを満たすものを残す。** 「出席したのに未払」を探すのが
    集金が合わないときの使い方になる。
  */
  it('出欠と集金を組み合わせられる', () => {
    const target = row({ userId: 'target', attendStatus: 'present', feeStatus: 'unpaid' })
    const paid = row({ userId: 'paid', attendStatus: 'present', feeStatus: 'paid' })
    const absent = row({ userId: 'absent', attendStatus: 'absent', feeStatus: 'unpaid' })

    expect(
      filterRows([target, paid, absent], by({ attend: 'present', fee: 'unpaid' }))
    ).toEqual([target])
  })

  it('名前と状態も組み合わせられる。片方しか満たさない人は残さない', () => {
    // 花子は出席しているが名前が合わない。太郎は名前が合うが未記録
    const presentHanako = { ...hanako, attendStatus: 'present' as const }
    expect(filterRows([presentHanako, taro], by({ query: 'taro', attend: 'present' }))).toEqual(
      []
    )
  })

  it('`all` は絞らない', () => {
    expect(filterRows([taro, hanako], NO_FILTER)).toHaveLength(2)
  })
})

describe('isFiltering', () => {
  /*
    絞っているかどうかは画面が出す文言に効く（「◯人中◯人」）。
    **空白だけの検索語は絞っていない扱い。**
  */
  it.each([
    [{ query: 'taro' }, true],
    [{ attend: 'present' as const }, true],
    [{ fee: 'unpaid' as const }, true],
    [{ query: '   ' }, false],
    [{}, false],
  ])('%o なら %s', (over, expected) => {
    expect(isFiltering({ ...NO_FILTER, ...over })).toBe(expected)
  })
})

describe('byUnenteredFirst', () => {
  /*
    当日やることは「まだの人を減らす」こと。**済んだ人が上にいると
    毎回そこを読み飛ばすことになる。**
  */
  it('まだ記録していない人を上に出す', () => {
    const done = row({ userId: 'done', attendStatus: 'present' })
    const yet = row({ userId: 'yet' })
    expect([done, yet].sort(byUnenteredFirst).map((r) => r.userId)).toEqual(['yet', 'done'])
  })

  it('欠席と記録した人も「済んだ人」として下げる', () => {
    const absent = row({ userId: 'absent', attendStatus: 'absent' })
    const yet = row({ userId: 'yet' })
    expect([absent, yet].sort(byUnenteredFirst).map((r) => r.userId)).toEqual(['yet', 'absent'])
  })

  it('同じ状態なら元の順を保つ（回答順のまま）', () => {
    const a = row({ userId: 'a' })
    const b = row({ userId: 'b' })
    expect([a, b].sort(byUnenteredFirst).map((r) => r.userId)).toEqual(['a', 'b'])
  })
})
