import { describe, expect, it } from 'vitest'

import { eventsByOrg, eventsByUser, preEventsByOrg, preEventsByUser } from './profile-lists'

/**
 * **ユーザーのページもグループのページも、一覧に載せないものを並べない。**
 *
 * フォームは「URLを知っている人だけが閲覧できる」と約束しているので、
 * `isHighlighted` で絞らないと、未ログインでも開けるページからリンクが張られる。
 */

/** where を平らにして、条件の断片が含まれているかを見る */
function conditions(where: unknown): unknown[] {
  return (where as { AND: unknown[] }).AND
}

const CASES = [
  ['ユーザーのイベント', eventsByUser('u1', 'all')],
  ['ユーザーの日程調整', preEventsByUser('u1', 'all')],
  ['ユーザーのイベント（グループ名義を除く）', eventsByUser('u1', 'personal')],
  ['ユーザーの日程調整（グループ名義を除く）', preEventsByUser('u1', 'personal')],
  ['グループのイベント', eventsByOrg('o1')],
  ['グループの日程調整', preEventsByOrg('o1')],
] as const

describe.each(CASES)('%s', (_, where) => {
  it('一覧に載せない設定のものを外す', () => {
    expect(conditions(where)).toContainEqual({ isHighlighted: true })
  })

  it('ログインユーザーのみのものを外す', () => {
    expect(conditions(where)).toContainEqual({ isPublic: true })
  })

  it('無効化されたものを外す', () => {
    expect(conditions(where)).toContainEqual({ isDisabled: false })
  })
})

describe('絞り込みの対象', () => {
  it('グループのものはグループIDで絞る', () => {
    expect(conditions(eventsByOrg('o1'))).toContainEqual({ organizationId: 'o1' })
    expect(conditions(preEventsByOrg('o1'))).toContainEqual({ organizationId: 'o1' })
  })

  it.each([
    ['イベント', eventsByUser],
    ['日程調整', preEventsByUser],
  ] as const)('ユーザーの%sは、作成したものと所属グループのものを並べる', (_, byUser) => {
    expect(conditions(byUser('u1', 'all'))).toContainEqual({
      OR: [{ creatorId: 'u1' }, { organization: { admins: { some: { userId: 'u1' } } } }],
    })
  })

  /** 名義で分ける。自分で作ったものでも、グループ名義なら外す */
  it.each([
    ['イベント', eventsByUser],
    ['日程調整', preEventsByUser],
  ] as const)('グループ名義を除くと、自分で作ったグループ名義の%sも外す', (_, byUser) => {
    const where = conditions(byUser('u1', 'personal'))
    expect(where).toContainEqual({ creatorId: 'u1' })
    expect(where).toContainEqual({ organizationId: null })
  })
})
