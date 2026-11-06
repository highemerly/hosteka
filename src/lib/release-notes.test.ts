import { describe, expect, it } from 'vitest'

import {
  assembleChanges,
  compareVersions,
  MINOR_CHANGES,
  parseReleaseNoteBlock,
  parseVersion,
  prType,
  type PullRequest,
} from './release-notes'

const block = (...lines: string[]) => ['## Summary', '', '```release-note', ...lines, '```', ''].join('\n')

const pr = (number: number, title: string, body: string | null = null): PullRequest => ({ number, title, body })

describe('parseReleaseNoteBlock', () => {
  it('ブロックの行を種別と文に分ける', () => {
    expect(parseReleaseNoteBlock(block('add: 機能を追加', 'fix:  問題を修正 '))).toEqual({
      found: true,
      changes: [
        { type: 'add', text: '機能を追加' },
        { type: 'fix', text: '問題を修正' },
      ],
      invalid: [],
    })
  })

  it('空のブロックは「載せるものはない」としてブロックありに数える', () => {
    expect(parseReleaseNoteBlock(block())).toEqual({ found: true, changes: [], invalid: [] })
  })

  it('ブロックが無ければ found は false', () => {
    expect(parseReleaseNoteBlock('## Summary\n\nfix: 本文の中の行は拾わない').found).toBe(false)
    expect(parseReleaseNoteBlock(null).found).toBe(false)
  })

  it('HTML コメントの中のブロック（テンプレートの見本）は拾わない', () => {
    expect(parseReleaseNoteBlock(`<!--\n${block('fix: 見本')}-->`).found).toBe(false)
  })

  it('読めない行は invalid に分け、ほかの行は拾う', () => {
    const parsed = parseReleaseNoteBlock(block('feat: 種別が違う', 'change: 変更'))
    expect(parsed.changes).toEqual([{ type: 'change', text: '変更' }])
    expect(parsed.invalid).toEqual(['feat: 種別が違う'])
  })

  it('CRLF の本文と、複数のブロックを読む', () => {
    const body = block('add: 1つ目').replace(/\n/g, '\r\n') + block('remove: 2つ目')
    expect(parseReleaseNoteBlock(body).changes).toEqual([
      { type: 'add', text: '1つ目' },
      { type: 'remove', text: '2つ目' },
    ])
  })
})

describe('prType', () => {
  it('Conventional Commits の種別を取る', () => {
    expect(prType('fix(api): something')).toBe('fix')
    expect(prType('ci: something')).toBe('ci')
    expect(prType('feat!: breaking')).toBe('feat')
    expect(prType('Bump v2.0.3')).toBeNull()
  })
})

describe('assembleChanges', () => {
  it('ブロックの無い PR があれば「その他軽微な修正」を最後に足す', () => {
    const { changes, minor } = assembleChanges([
      pr(1, 'chore: tidy'),
      pr(2, 'feat(og): images', block('add: 画像を表示')),
    ])
    expect(changes).toEqual([{ type: 'add', text: '画像を表示' }, MINOR_CHANGES])
    expect(minor.map((p) => p.number)).toEqual([1])
  })

  it('ci・docs・test はブロックが無くても数えない', () => {
    const { changes, minor } = assembleChanges([pr(1, 'ci: x'), pr(2, 'docs: x'), pr(3, 'test(e2e): x')])
    expect(changes).toEqual([])
    expect(minor).toEqual([])
  })

  it('種別の無い題名や PR の無いコミットは数える', () => {
    const { minor } = assembleChanges([pr(1, 'Bump v2.0.3'), { number: null, title: 'direct commit', body: null }])
    expect(minor).toHaveLength(2)
  })

  it('空のブロックがある PR は数えない', () => {
    expect(assembleChanges([pr(1, 'chore: x', block())]).changes).toEqual([])
  })

  it('同じ文は1行にまとめ、追加・変更・削除・修正の順に並べる', () => {
    const { changes } = assembleChanges([
      pr(1, 'fix: a', block('fix: セキュリティ改善')),
      pr(2, 'fix: b', block('fix: セキュリティ改善', 'remove: 機能を廃止')),
      pr(3, 'feat: c', block('change: 変更', 'add: 追加')),
      pr(4, 'fix: d', block(`fix: ${MINOR_CHANGES.text}`)),
      pr(5, 'chore: e'),
    ])
    expect(changes).toEqual([
      { type: 'add', text: '追加' },
      { type: 'change', text: '変更' },
      { type: 'remove', text: '機能を廃止' },
      { type: 'fix', text: 'セキュリティ改善' },
      MINOR_CHANGES,
    ])
  })

  it('読めない行を PR とともに返す', () => {
    const p = pr(7, 'fix: x', block('oops'))
    expect(assembleChanges([p]).invalid).toEqual([{ pr: p, line: 'oops' }])
  })
})

describe('parseVersion / compareVersions', () => {
  it('X.Y.Z だけを読み、数として比べる', () => {
    expect(parseVersion('v2.0.10')).toEqual([2, 0, 10])
    expect(parseVersion('2.0')).toBeNull()
    expect(parseVersion('v2.0.0-rc.1')).toBeNull()
    expect(compareVersions([2, 0, 10], [2, 0, 9])).toBeGreaterThan(0)
    expect(compareVersions([1, 9, 0], [2, 0, 0])).toBeLessThan(0)
  })
})
