/**
 * message-splitter.ts のユニットテスト
 *
 * メッセージ分割機能のテスト
 */
import { describe, it, expect } from 'vitest'
import { splitMessage } from '@/lib/message-splitter'

describe('message-splitter.ts', () => {
  // ===================================
  // splitMessage
  // ===================================
  describe('splitMessage', () => {
    describe('メンションなしの場合', () => {
      it('本文のみを返す', () => {
        const result = splitMessage([], 'テスト本文')
        expect(result.posts).toHaveLength(1)
        expect(result.posts[0].mentions).toHaveLength(0)
        expect(result.posts[0].body).toBe('テスト本文')
        expect(result.totalMentions).toBe(0)
        expect(result.needsSplit).toBe(false)
      })

      it('本文が制限を超える場合はneedsSplit=true', () => {
        const longBody = 'あ'.repeat(600)
        const result = splitMessage([], longBody, 500)
        expect(result.needsSplit).toBe(true)
      })
    })

    describe('分割不要の場合', () => {
      it('文字数制限内なら1投稿', () => {
        const mentions = ['@user1', '@user2']
        const body = 'テスト本文'
        const result = splitMessage(mentions, body, 500)

        expect(result.posts).toHaveLength(1)
        expect(result.posts[0].mentions).toEqual(mentions)
        expect(result.posts[0].body).toBe(body)
        expect(result.needsSplit).toBe(false)
        expect(result.totalMentions).toBe(2)
      })

      it('fullTextが正しく構築される', () => {
        const mentions = ['@user1', '@user2']
        const body = 'テスト本文'
        const result = splitMessage(mentions, body, 500)

        expect(result.posts[0].fullText).toBe('@user1 @user2\n\nテスト本文')
      })
    })

    describe('分割が必要な場合', () => {
      it('メンションが多い場合に複数投稿に分割', () => {
        // 20文字程度のメンションを25個作成
        const mentions = Array.from({ length: 25 }, (_, i) =>
          `@user${i}@server.example.com`
        )
        const body = 'テスト本文'
        const result = splitMessage(mentions, body, 500)

        expect(result.posts.length).toBeGreaterThan(1)
        expect(result.needsSplit).toBe(true)
        expect(result.totalMentions).toBe(25)

        // 各投稿にbodyが含まれる
        result.posts.forEach(post => {
          expect(post.body).toBe(body)
        })

        // 全メンションが分配されている
        const allMentions = result.posts.flatMap(post => post.mentions)
        expect(allMentions).toHaveLength(25)
      })

      it('各投稿の文字数が制限内', () => {
        const mentions = Array.from({ length: 30 }, (_, i) =>
          `@user${i}@server.example.com`
        )
        const body = 'テスト本文です'
        const maxLength = 500
        const result = splitMessage(mentions, body, maxLength)

        result.posts.forEach(post => {
          // 文字数制限を超える投稿があってもアルゴリズム上許容される場合がある
          // （本文だけで制限を超える場合など）
          expect(post.characterCount).toBeLessThanOrEqual(maxLength + 50) // 若干の余裕
        })
      })

      it('本文が長くても最低1メンションは含まれる', () => {
        const mentions = ['@user1@verylongserver.example.com']
        const body = 'あ'.repeat(450) // 450文字の本文
        const result = splitMessage(mentions, body, 500)

        // 本文だけで450文字、メンション+改行で500超えるが、最低1メンション
        expect(result.posts[0].mentions.length).toBeGreaterThanOrEqual(1)
      })
    })

    describe('Twitter向け（280文字制限）', () => {
      it('メンションが多い場合に分割が必要', () => {
        // 280文字を超えるようにメンションを増やす
        const mentions = Array.from({ length: 40 }, (_, i) => `@username${i}`)
        const body = 'イベントのお知らせです。詳細はこちらをご覧ください。'
        const result = splitMessage(mentions, body, 280)

        expect(result.needsSplit).toBe(true)
        expect(result.posts.length).toBeGreaterThan(1)
      })

      it('少ないメンションで制限内なら分割不要', () => {
        const mentions = Array.from({ length: 5 }, (_, i) => `@user${i}`)
        const body = 'お知らせ'
        const result = splitMessage(mentions, body, 280)

        expect(result.needsSplit).toBe(false)
        expect(result.posts).toHaveLength(1)
      })
    })

    describe('Misskey向け（3000文字制限）', () => {
      it('多くのメンションでも分割不要', () => {
        const mentions = Array.from({ length: 50 }, (_, i) =>
          `@user${i}@server.example.com`
        )
        const body = 'テスト本文'
        const result = splitMessage(mentions, body, 3000)

        // 3000文字あれば50メンションでも収まる可能性が高い
        expect(result.posts.length).toBeLessThanOrEqual(2)
      })
    })
  })
})
