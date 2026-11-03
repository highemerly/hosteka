import { describe, expect, it } from 'vitest'

import { allowedFediverseServersSchema } from './allowed-servers'
import { COUNT_LIMITS } from './limits'

const hosts = (n: number) => Array.from({ length: n }, (_, i) => `s${i}.example`)

/**
 * 保存のたびに、サーバーの数だけ外部へ種別を問い合わせる。上限が無いと
 * 1回の保存で何万件も飛ばせるので、数を絞る。
 */
describe('allowedFediverseServersSchema', () => {
  it(`${COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS}個までは通る`, () => {
    expect(allowedFediverseServersSchema.safeParse(hosts(COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS)).success).toBe(true)
  })

  it('それを超えると断る', () => {
    const result = allowedFediverseServersSchema.safeParse(hosts(COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS + 1))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain('個まで')
  })

  it('空は「制限なし」として通る', () => {
    expect(allowedFediverseServersSchema.safeParse([]).success).toBe(true)
  })
})
