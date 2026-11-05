import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * users を配列で持つ偽の Prisma。**一意制約も真似る** — 名前を空けずに
 * 書き換えると本物は落ちるので、ここでも落ちないと順番の誤りを見逃す。
 */
type Row = {
  id: string
  username: string
  server: string
  platform: string
  platformUserId: string | null
  displayName: string
  avatar: string | null
  bio: string | null
}

const rows: Row[] = []
let seq = 0

function assertUnique(): void {
  const names = rows.map((r) => `${r.username}@${r.server}`)
  if (new Set(names).size !== names.length) throw new Error('unique: username_server')
  const ids = rows.filter((r) => r.platformUserId !== null).map((r) => `${r.server}/${r.platformUserId}`)
  if (new Set(ids).size !== ids.length) throw new Error('unique: server_platformUserId')
}

const tx = {
  user: {
    findUnique: async ({ where }: { where: Record<string, Record<string, string>> }) => {
      if (where.server_platformUserId) {
        const { server, platformUserId } = where.server_platformUserId
        return rows.find((r) => r.server === server && r.platformUserId === platformUserId) ?? null
      }
      const { username, server } = where.username_server
      return rows.find((r) => r.server === server && r.username === username) ?? null
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = rows.find((r) => r.id === where.id)!
      Object.assign(row, data)
      assertUnique()
      return { ...row, isAdmin: false, lastTermsAcceptedAt: null }
    },
    create: async ({ data }: { data: Omit<Row, 'id' | 'bio'> }) => {
      const row = { id: `new${++seq}`, bio: null, ...data }
      rows.push(row)
      assertUnique()
      return { ...row, isAdmin: false, lastTermsAcceptedAt: null }
    },
  },
}

/** 停止の行（banned_users）。`userId` は停止した行。削除方式だった頃の記録は null */
const bans: { username: string; server: string; userId: string | null }[] = []

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    user: {
      findUnique: async ({ where }: { where: { server_platformUserId: { server: string; platformUserId: string } } }) => {
        const { server, platformUserId } = where.server_platformUserId
        const row = rows.find((r) => r.server === server && r.platformUserId === platformUserId)
        if (!row) return null
        return { ban: bans.some((b) => b.userId === row.id) ? { id: 'ban' } : null }
      },
    },
    bannedUser: {
      findUnique: async ({ where }: { where: { username_server: { username: string; server: string } } }) => {
        const { username, server } = where.username_server
        const ban = bans.find((b) => b.username === username && b.server === server)
        if (!ban) return null
        const row = rows.find((r) => r.id === ban.userId)
        return { user: row ? { platformUserId: row.platformUserId } : null }
      },
    },
  },
}))

import { isBannedHostedLogin, isPlatformUserId, releasedUsername, resolveHostedUser } from './hosted-user'

function seed(row: Partial<Row> & Pick<Row, 'id' | 'username'>): void {
  rows.push({
    server: 'x.com',
    platform: 'twitter',
    platformUserId: null,
    displayName: row.username,
    avatar: null,
    bio: null,
    ...row,
  })
}

function login(platformUserId: string, username: string) {
  return resolveHostedUser({
    platform: 'twitter',
    server: 'x.com',
    platformUserId,
    username,
    displayName: username,
    avatar: null,
  })
}

beforeEach(() => {
  rows.length = 0
  bans.length = 0
  seq = 0
})

