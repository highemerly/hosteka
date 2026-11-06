import { describe, expect, it } from 'vitest'

import generated from './release-notes-generated.json'
import { LEGACY_RELEASE_NOTES } from './release-notes-legacy'

describe('手で書いたリリースノート', () => {
  it('新しい版から並んでいる（スクリプトはこの先頭より新しいタグだけを作る）', () => {
    const versions = LEGACY_RELEASE_NOTES.map((n) => n.version.split('.').map(Number))
    for (let i = 1; i < versions.length; i++) {
      const [a, b] = [versions[i - 1], versions[i]]
      const order = a[0] - b[0] || a[1] - b[1] || (a[2] ?? 0) - (b[2] ?? 0)
      expect(order, `${LEGACY_RELEASE_NOTES[i - 1].version} → ${LEGACY_RELEASE_NOTES[i].version}`).toBeGreaterThan(0)
    }
  })

  it('X.Y.Z の版は時刻をオフセット付きで持つ', () => {
    for (const note of LEGACY_RELEASE_NOTES.filter((n) => /^\d+\.\d+\.\d+$/.test(n.version))) {
      expect(note.releasedAt, note.version).toMatch(/[+-]\d{2}:\d{2}$/)
    }
  })

  it('リポジトリの生成物は空の配列（中身はタグのビルドが作る）', () => {
    expect(generated).toEqual([])
  })
})
