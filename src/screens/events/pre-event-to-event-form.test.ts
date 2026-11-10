import { describe, expect, it } from 'vitest'

import { promotionMismatches } from '@/lib/pre-event-promotion'
import { eventFormSchema } from '@/schemas/event'
import type { PreEventDetailDto } from '@/server/serializers/pre-event'

import {
  PRE_EVENT_TO_EVENT,
  promotionSourceOf,
  toEventFormValuesFromPreEvent,
} from './pre-event-to-event-form'

/**
 * 日程調整 → イベントの作成画面。
 *
 * 守ること:
 *   1. 写すとした項目が、本当に入力欄へ入っている（見本は空にしない —
 *      null は写し忘れても null で通る）
 *   2. そのまま送ると、サーバーの突き合わせ（`promotionMismatches`）を通る。
 *      画面で固定した値とサーバーが見る値が違うと、開いて送るだけで断られる
 */
const FULL: PreEventDetailDto = {
  id: 'pre_1',
  title: '忘年会',
  description: '## 会場\n駅前',
  hashtags: ['忘年会'],
  location: '東京都千代田区千代田1-1',
  fee: '3,000円',
  relatedUrl: 'https://example.com',
  terms: '写真を公開することがあります',
  isPublic: false,
  isHighlighted: false,
  allowAutoRegistration: true,
  registrationDeadline: '2026-12-01T14:59:00.000Z',
  allowedServers: [
    { server: 'handon.club', platform: 'mastodon' },
    { server: 'misskey.io', platform: 'misskey' },
  ],
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  isAllowedForTwitter: false,
  creator: {
    id: 'u_host',
    username: 'host',
    displayName: '主催者',
    avatar: null,
    server: 'handon.club',
    platform: 'mastodon',
  },
  organization: { id: 'org_1', slug: 'sample', name: 'サンプル会' },
  dateOptions: [
    {
      id: 'd1',
      // 12/12 19:00–21:00 JST
      startDate: '2026-12-12T10:00:00.000Z',
      endDate: '2026-12-12T12:00:00.000Z',
      displayOrder: 0,
      counts: { available: 3, maybe: 1, unavailable: 0 },
      attendees: [],
      autoRegisterCount: 2,
    },
  ],
  respondents: [],
  respondentCount: 4,
  promotion: null,
  viewer: {
    isAuthenticated: true,
    isOrganizer: true,
    canDelete: true,
    canChangeOrganization: true,
    response: null,
    isEligible: true,
    ineligibleReason: null,
  },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

const OPTION = FULL.dateOptions[0]

describe('日程調整からイベントの入力欄へ', () => {
  const values = toEventFormValuesFromPreEvent(FULL, OPTION)

  it('写す項目がすべて入る', () => {
    expect(values).toMatchObject({
      title: '忘年会',
      description: '## 会場\n駅前',
      hashtags: ['忘年会'],
      location: '東京都千代田区千代田1-1',
      fee: '3,000円',
      relatedUrl: 'https://example.com',
      terms: '写真を公開することがあります',
      isPublic: false,
      isHighlighted: false,
      isAllowedForFediverse: true,
      isAllowedForDiscord: true,
      isAllowedForTwitter: false,
      allowedFediverseServers: ['handon.club', 'misskey.io'],
      organizationId: 'org_1',
      startDate: '2026-12-12',
      startTime: '19:00',
      endDate: '2026-12-12',
      endTime: '21:00',
    })
  })

  it('回答の締切は参加登録の締切に写さない', () => {
    expect(values.registrationDeadlineDate).toBe('')
    expect(values.registrationDeadlineTime).toBe('')
  })

  it('そのまま送ると、検証もサーバーの突き合わせも通る', () => {
    const parsed = eventFormSchema.parse(values)
    expect(promotionMismatches(parsed, promotionSourceOf(FULL), OPTION)).toEqual([])
  })

  it('写すとした項目は、見本の値が入力欄のどこかに現れる', () => {
    const serialized = JSON.stringify(values)
    const carried = Object.entries(PRE_EVENT_TO_EVENT)
      .filter(([, m]) => m.carried)
      .map(([key]) => key as keyof PreEventDetailDto)

    for (const key of carried) {
      const sample = (() => {
        switch (key) {
          case 'organization':
            return FULL.organization!.id
          case 'allowedServers':
            return FULL.allowedServers[0].server
          case 'dateOptions':
            return '2026-12-12'
          case 'hashtags':
            return FULL.hashtags[0]
          default:
            return FULL[key]
        }
      })()
      if (typeof sample === 'boolean') continue // 真偽値は上の toMatchObject が見る
      expect(serialized, key).toContain(JSON.stringify(sample).slice(1, -1))
    }
  })
})
