import { describe, expect, it } from 'vitest'

import { serializeEventContact } from './event'

const USER = (id: string, over: Partial<{ server: string; platform: string }> = {}) => ({
  id,
  username: `u${id}`,
  displayName: `ユーザー${id}`,
  avatar: null,
  server: 'handon.club',
  platform: 'mastodon',
  // Prisma が返しうる機密。DTOに出てはならない
  accessToken: 'enc:v1:SECRET',
  ipAddresses: '["203.0.113.1"]',
  ...over,
})

const EVENT = {
  id: 'evt_1',
  title: '交流会',
  registrationDeadlineDate: null,
  registrationDeadlineTime: null,
}

const VIEWER = {
  platform: 'mastodon',
  server: 'handon.club',
  mayPostDirectly: true,
  canPostDirectly: true,
}

describe('serializeEventContact', () => {
  it('参加状態ごとに宛先を束ねる。決まった順に並べる', () => {
    const dto = serializeEventContact({
      event: EVENT,
      participants: [
        { status: 'cancelled', user: USER('c') },
        { status: 'attending', user: USER('a') },
        { status: 'not_attending', user: USER('n') },
      ],
      viewer: VIEWER,
    })
    expect(dto.groups.map((g) => g.status)).toEqual(['attending', 'not_attending', 'cancelled'])
  })

  it('誰もいない状態は束ごと出さない。選べない選択肢を並べない', () => {
    const dto = serializeEventContact({
      event: EVENT,
      participants: [{ status: 'attending', user: USER('a') }],
      viewer: VIEWER,
    })
    expect(dto.groups).toHaveLength(1)
  })

  /*
    Discord はメンションで届かない。**宛先から外したうえで数だけ返す** —
    黙って落とすと、連絡できていない人がいることに気づけない。
  */
  it.each([['discord.com'], ['discord:12345']])(
    'Discord（%s）は宛先に入れず、数だけ返す',
    (server) => {
      const dto = serializeEventContact({
        event: EVENT,
        participants: [
          { status: 'attending', user: USER('a') },
          { status: 'attending', user: USER('d', { server, platform: 'discord' }) },
        ],
        viewer: VIEWER,
      })
      expect(dto.groups[0].users.map((u) => u.id)).toEqual(['a'])
      expect(dto.unreachableCount).toBe(1)
    }
  )

  it('機密が混じらない', () => {
    const dto = serializeEventContact({
      event: EVENT,
      participants: [{ status: 'attending', user: USER('a') }],
      viewer: VIEWER,
    })
    expect(JSON.stringify(dto)).not.toContain('SECRET')
    expect(JSON.stringify(dto)).not.toContain('203.0.113.1')
  })

  it('締切は日付列と時刻列を合成して渡す。予約投稿の候補に使う', () => {
    const dto = serializeEventContact({
      event: {
        ...EVENT,
        registrationDeadlineDate: new Date('2026-09-10T00:00:00.000Z'),
        registrationDeadlineTime: '18:00',
      },
      participants: [],
      viewer: VIEWER,
    })
    expect(dto.event.registrationDeadline).toBe('2026-09-10T09:00:00.000Z')
  })

  /*
    時刻列は文字列で、古いデータには `9:00`（0詰めなし）が入りうる。
    **そのまま組むと Invalid Date になり、API が 500 になる。**
  */
  it('壊れた時刻列でも落ちない', () => {
    const dto = serializeEventContact({
      event: {
        ...EVENT,
        registrationDeadlineDate: new Date('2026-09-10T00:00:00.000Z'),
        registrationDeadlineTime: '9:00',
      },
      participants: [],
      viewer: VIEWER,
    })
    expect(dto.event.registrationDeadline).toBe('2026-09-10T14:59:00.000Z')
  })
})
