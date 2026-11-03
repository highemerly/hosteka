import { describe, expect, it } from 'vitest'

import { isReportableTarget } from './report'

describe('isReportableTarget', () => {
  it('cuid のイベントIDは通報できる', () => {
    expect(isReportableTarget({ eventId: 'cmf0000000000000000000000' })).toBe(true)
  })

  it('シードのモックのような短いIDは通報できない', () => {
    // prisma/seed-mock-event.ts が手で付けているID。cuid ではない
    expect(isReportableTarget({ eventId: 'mock-list-request' })).toBe(false)
  })

  it('対象を2つ指定したものは通報できない', () => {
    expect(
      isReportableTarget({
        eventId: 'cmf0000000000000000000000',
        preEventId: 'cmf0000000000000000000001',
      })
    ).toBe(false)
  })

  it('対象が無いものは通報できない', () => {
    expect(isReportableTarget({})).toBe(false)
  })
})
