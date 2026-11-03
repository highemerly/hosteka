/**
 * participation-utils.ts のユニットテスト
 *
 * 参加登録に関するユーティリティ関数のテスト
 */
import { describe, it, expect } from 'vitest'
import { isUserAllowed } from '@/lib/participation-utils'

describe('participation-utils.ts', () => {
  // ===================================
  // isUserAllowed
  // ===================================
  describe('isUserAllowed', () => {
    describe('Fediverseプラットフォーム許可チェック', () => {
      it('Fediverseユーザーで許可されていればtrue', () => {
        expect(isUserAllowed('mastodon', 'example.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
        })).toBe(true)

        expect(isUserAllowed('misskey', 'example.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
        })).toBe(true)

        expect(isUserAllowed('pleroma', 'example.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
        })).toBe(true)
      })

      it('Fediverseユーザーで許可されていなければfalse', () => {
        expect(isUserAllowed('mastodon', 'example.com', {
          isAllowedForFediverse: false,
          isAllowedForDiscord: true,
        })).toBe(false)
      })
    })

    describe('Discordプラットフォーム許可チェック', () => {
      it('Discordユーザーで許可されていればtrue', () => {
        expect(isUserAllowed('discord', undefined, {
          isAllowedForFediverse: false,
          isAllowedForDiscord: true,
        })).toBe(true)
      })

      it('Discordユーザーで許可されていなければfalse', () => {
        expect(isUserAllowed('discord', undefined, {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
        })).toBe(false)
      })
    })

    describe('Twitterプラットフォーム許可チェック', () => {
      it('Twitterユーザーで許可されていればtrue', () => {
        expect(isUserAllowed('twitter', undefined, {
          isAllowedForFediverse: false,
          isAllowedForDiscord: false,
          isAllowedForTwitter: true,
        })).toBe(true)
      })

      it('Twitterユーザーで許可されていなければfalse', () => {
        expect(isUserAllowed('twitter', undefined, {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          isAllowedForTwitter: false,
        })).toBe(false)
      })

      it('Twitterユーザーで isAllowedForTwitter がundefinedの場合はfalse', () => {
        expect(isUserAllowed('twitter', undefined, {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          // isAllowedForTwitter は未指定
        })).toBe(false)
      })
    })

    describe('未知/未定義プラットフォーム', () => {
      it('未知のプラットフォームはfalse', () => {
        expect(isUserAllowed('unknown', 'example.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          isAllowedForTwitter: true,
        })).toBe(false)
      })

      it('プラットフォームがundefinedはfalse', () => {
        expect(isUserAllowed(undefined, 'example.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          isAllowedForTwitter: true,
        })).toBe(false)
      })
    })

    describe('複数プラットフォームの組み合わせ', () => {
      it('全プラットフォーム許可時: 全ユーザーが参加可能', () => {
        const settings = {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          isAllowedForTwitter: true,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('misskey', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('pleroma', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('discord', undefined, settings)).toBe(true)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(true)
      })

      it('Fediverseのみ許可: Fediverseユーザーのみ参加可能', () => {
        const settings = {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          isAllowedForTwitter: false,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('misskey', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('discord', undefined, settings)).toBe(false)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(false)
      })

      it('Discordのみ許可: Discordユーザーのみ参加可能', () => {
        const settings = {
          isAllowedForFediverse: false,
          isAllowedForDiscord: true,
          isAllowedForTwitter: false,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(false)
        expect(isUserAllowed('discord', undefined, settings)).toBe(true)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(false)
      })

      it('Twitterのみ許可: Twitterユーザーのみ参加可能', () => {
        const settings = {
          isAllowedForFediverse: false,
          isAllowedForDiscord: false,
          isAllowedForTwitter: true,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(false)
        expect(isUserAllowed('discord', undefined, settings)).toBe(false)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(true)
      })

      it('全プラットフォーム不許可: 誰も参加不可', () => {
        const settings = {
          isAllowedForFediverse: false,
          isAllowedForDiscord: false,
          isAllowedForTwitter: false,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(false)
        expect(isUserAllowed('discord', undefined, settings)).toBe(false)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(false)
      })

      it('Fediverse + Discord許可: Twitterのみ不可', () => {
        const settings = {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          isAllowedForTwitter: false,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('discord', undefined, settings)).toBe(true)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(false)
      })

      it('Fediverse + Twitter許可: Discordのみ不可', () => {
        const settings = {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          isAllowedForTwitter: true,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(true)
        expect(isUserAllowed('discord', undefined, settings)).toBe(false)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(true)
      })

      it('Discord + Twitter許可: Fediverseのみ不可', () => {
        const settings = {
          isAllowedForFediverse: false,
          isAllowedForDiscord: true,
          isAllowedForTwitter: true,
        }

        expect(isUserAllowed('mastodon', 'example.com', settings)).toBe(false)
        expect(isUserAllowed('discord', undefined, settings)).toBe(true)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(true)
      })
    })

    describe('Fediverseサーバー制限チェック', () => {
      it('サーバー制限がない場合は許可', () => {
        expect(isUserAllowed('mastodon', 'any-server.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: null,
        })).toBe(true)
      })

      it('サーバー制限があり、許可リストに含まれていればtrue', () => {
        expect(isUserAllowed('mastodon', 'allowed.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: JSON.stringify(['allowed.com', 'also-allowed.com']),
        })).toBe(true)
      })

      it('サーバー制限があり、許可リストに含まれていなければfalse', () => {
        expect(isUserAllowed('mastodon', 'not-allowed.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: JSON.stringify(['allowed.com']),
        })).toBe(false)
      })

      it('空の許可リストは制限なし', () => {
        expect(isUserAllowed('mastodon', 'any-server.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: JSON.stringify([]),
        })).toBe(true)
      })

      it('無効なJSONは制限なしとして扱う', () => {
        expect(isUserAllowed('mastodon', 'any-server.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: 'invalid-json',
        })).toBe(true)
      })

      /*
        **サーバーが分からないなら通さない。** true に倒すと、制限を
        掛けたのに素通りし、API 側（`!userServer` を弾く）と答えが
        食い違う。規則を画面とサーバーに書き分けないこと。
      */
      it('ユーザーのサーバーが分からないなら、制限ありでは参加できない', () => {
        expect(isUserAllowed('mastodon', undefined, {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: JSON.stringify(['allowed.com']),
        })).toBe(false)
      })

      it('制限が無ければ、サーバーが分からなくても参加できる', () => {
        expect(isUserAllowed('mastodon', undefined, {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: JSON.stringify([]),
        })).toBe(true)
      })
    })

    describe('新形式allowedFediverseServers（オブジェクト配列）', () => {
      it('新形式で許可リストに含まれていればtrue', () => {
        const allowedServers = JSON.stringify([
          { server: 'allowed.com', type: 'mastodon' },
          { server: 'also-allowed.com', type: 'misskey' },
        ])

        expect(isUserAllowed('mastodon', 'allowed.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: allowedServers,
        })).toBe(true)

        expect(isUserAllowed('misskey', 'also-allowed.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: allowedServers,
        })).toBe(true)
      })

      it('新形式で許可リストに含まれていなければfalse', () => {
        const allowedServers = JSON.stringify([
          { server: 'allowed.com', type: 'mastodon' },
        ])

        expect(isUserAllowed('mastodon', 'not-allowed.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: allowedServers,
        })).toBe(false)
      })

      it('新形式の空配列は制限なし', () => {
        const allowedServers = JSON.stringify([])

        expect(isUserAllowed('mastodon', 'any-server.com', {
          isAllowedForFediverse: true,
          isAllowedForDiscord: false,
          allowedFediverseServers: allowedServers,
        })).toBe(true)
      })
    })

    describe('サーバー制限と他プラットフォームの組み合わせ', () => {
      it('Fediverseユーザーのみサーバー制限が適用される', () => {
        const settings = {
          isAllowedForFediverse: true,
          isAllowedForDiscord: true,
          isAllowedForTwitter: true,
          allowedFediverseServers: JSON.stringify(['allowed.com']),
        }

        // Fediverseユーザーはサーバー制限が適用される
        expect(isUserAllowed('mastodon', 'allowed.com', settings)).toBe(true)
        expect(isUserAllowed('mastodon', 'not-allowed.com', settings)).toBe(false)
        expect(isUserAllowed('misskey', 'allowed.com', settings)).toBe(true)
        expect(isUserAllowed('misskey', 'not-allowed.com', settings)).toBe(false)

        // Discord/Twitterユーザーはサーバー制限の影響を受けない
        expect(isUserAllowed('discord', undefined, settings)).toBe(true)
        expect(isUserAllowed('twitter', undefined, settings)).toBe(true)
      })

      it('Fediverseが不許可の場合、サーバー制限は無関係', () => {
        const settings = {
          isAllowedForFediverse: false,
          isAllowedForDiscord: true,
          isAllowedForTwitter: true,
          allowedFediverseServers: JSON.stringify(['allowed.com']),
        }

        // Fediverseは不許可なのでサーバー制限に関係なくfalse
        expect(isUserAllowed('mastodon', 'allowed.com', settings)).toBe(false)
        expect(isUserAllowed('mastodon', 'not-allowed.com', settings)).toBe(false)
      })
    })
  })
})
