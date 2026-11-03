import 'server-only'

import { toJstIso } from '@/lib/jst'

/** 表計算ソフトが式として読む先頭の文字（OWASP の CSV Injection） */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

/**
 * CSVの1セル。
 *
 * **必ずここを通す。** 値をそのまま `"..."` で挟むだけだと、引用符を含む
 * コメント（`"最高"だった` など）で列がずれ、そこから先の行がすべて壊れる。
 * RFC 4180 のとおり、引用符は2つ重ねて逃がす。
 *
 * **式として読まれる文字列は `'` を前に置く。** コメントや表示名、選択肢の
 * 名前は参加者や相手のサーバーが決める。`=HYPERLINK(...)` のような値を、
 * 主催者が Excel で開くと式として動く（`"` で囲んでも効く）。
 * 数値はそのまま出す（負の数に `'` が付くと数として読めなくなる）。
 */
export function cell(value: unknown): string {
  const text = String(value ?? '')
  const safe = typeof value === 'string' && FORMULA_PREFIX.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

/**
 * **CSVの日時はすべて ISO 8601（`toJstIso`）で出す。** 表計算や pandas が
 * そのまま日時として読めて、+09:00 があるので時刻帯も取り違えない。
 * 時刻の無い日付は `2026-09-12`（日付だけではオフセットを持てない）、
 * 期間は ISO 8601 の区間表記 `開始/終了`。
 */
export function isoInterval(start: string, end: string | null): string {
  return end ? `${start}/${end}` : start
}

/**
 * 先頭に置く `#` 行（イベント・日程調整の情報）。最後に出力日時と空行が付く。
 *
 * CSV に注釈の規格は無いが、`#` で始まる行を読み飛ばせる道具は多い
 * （pandas の `comment='#'` など）。Excel では普通の行として見えるので、
 * 項目名と値を別のセルに分けておく。
 */
export function metadataRows(items: [label: string, value: string][], now: Date): string[] {
  return [
    ...[...items, ['出力日時', toJstIso(now)] as const].map(
      ([label, value]) => `# ${label},${cell(value)}`
    ),
    '',
  ]
}
