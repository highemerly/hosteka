import { describe, expect, it } from 'vitest'

import { defaultPostMethod, postMethodOptions, type ContactViewer } from './post-method'

const viewer = (over: Partial<ContactViewer> = {}): ContactViewer => ({
  platform: 'mastodon',
  server: 'mastodon.social',
  mayPostDirectly: true,
  canPostDirectly: true,
  ...over,
})

const methods = (v: ContactViewer) => postMethodOptions(v).map((o) => o.method)

describe('postMethodOptions', () => {
  it('直接投稿と、投稿画面へ移動するの2つだけ', () => {
    expect(methods(viewer())).toEqual(['direct', 'external'])
  })

  it('APIが通さない相手には直接投稿を出さない（日程調整の回答者など）', () => {
    expect(methods(viewer({ mayPostDirectly: false, canPostDirectly: false }))).toEqual([
      'external',
    ])
  })

  it('権限が無くても直接投稿は出す。入り直せばできるので道を残す', () => {
    const options = postMethodOptions(viewer({ canPostDirectly: false }))
    expect(options.find((o) => o.method === 'direct')?.needsPermission).toBe(true)
  })

  it('XやDiscordの人は直接投稿できない。投稿画面へ移動する道だけ出す', () => {
    expect(
      methods(viewer({ platform: 'twitter', server: 'x.com', canPostDirectly: false }))
    ).toEqual(['external'])
    expect(
      methods(viewer({ platform: 'discord', server: 'discord.com', canPostDirectly: false }))
    ).toEqual(['external'])
  })
})

describe('defaultPostMethod', () => {
  it('直接投稿できるならそれ。いちばん手数が少ない', () => {
    expect(defaultPostMethod(viewer())).toBe('direct')
  })

  it('権限が足りない直接投稿は既定にしない。開いた瞬間に権限の話になる', () => {
    expect(defaultPostMethod(viewer({ canPostDirectly: false }))).toBe('external')
  })

  it('直接投稿できない人は投稿画面へ移動が既定', () => {
    expect(
      defaultPostMethod(viewer({ platform: 'twitter', server: 'x.com', canPostDirectly: false }))
    ).toBe('external')
  })
})
