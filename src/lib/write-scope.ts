/**
 * 受け取ったトークンで投稿できるか。
 *
 * **OAuth の応答から判定して保存する。** 保存しておかないと、読み取り
 * だけのトークンでも「直接投稿できる」ように見え、利用者は本文を書き
 * 終えてから断られることになる（実際そうだった）。
 *
 * 分からない場合は `null` を返す。**false と混ぜない** — 「権限が無い」と
 * 「権限が分からない」は扱いが違う。前者は書き始める前に案内でき、
 * 後者は送ってみるしかない。
 */

/** Mastodon / Pleroma の scope で投稿できるか。空白区切り */
export function hasWriteScope(scope: string | null | undefined): boolean | null {
  if (!scope) return null

  const scopes = scope.split(/\s+/).filter(Boolean)
  /*
    `write` は全体を含む広い権限。`write:statuses` が投稿そのもの。
    **前方一致で見ない** — `write:bookmarks` だけでは投稿できない。
  */
  return scopes.includes('write') || scopes.includes('write:statuses')
}

/**
 * Misskey（MiAuth）で投稿できるか。
 *
 * **応答が権限を返さない。** トークンだけが返るので、こちらが要求した
 * 権限で判断する（利用者が承認しなければトークン自体が来ない）。
 */
export function hasMisskeyWritePermission(requestedWrite: boolean): boolean {
  return requestedWrite
}
