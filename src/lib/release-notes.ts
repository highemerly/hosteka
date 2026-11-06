/*
  リリースノート（/release-notes）の形と、PR から版ごとの変更を組み立てる規則。

  2.0.5 までは `src/screens/content/release-notes-legacy.ts` に手で書いてある。
  それより後は、タグのビルド（docker-build.yml）が `scripts/release-notes.ts` で
  PR 本文の `release-note` ブロックから作り、イメージに焼き込む。

  **ここから何も import しない。** スクリプトは素の node（型を消すだけ）で動くので、
  `@/` も拡張子なしの相対 import も解決できない。
*/

export type ChangeType = 'add' | 'fix' | 'remove' | 'change'

export type Change = {
  type: ChangeType
  text: string
}

export type ReleaseNote = {
  version: string
  /** 時刻を持たない版（2.0 まで）の日付。「2026/9/29」 */
  date?: string
  /** リリースした時刻（ISO 8601）。2.0.1 から */
  releasedAt?: string
  /** GitHub Release。作られていない版もある */
  url?: string
  changes: Change[]
}

/** 版の中の並び。手で書いていた頃と同じ */
export const CHANGE_TYPES: readonly ChangeType[] = ['add', 'change', 'remove', 'fix']

/**
 * ブロックの無い PR をまとめる1行。
 * 書き忘れた PR もここに入る（何も出ないよりは、何か変わったことが伝わる）
 */
export const MINOR_CHANGES: Change = { type: 'fix', text: 'その他軽微な修正' }

/** 動いているサービスを変えない種別。ブロックが無くても「その他軽微な修正」に数えない */
const NO_SERVICE_CHANGE = new Set(['ci', 'docs', 'test'])

const BLOCK = /^```release-note[ \t]*\r?\n([\s\S]*?)^```/gm
const LINE = /^(add|fix|change|remove):\s*(.+)$/

export type ParsedBlock = {
  /** ブロックがあったか。空のブロックは「載せるものはない」の明示 */
  found: boolean
  changes: Change[]
  /** 読めなかった行 */
  invalid: string[]
}

export function parseReleaseNoteBlock(body: string | null | undefined): ParsedBlock {
  const result: ParsedBlock = { found: false, changes: [], invalid: [] }
  // PR テンプレートの書き方の見本（HTML コメントの中）は拾わない
  const visible = (body ?? '').replace(/<!--[\s\S]*?-->/g, '')
  for (const match of visible.matchAll(BLOCK)) {
    result.found = true
    for (const raw of match[1].split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      const m = LINE.exec(line)
      if (m) result.changes.push({ type: m[1] as ChangeType, text: m[2].trim() })
      else result.invalid.push(line)
    }
  }
  return result
}

/** Conventional Commits の種別（`fix(api): …` → `fix`）。無ければ null */
export function prType(title: string): string | null {
  const m = /^(\w+)(\([^)]*\))?!?:/.exec(title)
  return m ? m[1].toLowerCase() : null
}

export type PullRequest = {
  /** squash でないコミットなど、PR の無いものは null */
  number: number | null
  title: string
  body: string | null
}

export type AssembledChanges = {
  changes: Change[]
  /** 「その他軽微な修正」に数えた PR */
  minor: PullRequest[]
  invalid: { pr: PullRequest; line: string }[]
}

/**
 * 1つの版に入った PR（古い順）から、載せる変更を組み立てる。
 * 同じ文は1行にまとめ（セキュリティの修正が何件あっても「セキュリティ改善」は1行）、
 * 種別の順に並べ、ブロックの無い PR があれば最後に「その他軽微な修正」を足す。
 */
export function assembleChanges(prs: PullRequest[]): AssembledChanges {
  const written: Change[] = []
  const minor: PullRequest[] = []
  const invalid: AssembledChanges['invalid'] = []

  for (const pr of prs) {
    const block = parseReleaseNoteBlock(pr.body)
    for (const line of block.invalid) invalid.push({ pr, line })
    if (block.found) written.push(...block.changes)
    else if (!NO_SERVICE_CHANGE.has(prType(pr.title) ?? '')) minor.push(pr)
  }
  if (minor.length > 0) written.push(MINOR_CHANGES)

  const seen = new Set<string>()
  const unique = written.filter((c) => {
    const key = `${c.type}\n${c.text}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  // 「その他軽微な修正」は種別に関わらず最後
  const isMinor = (c: Change) => c.type === MINOR_CHANGES.type && c.text === MINOR_CHANGES.text
  const changes = [
    ...CHANGE_TYPES.flatMap((t) => unique.filter((c) => c.type === t && !isMinor(c))),
    ...unique.filter(isMinor),
  ]
  return { changes, minor, invalid }
}

/** `v2.0.5` / `2.0.5` を [2, 0, 5] に。形が違えば null */
export function parseVersion(tag: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}
