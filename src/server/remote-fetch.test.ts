import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
  宛先の確認は名前を引く。モックしないとテストが DNS に依存する。
  判定そのものは `outbound-host.test.ts` が見ている。
*/
const checkOutboundHost = vi.fn(async (_host: string): Promise<string | null> => null)
vi.mock('@/server/auth/outbound-host', () => ({
  checkOutboundHost: (host: string) => checkOutboundHost(host),
}))

import { MAX_BODY_BYTES, RemoteFetchError, isBlockedDestination, remoteFetch } from './remote-fetch'

const fetchMock = vi.fn()

beforeEach(() => {
  checkOutboundHost.mockReset()
  checkOutboundHost.mockResolvedValue(null)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 少しずつ流してくる本文。`content-length` を付けない */
function streamOf(chunks: number, chunkSize: number): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= chunks) return controller.close()
      sent++
      controller.enqueue(new Uint8Array(chunkSize))
    },
  })
}

async function reasonOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return error instanceof RemoteFetchError ? error.reason : `other: ${String(error)}`
  }
  return undefined
}

describe('remoteFetch', () => {
  it('内部に解決される宛先には繋がない', async () => {
    checkOutboundHost.mockResolvedValue('private-address')

    const error = await remoteFetch('https://10-0-0-1.nip.io/api/v1/instance').catch((e) => e)

    expect(error).toBeInstanceOf(RemoteFetchError)
    expect(isBlockedDestination(error)).toBe(true)
    expect(checkOutboundHost).toHaveBeenCalledWith('10-0-0-1.nip.io')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('名前が引けないのは「内部」ではない（利用者には「繋がらない」と言う）', async () => {
    checkOutboundHost.mockResolvedValue('unresolvable')

    const error = await remoteFetch('https://nowhere.example/').catch((e) => e)

    expect(error).toBeInstanceOf(RemoteFetchError)
    expect(isBlockedDestination(error)).toBe(false)
  })

  it('リダイレクトは追わず、失敗にする', async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 307, headers: { location: 'http://10.0.0.1:8080/' } })
    )

    expect(await reasonOf(remoteFetch('https://evil.example/api/v1/apps', { method: 'POST' }))).toBe(
      'redirect'
    )
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual', method: 'POST' })
  })

  it('タイムアウトを必ず付ける', async () => {
    fetchMock.mockResolvedValue(new Response('{}'))

    await remoteFetch('https://mastodon.example/')

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('大きすぎると申告された本文は読まない', async () => {
    fetchMock.mockResolvedValue(
      new Response(streamOf(1, 1), { headers: { 'content-length': String(MAX_BODY_BYTES + 1) } })
    )

    expect(await reasonOf(remoteFetch('https://mastodon.example/'))).toBe('too-large')
  })

  it('申告が無くても、上限を超えたところで読むのをやめる', async () => {
    fetchMock.mockResolvedValue(new Response(streamOf(1000, 64 * 1024)))

    expect(await reasonOf(remoteFetch('https://mastodon.example/'))).toBe('too-large')
  })

  it('ふつうの応答は、ステータスと本文をそのまま読める', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_client' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    )

    const response = await remoteFetch('https://mastodon.example/oauth/token')

    expect(response.status).toBe(401)
    expect(response.ok).toBe(false)
    expect(await response.json()).toEqual({ error: 'invalid_client' })
  })

  it('本文を持てない 204 も返せる', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    const response = await remoteFetch('https://mastodon.example/oauth/revoke')

    expect(response.status).toBe(204)
  })
})
