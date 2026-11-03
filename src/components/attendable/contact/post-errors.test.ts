import { describe, expect, it } from 'vitest'

import { ApiClientError } from '@/lib/api/client'

import { isWritePermissionError, WRITE_PERMISSION_PATH } from './post-errors'

const apiError = (init: Partial<ConstructorParameters<typeof ApiClientError>[0]>) =>
  new ApiClientError({
    code: 'FORBIDDEN',
    message: '投稿が権限不足で断られました',
    status: 403,
    ...init,
  })

describe('isWritePermissionError', () => {
  it('サーバーが置いた印で見分ける', () => {
    expect(
      isWritePermissionError(
        apiError({ details: [{ path: WRITE_PERMISSION_PATH, message: 'Mastodon API error' }] })
      )
    ).toBe(true)
  })

  /*
    **文言では判定しない。** 旧実装は「権限」「403」「Unauthorized」を
    エラー文字列から探していたが、あれは相手のサーバーが返した文言で、
    言語も内容も向こう次第。ここが文言に戻ると、日本語以外のサーバーで
    黙って案内が出なくなる。
  */
  it('文言が権限の話でも、印が無ければ権限エラーとみなさない', () => {
    expect(
      isWritePermissionError(
        apiError({ message: '権限がありません 403 Unauthorized', details: [] })
      )
    ).toBe(false)
  })

  it('別の理由で断られたときは false', () => {
    expect(
      isWritePermissionError(
        apiError({
          code: 'SERVICE_UNAVAILABLE',
          status: 503,
          details: [{ path: 'message', message: '文字数超過' }],
        })
      )
    ).toBe(false)
  })

  it('通信そのものが失敗したときも false', () => {
    expect(isWritePermissionError(new Error('Network error'))).toBe(false)
    expect(isWritePermissionError(undefined)).toBe(false)
  })
})
