/**
 * Markdown ツールバーの編集操作。
 *
 * 文字位置の計算は目で追いにくく、ずれても「選択が飛ぶ」程度にしか
 * 現れない（気づかれないまま使いにくくなる）。純関数に切り出して固定する。
 */

export type Edit = { text: string; selectionStart: number; selectionEnd: number }

/** 選択範囲を前後で挟む。未選択ならプレースホルダを入れて選択状態にする */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  placeholder: string
): Edit {
  const selected = value.slice(start, end)
  const body = selected || placeholder
  return {
    text: value.slice(0, start) + prefix + body + suffix + value.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + body.length,
  }
}

/** 選択した行の先頭に印を付ける。複数行ならすべての行に付ける */
export function prefixLines(value: string, start: number, end: number, mark: string, placeholder: string): Edit {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd = value.indexOf('\n', end)
  const stop = lineEnd === -1 ? value.length : lineEnd
  const block = value.slice(lineStart, stop) || placeholder
  const marked = block
    .split('\n')
    .map((line) => (line.startsWith(mark) ? line : mark + line))
    .join('\n')

  return {
    text: value.slice(0, lineStart) + marked + value.slice(stop),
    selectionStart: lineStart + mark.length,
    selectionEnd: lineStart + marked.length,
  }
}

export function makeTable(rows: number, cols: number): string {
  const header = `| ${Array.from({ length: cols }, (_, i) => `見出し${i + 1}`).join(' | ')} |`
  const divider = `|${Array.from({ length: cols }, () => '---').join('|')}|`
  const body = Array.from(
    { length: rows },
    () => `| ${Array.from({ length: cols }, () => '　').join(' | ')} |`
  ).join('\n')
  return `\n${header}\n${divider}\n${body}\n`
}


/** テスト用のまとめ。実装側は個別に import する */
export const __testables = { wrapSelection, prefixLines, makeTable }
