import { describe, expect, it } from 'vitest'

import { flattenHomepageUrlErrors, flattenSocialAccountErrors } from './profile-field-errors'

describe('flattenSocialAccountErrors', () => {
  it('エラーが無ければ空', () => {
    expect(flattenSocialAccountErrors({})).toEqual({ rows: {} })
  })

  it('行ごとのエラーを行番号で引けるようにする', () => {
    const result = flattenSocialAccountErrors({
      socialAccounts: [undefined, { server: { message: 'Xのサーバーは x.com です' } }],
    })
    expect(result.rows).toEqual({ 1: 'Xのサーバーは x.com です' })
  })

  /** 行のエラーがあるのに上に何も出ないと、どこが悪いのか分からないまま止まる */
  it('行にエラーがあれば、欄全体にもまとめを出す', () => {
    const result = flattenSocialAccountErrors({
      socialAccounts: [{ username: { message: 'ユーザー名は必須です' } }],
    })
    expect(result.message).toBe('SNSの入力を確かめてください')
  })

  it('件数の上限は欄全体のエラーになる', () => {
    expect(
      flattenSocialAccountErrors({ socialAccounts: { message: 'SNSのアカウントは5件まで登録できます' } })
        .message
    ).toBe('SNSのアカウントは5件まで登録できます')
  })

  /** 配列と要素の両方にエラーが付くと、配列側は root に入る */
  it('配列と行の両方にエラーがあれば、配列側を上に出す', () => {
    const node = Object.assign([{ username: { message: 'ユーザー名は必須です' } }], {
      root: { message: 'SNSのアカウントは5件まで登録できます' },
    })
    const result = flattenSocialAccountErrors({ socialAccounts: node })
    expect(result.message).toBe('SNSのアカウントは5件まで登録できます')
    expect(result.rows).toEqual({ 0: 'ユーザー名は必須です' })
  })

  it('行の先頭に見つかったエラーを1つ出す', () => {
    const result = flattenSocialAccountErrors({
      socialAccounts: [
        { username: { message: 'ユーザー名は必須です' }, server: { message: 'サーバーは必須です' } },
      ],
    })
    expect(result.rows[0]).toBe('ユーザー名は必須です')
  })
})

describe('flattenHomepageUrlErrors', () => {
  it('行ごとのエラーを行番号で引けるようにする', () => {
    const result = flattenHomepageUrlErrors({
      homepageUrls: [undefined, { message: 'ホームページは「https://」または「http://」から始まる有効なURL形式で入力してください' }],
    })
    expect(result.rows[1]).toContain('https://')
  })

  it('件数の上限は欄全体のエラーになる', () => {
    expect(
      flattenHomepageUrlErrors({ homepageUrls: { message: 'ホームページは2件まで登録できます' } })
        .message
    ).toBe('ホームページは2件まで登録できます')
  })
})
