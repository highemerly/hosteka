import 'server-only'

/**
 * ダウンロードさせる応答の `Content-Disposition`。
 *
 * **日本語のファイル名は `filename*`（RFC 6266 / 8187）で渡す。** 以前は
 * `filename="%E6%98%A5..."` と書いていた。Chrome と Firefox はこれを読み直して
 * 日本語に戻すが、**Safari は `%E6%98%A5...ics` という名前のまま保存する。**
 *
 * `filename` も一緒に付ける。こちらは `filename*` を読まない古いブラウザ向けで、
 * ASCII だけにする（それ以外の文字と `"` `\` は `_` にする）。改行もここで消えるので、
 * ヘッダーに行を書き足されることもない。
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
  // RFC 8187 の attr-char に無い `'()*` は encodeURIComponent が残すので、ここで逃がす
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}