describe('resolveHostedUser', () => {
  /**
   * **本題。** 名前で照合すると、Alice が手放した foo を取った Bob が
   * Alice のアカウントに入れる。
   */
  it('手放された名前を取った別人は、前の持ち主のアカウントに入れない', async () => {
    seed({ id: 'alice', username: 'foo', platformUserId: '111', bio: 'Alice です' })

    const user = await login('222', 'foo')

    expect(user.id).not.toBe('alice')
    expect(rows.find((r) => r.id === 'alice')).toMatchObject({
      username: releasedUsername({ id: 'alice', username: 'foo' }),
      platformUserId: '111',
      bio: 'Alice です',
    })
    expect(rows.find((r) => r.id === user.id)).toMatchObject({ username: 'foo', platformUserId: '222' })
  })

  it('名前を変えた本人は、IDで同じアカウントに入り、名前が書き換わる', async () => {
    seed({ id: 'alice', username: 'foo', platformUserId: '111' })

    const user = await login('111', 'bar')

    expect(user.id).toBe('alice')
    expect(rows).toHaveLength(1)
    expect(rows[0].username).toBe('bar')
  })

  /**
   * Bob が手放した foo を Alice が取った。**Bob の行を先に空けないと、
   * Alice の行の書き換えが一意制約で落ちる。**
   */
  it('取り直した名前を別の行が持っていれば、空けてから書き換える', async () => {
    seed({ id: 'alice', username: 'bar', platformUserId: '111' })
    seed({ id: 'bob', username: 'foo', platformUserId: '222' })

    const user = await login('111', 'foo')

    expect(user.id).toBe('alice')
    expect(rows.find((r) => r.id === 'alice')!.username).toBe('foo')
    expect(rows.find((r) => r.id === 'bob')!.username).toBe(releasedUsername({ id: 'bob', username: 'foo' }))
  })

  /**
   * IDを持たない行（列を足す前に入った人）も、名前だけでは引き継がない。
   * 名前が同じでも本人とは限らず、手放された名前を取った別人かもしれない。
   */
  it('IDを持たない行は、名前が同じでも引き継がずに空ける', async () => {
    seed({ id: 'legacy', username: 'foo', bio: '前から居る' })

    const user = await login('111', 'foo')

    expect(user.id).not.toBe('legacy')
    expect(rows.find((r) => r.id === user.id)).toMatchObject({ username: 'foo', platformUserId: '111' })
    expect(rows.find((r) => r.id === 'legacy')).toMatchObject({
      username: releasedUsername({ id: 'legacy', username: 'foo' }),
      platformUserId: null,
      bio: '前から居る',
    })
  })

  /**
   * IDで本人の行が見つかっているのに、同じ名前のIDを持たない行もある。
   * その行は「前の持ち主が列を足す前に使っていた名前」なので引き継がない。
   */
  it('IDで本人が見つかれば、同じ名前のIDを持たない行は引き継がずに空ける', async () => {
    seed({ id: 'alice', username: 'bar', platformUserId: '111' })
    seed({ id: 'legacy', username: 'foo' })

    const user = await login('111', 'foo')

    expect(user.id).toBe('alice')
    expect(rows.find((r) => r.id === 'legacy')!.username).toBe(
      releasedUsername({ id: 'legacy', username: 'foo' })
    )
  })

  it('初めての人は新しい行になる', async () => {
    const user = await login('111', 'foo')

    expect(rows).toEqual([expect.objectContaining({ id: user.id, username: 'foo', platformUserId: '111' })])
  })

  it('プラットフォームが違えば、同じIDでも別人として扱う', async () => {
    seed({ id: 'd', username: 'foo', server: 'discord.com', platform: 'discord', platformUserId: '111' })

    const user = await login('111', 'foo')

    expect(user.id).not.toBe('d')
  })
})

describe('isBannedHostedLogin', () => {
  const banned = (platformUserId: string, username: string) =>
    isBannedHostedLogin({ server: 'x.com', platformUserId, username })

  it('停止された本人は、名前を変えて入り直しても断る', async () => {
    seed({ id: 'alice', username: 'foo', platformUserId: '111' })
    bans.push({ username: 'foo', server: 'x.com', userId: 'alice' })

    expect(await banned('111', 'bar')).toBe(true)
  })

  /** 名前で判定すると、手放された名前を取っただけの別人まで締め出す */
  it('停止された人が手放した名前を取った別人は、断らない', async () => {
    seed({ id: 'alice', username: 'foo', platformUserId: '111' })
    bans.push({ username: 'foo', server: 'x.com', userId: 'alice' })

    expect(await banned('222', 'foo')).toBe(false)
  })

  it('別人として入ったことのある人も、停止された人の名前を取っていれば別人として通す', async () => {
    seed({ id: 'alice', username: 'foo-alice', platformUserId: '111' })
    seed({ id: 'bob', username: 'bob', platformUserId: '222' })
    bans.push({ username: 'foo', server: 'x.com', userId: 'alice' })

    expect(await banned('222', 'foo')).toBe(false)
  })

  it('停止された行が消えている（削除方式の頃の記録）なら、名前で断る', async () => {
    bans.push({ username: 'foo', server: 'x.com', userId: null })

    expect(await banned('333', 'foo')).toBe(true)
  })

  it('停止された行がIDを持たなければ、本人かもしれないので名前で断る', async () => {
    seed({ id: 'old', username: 'foo', platformUserId: null })
    bans.push({ username: 'foo', server: 'x.com', userId: 'old' })

    expect(await banned('333', 'foo')).toBe(true)
  })

  it('停止されていない人は通す', async () => {
    seed({ id: 'alice', username: 'foo', platformUserId: '111' })

    expect(await banned('111', 'foo')).toBe(false)
    expect(await banned('444', 'new')).toBe(false)
  })
})

describe('isPlatformUserId', () => {
  it('数字の文字列だけを受け付ける', () => {
    expect(isPlatformUserId('1234567890123456789')).toBe(true)
    for (const bad of ['', 'abc', '12a', undefined, null, 123, '1'.repeat(33)]) {
      expect(isPlatformUserId(bad), String(bad)).toBe(false)
    }
  })
})

describe('releasedUsername', () => {
  /** `-` は X にも Discord にも使えないので、本物のハンドルと衝突しない */
  it('X・Discord のハンドルに使えない文字を含み、ユーザーページのハンドルとしては通る', async () => {
    const { USERNAME_PATTERN } = await import('@/lib/user-handle')
    const name = releasedUsername({ id: 'cmabc123', username: 'foo' })

    expect(name).toContain('-')
    expect(name).toMatch(USERNAME_PATTERN)
  })
})
