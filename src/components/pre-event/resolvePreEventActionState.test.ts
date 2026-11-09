import { describe, expect, it } from 'vitest'

import { resolvePreEventActionState } from './resolvePreEventActionState'

const base = {
  dateOptions: [{ startDate: '2026-09-20T10:00:00.000Z' }],
  registrationDeadline: '2026-09-15T14:59:00.000Z',
  viewer: {
    isAuthenticated: true,
    isOrganizer: false,
    canDelete: false,
    canChangeOrganization: false,
    response: null as { votes: Record<string, never>; comment: null; autoRegisterWhenPromoted: boolean; termsAccepted: boolean } | null,
    isEligible: true,
    ineligibleReason: null as 'platform' | 'server' | null,
  },
  now: new Date('2026-09-01T00:00:00+09:00'),
}

const viewer = (over: Partial<typeof base.viewer>) => ({ ...base.viewer, ...over })
const answered = { votes: {}, comment: null, autoRegisterWhenPromoted: false, termsAccepted: false }

describe('resolvePreEventActionState', () => {
  it('未回答・受付中は open', () => {
    expect(resolvePreEventActionState(base)).toEqual({ kind: 'open' })
  })

  it('回答済みは answered', () => {
    expect(
      resolvePreEventActionState({ ...base, viewer: viewer({ response: answered }) })
    ).toEqual({ kind: 'answered' })
  })

  it('未ログインは anonymous', () => {
    expect(
      resolvePreEventActionState({ ...base, viewer: viewer({ isAuthenticated: false }) })
    ).toEqual({ kind: 'anonymous' })
  })

  it('主催者は終了後も host。内容を見に来る', () => {
    expect(
      resolvePreEventActionState({
        ...base,
        dateOptions: [{ startDate: '2026-08-01T10:00:00.000Z' }],
        viewer: viewer({ isOrganizer: true }),
      })
    ).toEqual({ kind: 'host', answered: false })
  })

  it('未来の候補日が1つも無ければ ended。開催日が無いので候補日で判断する', () => {
    expect(
      resolvePreEventActionState({
        ...base,
        dateOptions: [{ startDate: '2026-08-01T10:00:00.000Z' }],
      })
    ).toEqual({ kind: 'ended', answered: false })
  })

  it('未来の候補が1つでも残っていれば終了しない', () => {
    expect(
      resolvePreEventActionState({
        ...base,
        dateOptions: [
          { startDate: '2026-08-01T10:00:00.000Z' },
          { startDate: '2026-09-20T10:00:00.000Z' },
        ],
      })
    ).toEqual({ kind: 'open' })
  })

  it('締切後は closed。回答済みかどうかは残す', () => {
    expect(
      resolvePreEventActionState({
        ...base,
        registrationDeadline: '2026-08-20T14:59:00.000Z',
        viewer: viewer({ response: answered }),
      })
    ).toEqual({ kind: 'closed', answered: true })
  })

  it('締切が無ければ締切で閉じない', () => {
    expect(
      resolvePreEventActionState({ ...base, registrationDeadline: null })
    ).toEqual({ kind: 'open' })
  })

  it('条件を満たさなければ ineligible。理由を持ち回る', () => {
    expect(
      resolvePreEventActionState({
        ...base,
        viewer: viewer({ isEligible: false, ineligibleReason: 'server' }),
      })
    ).toEqual({ kind: 'ineligible', reason: 'server' })
  })

  it('終了は資格より先に見る。終わったものに資格の話をしない', () => {
    expect(
      resolvePreEventActionState({
        ...base,
        dateOptions: [{ startDate: '2026-08-01T10:00:00.000Z' }],
        viewer: viewer({ isEligible: false }),
      })
    ).toEqual({ kind: 'ended', answered: false })
  })
})
