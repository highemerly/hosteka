/**
 * org-id.ts のユニットテスト
 *
 * 組織スラッグの生成・検証ロジックのテスト
 */
import { describe, it, expect } from 'vitest'
import { generateOrgSlug, validateOrgSlug } from '@/lib/org-id'

describe('org-id.ts', () => {
  // ===================================
  // generateOrgSlug
  // ===================================
  describe('generateOrgSlug', () => {
    it('デフォルトで10文字のスラッグを生成', () => {
      const slug = generateOrgSlug()
      expect(slug).toHaveLength(10)
    })

    it('指定した長さのスラッグを生成', () => {
      expect(generateOrgSlug(5)).toHaveLength(5)
      expect(generateOrgSlug(20)).toHaveLength(20)
      expect(generateOrgSlug(50)).toHaveLength(50)
    })

    it('英小文字と数字のみで構成される', () => {
      const slug = generateOrgSlug(100)
      expect(slug).toMatch(/^[a-z0-9]+$/)
    })

    it('毎回異なるスラッグを生成する', () => {
      const slugs = new Set<string>()
      for (let i = 0; i < 100; i++) {
        slugs.add(generateOrgSlug())
      }
      // 100回生成して全て異なることを確認（衝突確率は極めて低い）
      expect(slugs.size).toBe(100)
    })

    it('生成されたスラッグはvalidateOrgSlugを通過する', () => {
      for (let i = 0; i < 10; i++) {
        const slug = generateOrgSlug()
        expect(validateOrgSlug(slug)).toBe(true)
      }
    })
  })

  // ===================================
  // validateOrgSlug
  // ===================================
  describe('validateOrgSlug', () => {
    describe('有効なスラッグ', () => {
      it('英小文字のみ（4文字以上）', () => {
        expect(validateOrgSlug('abcd')).toBe(true)
        expect(validateOrgSlug('organization')).toBe(true)
      })

      it('英大文字のみ', () => {
        expect(validateOrgSlug('ABCD')).toBe(true)
        expect(validateOrgSlug('ORGANIZATION')).toBe(true)
      })

      it('数字のみ', () => {
        expect(validateOrgSlug('1234')).toBe(true)
        expect(validateOrgSlug('123456789012')).toBe(true)
      })

      it('英数字の組み合わせ', () => {
        expect(validateOrgSlug('org123')).toBe(true)
        expect(validateOrgSlug('123org')).toBe(true)
        expect(validateOrgSlug('Org123Test')).toBe(true)
      })

      it('ハイフンを含む', () => {
        expect(validateOrgSlug('my-org')).toBe(true)
        expect(validateOrgSlug('my-test-org')).toBe(true)
        expect(validateOrgSlug('org-123')).toBe(true)
      })

      it('アンダースコアを含む', () => {
        expect(validateOrgSlug('my_org')).toBe(true)
        expect(validateOrgSlug('my_test_org')).toBe(true)
        expect(validateOrgSlug('org_123')).toBe(true)
      })

      it('ハイフンとアンダースコアの組み合わせ', () => {
        expect(validateOrgSlug('my-test_org')).toBe(true)
        expect(validateOrgSlug('org_123-test')).toBe(true)
      })

      it('ちょうど4文字（最小）', () => {
        expect(validateOrgSlug('abcd')).toBe(true)
        expect(validateOrgSlug('a-b_')).toBe(true)
      })

      it('ちょうど50文字（最大）', () => {
        const slug50 = 'a'.repeat(50)
        expect(validateOrgSlug(slug50)).toBe(true)
      })
    })

    describe('無効なスラッグ', () => {
      it('3文字以下は無効', () => {
        expect(validateOrgSlug('abc')).toBe(false)
        expect(validateOrgSlug('ab')).toBe(false)
        expect(validateOrgSlug('a')).toBe(false)
        expect(validateOrgSlug('')).toBe(false)
      })

      it('51文字以上は無効', () => {
        const slug51 = 'a'.repeat(51)
        expect(validateOrgSlug(slug51)).toBe(false)
      })

      it('日本語を含むと無効', () => {
        expect(validateOrgSlug('テストグループ')).toBe(false)
        expect(validateOrgSlug('org-テスト')).toBe(false)
        expect(validateOrgSlug('グループabc')).toBe(false)
      })

      it('スペースを含むと無効', () => {
        expect(validateOrgSlug('my org')).toBe(false)
        expect(validateOrgSlug(' org')).toBe(false)
        expect(validateOrgSlug('org ')).toBe(false)
      })

      it('特殊文字を含むと無効', () => {
        expect(validateOrgSlug('org@test')).toBe(false)
        expect(validateOrgSlug('org#123')).toBe(false)
        expect(validateOrgSlug('org!test')).toBe(false)
        expect(validateOrgSlug('org.test')).toBe(false)
        expect(validateOrgSlug('org/test')).toBe(false)
      })

      it('絵文字を含むと無効', () => {
        expect(validateOrgSlug('org🎉test')).toBe(false)
      })
    })
  })
})
