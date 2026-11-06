/*
  リリースノートのうち、手で書いた版（src/screens/content/release-notes-legacy.ts）より
  後のものを作る。タグのビルド（docker-build.yml）が docker build の前に呼び、
  画面が読む JSON（release-notes-generated.json）を上書きする＝イメージに焼き込む。

  - 版ごとの PR は、前の版のタグとのあいだのコミットの題名の `(#N)`（squash マージ）から取る
  - 載せる文は PR 本文の release-note ブロック。組み立ての規則は src/lib/release-notes.ts
  - 時刻はタグを打った時刻（Tag a release が打つ注釈付きのタグ。軽量タグならコミットの時刻）
  - **毎回全部を作り直す。** PR 本文を直せば、次のリリースで直る

  素の node（型を消すだけ）で動く。npm ci は要らない:
    node scripts/release-notes.ts <版（2.0.6）> <出力先>
  GITHUB_TOKEN（か GH_TOKEN）と GITHUB_REPOSITORY（owner/name）が要る。
*/
import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'

import {
  assembleChanges,
  compareVersions,
  parseVersion,
  type PullRequest,
  type ReleaseNote,
} from '../src/lib/release-notes.ts'
import { LEGACY_RELEASE_NOTES } from '../src/screens/content/release-notes-legacy.ts'

type Version = [number, number, number]
type Tag = { name: string; date: string; version: Version }

const [versionArg, out] = process.argv.slice(2)
const current = parseVersion(versionArg ?? '')
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const repository = process.env.GITHUB_REPOSITORY
if (!current || !out || !token || !repository) {
  console.error('usage: GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-notes.ts <X.Y.Z> <out.json>')
  process.exit(1)
}
const [owner, name] = repository.split('/')

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' })

async function graphql(query: string): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown }
  if (!res.ok || json.errors || !json.data) {
    throw new Error(`GitHub GraphQL failed (${res.status}): ${JSON.stringify(json.errors ?? json)}`)
  }
  return json.data
}

/** 手で書いた版のうち最新。これより新しいタグだけを作る */
const lastLegacy = LEGACY_RELEASE_NOTES.map((n) => parseVersion(n.version))
  .filter((v): v is Version => v !== null)
  .sort(compareVersions)
  .at(-1)
if (!lastLegacy) throw new Error('no X.Y.Z version in release-notes-legacy.ts')

const tags: Tag[] = git('for-each-ref', '--format=%(refname:short)\t%(creatordate:iso-strict)', 'refs/tags')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [tagName, date] = line.split('\t')
    return { name: tagName, date, version: tagName.startsWith('v') ? parseVersion(tagName) : null }
  })
  .filter((t): t is Tag => t.version !== null)
  .sort((a, b) => compareVersions(a.version, b.version))

if (!tags.some((t) => compareVersions(t.version, current) === 0)) {
  throw new Error(`tag v${current.join('.')} not found (fetch the tags first)`)
}

// 前の版のタグ（＝手で書いた最新の版のタグ以降）があるものだけ。再実行のときは今の版より後を含めない
const targets = tags
  .map((tag, i) => ({ tag, prev: tags[i - 1] }))
  .filter(({ tag, prev }) =>
    prev && compareVersions(tag.version, lastLegacy) > 0 && compareVersions(tag.version, current) <= 0)

const commits = new Map(
  targets.map(({ tag, prev }) => {
    const subjects = git('log', '--format=%s', `${prev.name}..${tag.name}`).split('\n').filter(Boolean).reverse()
    return [tag.name, subjects.map((s) => ({ subject: s, number: Number(/\(#(\d+)\)$/.exec(s)?.[1]) || null }))]
  }),
)

// PR の本文と、Release があるかを GraphQL でまとめて引く。
// `(#N)` が Issue を指していても落ちないよう issueOrPullRequest で引く
const numbers = [...new Set([...commits.values()].flat().flatMap((c) => (c.number ? [c.number] : [])))]
const prs = new Map<number, { title: string; body: string | null }>()
for (let i = 0; i < numbers.length; i += 50) {
  const fields = numbers
    .slice(i, i + 50)
    .map((n) => `pr${n}: issueOrPullRequest(number: ${n}) { ... on PullRequest { title body } }`)
  const data = await graphql(`{ repository(owner: "${owner}", name: "${name}") { ${fields.join(' ')} } }`)
  for (const [key, value] of Object.entries(data.repository as Record<string, { title?: string; body?: string } | null>)) {
    if (value?.title !== undefined) prs.set(Number(key.slice(2)), { title: value.title, body: value.body ?? null })
  }
}
const releases = new Set<string>()
if (targets.length > 0) {
  const fields = targets.map(({ tag }, i) => `r${i}: release(tagName: "${tag.name}") { tagName }`)
  const data = await graphql(`{ repository(owner: "${owner}", name: "${name}") { ${fields.join(' ')} } }`)
  for (const value of Object.values(data.repository as Record<string, { tagName: string } | null>)) {
    if (value) releases.add(value.tagName)
  }
}

const notes: ReleaseNote[] = []
const summary: string[] = ['## Release notes (in-app)', '']
for (const { tag } of [...targets].reverse()) {
  const items: PullRequest[] = commits.get(tag.name)!.map(({ subject, number }) => {
    const pr = number ? prs.get(number) : undefined
    return pr
      ? { number, title: pr.title, body: pr.body }
      : { number: null, title: subject.replace(/\s*\(#\d+\)$/, ''), body: null }
  })
  const { changes, minor, invalid } = assembleChanges(items)
  for (const { pr, line } of invalid) {
    console.log(`::warning::${pr.number ? `#${pr.number}` : pr.title}: unreadable release-note line: ${line}`)
  }

  // 今の版の Release は、全部の検査が通ったあとに作られる（通らなければデプロイもされない）
  const isCurrent = compareVersions(tag.version, current) === 0
  const url = isCurrent || releases.has(tag.name) ? `https://github.com/${repository}/releases/tag/${tag.name}` : undefined

  summary.push(`### ${tag.name}`, '')
  if (changes.length === 0) {
    summary.push('Not shown (no user-facing changes).', '')
    continue
  }
  notes.push({ version: tag.name.slice(1), releasedAt: tag.date, ...(url ? { url } : {}), changes })
  summary.push(...changes.map((c) => `- ${c.type}: ${c.text}`), '')
  if (minor.length > 0) {
    summary.push(`Counted as minor changes (no release-note block): ${minor.map((p) => (p.number ? `#${p.number}` : p.title)).join(', ')}`, '')
  }
}
if (targets.length === 0) summary.push(`Nothing to generate: v${current.join('.')} is covered by release-notes-legacy.ts.`)

writeFileSync(out, `${JSON.stringify(notes, null, 2)}\n`)
const summaryFile = process.env.GITHUB_STEP_SUMMARY
if (summaryFile) appendFileSync(summaryFile, `${summary.join('\n')}\n`)
else console.log(summary.join('\n'))
