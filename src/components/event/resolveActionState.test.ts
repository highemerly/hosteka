import { describe, it, expect } from 'vitest'

import { resolveEventActionState } from './resolveActionState'

const base = {
  status: 'active',
  isEnded: false,
  registrationDeadline: '2026-09-10T23:59:00+09:00',
  maxParticipants: 40,
  attendingCount: 10,
  allowParticipationRequest: false,
  viewer: {
    isAuthenticated: true,
    isOrganizer: false,
    participationStatus: null as string | null,
    isEligible: true,
    ineligibleReason: null as 'platform' | 'server' | null,
  },
  now: new Date('2026-09-01T00:00:00+09:00'),
}

const viewer = (over: Partial<typeof base.viewer>) => ({ ...base.viewer, ...over })

describe('resolveEventActionState', () => {
  it('未登録・受付中は open', () => {
    expect(resolveEventActionState(base)).toEqual({ kind: 'open' })
  })

  it('未ログインは anonymous', () => {
    expect(
      resolveEventActionState({ ...base, viewer: viewer({ isAuthenticated: false }) })
    ).toEqual({ kind: 'anonymous' })
  })

  it('登録済みは自分の状態を返す', () => {
    expect(
      resolveEventActionState({
        ...base,
        viewer: viewer({ participationStatus: 'maybe' }),
      })
    ).toEqual({ kind: 'registered', status: 'maybe' })
  })

  // キャンセル済みは「未登録」と同じ扱い。再登録できる必要がある
  it('キャンセル済みは未登録として扱う', () => {
    expect(
      resolveEventActionState({
        ...base,
        viewer: viewer({ participationStatus: 'cancelled' }),
      })
    ).toEqual({ kind: 'open' })
  })

  it('締切後は closed', () => {
    expect(
      resolveEventActionState({ ...base, now: new Date('2026-09-11T00:00:00+09:00') })
    ).toEqual({ kind: 'closed' })
  })

  // ここを間違えると「参加しているのに満員と表示される」
  it('締切後でも登録済みなら自分の状態を優先する', () => {
    expect(
      resolveEventActionState({
        ...base,
        now: new Date('2026-09-11T00:00:00+09:00'),
        viewer: viewer({ participationStatus: 'attending' }),
      })
    ).toEqual({ kind: 'registered', status: 'attending' })
  })

  it('満員でリクエスト不可なら full', () => {
    expect(resolveEventActionState({ ...base, attendingCount: 40 })).toEqual({
      kind: 'full',
    })
  })

  it('満員でもリクエスト可なら requestable', () => {
    expect(
      resolveEventActionState({
        ...base,
        attendingCount: 40,
        allowParticipationRequest: true,
      })
    ).toEqual({ kind: 'requestable' })
  })

  it('定員未設定なら満員にならない', () => {
    expect(
      resolveEventActionState({ ...base, maxParticipants: null, attendingCount: 999 })
    ).toEqual({ kind: 'open' })
  })

  it('欠席と回答済みなら registered。未回答に戻さない', () => {
    expect(
      resolveEventActionState({
        ...base,
        viewer: viewer({ participationStatus: 'not_attending' }),
      })
    ).toEqual({ kind: 'registered', status: 'not_attending' })
  })

  it('キャンセル済みは未回答に戻す。回答を取り消したという意味だから', () => {
    expect(
      resolveEventActionState({ ...base, viewer: viewer({ participationStatus: 'cancelled' }) })
    ).toEqual({ kind: 'open' })
  })

  it('締切後でも欠席の回答は見える', () => {
    expect(
      resolveEventActionState({
        ...base,
        registrationDeadline: '2026-08-01T23:59:00+09:00',
        viewer: viewer({ participationStatus: 'not_attending' }),
      })
    ).toEqual({ kind: 'registered', status: 'not_attending' })
  })

  it('締切後でもリクエストを受け付けるなら requestable', () => {
    expect(
      resolveEventActionState({
        ...base,
        registrationDeadline: '2026-08-01T23:59:00+09:00',
        allowParticipationRequest: true,
      })
    ).toEqual({ kind: 'requestable' })
  })

  it('締切後でリクエストも受け付けないなら closed', () => {
    expect(
      resolveEventActionState({
        ...base,
        registrationDeadline: '2026-08-01T23:59:00+09:00',
        allowParticipationRequest: false,
      })
    ).toEqual({ kind: 'closed' })
  })

  it('参加資格を満たさない場合は ineligible。締切後の closed と混ぜない', () => {
    expect(
      resolveEventActionState({ ...base, viewer: viewer({ isEligible: false }) })
    ).toEqual({ kind: 'ineligible', reason: null })
  })

  it('参加できない理由をそのまま渡す', () => {
    expect(
      resolveEventActionState({
        ...base,
        viewer: viewer({ isEligible: false, ineligibleReason: 'server' }),
      })
    ).toEqual({ kind: 'ineligible', reason: 'server' })
  })

  it('資格がなく、かつ締切後でも ineligible を優先する', () => {
    expect(
      resolveEventActionState({
        ...base,
        registrationDeadline: '2026-08-01T23:59:00+09:00',
        viewer: viewer({ isEligible: false }),
      })
    ).toEqual({ kind: 'ineligible', reason: null })
  })

  it('中止されたイベントは cancelled', () => {
    expect(resolveEventActionState({ ...base, status: 'cancelled' })).toEqual({
      kind: 'cancelled',
    })
  })

  // 主催者は中止後も参加者への連絡などで管理を続ける必要がある
  it('主催者は中止後も幹事メニューを出す', () => {
    expect(
      resolveEventActionState({
        ...base,
        status: 'cancelled',
        viewer: viewer({ isOrganizer: true }),
      })
    ).toEqual({ kind: 'host' })
  })

  it('終了したイベントは ended', () => {
    expect(resolveEventActionState({ ...base, isEnded: true })).toEqual({ kind: 'ended' })
  })

  // 終了後も参加者への連絡や出欠の記録が残っている。
  // ここで ended に倒すと主催者が管理画面へ入れなくなる
  it('主催者は終了後も幹事メニューを出す', () => {
    expect(
      resolveEventActionState({
        ...base,
        isEnded: true,
        viewer: viewer({ isOrganizer: true }),
      })
    ).toEqual({ kind: 'host' })
  })

  it('主催者は締切後・満員でも幹事メニューを出す', () => {
    expect(
      resolveEventActionState({
        ...base,
        now: new Date('2026-09-11T00:00:00+09:00'),
        attendingCount: 40,
        viewer: viewer({ isOrganizer: true }),
      })
    ).toEqual({ kind: 'host' })
  })
})
