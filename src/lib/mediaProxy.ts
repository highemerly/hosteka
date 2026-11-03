/*
  **Misskey の `avatarUrl` は元画像ではなく、そのサーバーのプロキシのURL**
  （`https://mi.example/proxy/avatar.webp?url=<元画像>&avatar=1`）。
  これをそのままこちらのプロキシへ渡すと、プロキシがプロキシを取りに行く
  ことになり、フォールバックの画像が返る（200 で返るので壊れて見えない）。
  中の `url` を取り出して、元画像を渡す。

  保存するときではなくここで剥がす。DB には既にプロキシのURLが入っていて、
  保存側だけ直しても、本人が入り直すまで他の人の一覧で壊れたままになる。
*/
function unwrapMisskeyProxy(originalUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(originalUrl)
  } catch {
    return originalUrl
  }
  if (!parsed.pathname.endsWith('/avatar.webp')) return originalUrl

  const inner = parsed.searchParams.get('url')
  if (!inner || !/^https?:\/\//.test(inner)) return originalUrl
  return inner
}

export function getAvatarUrl(originalUrl: string | null | undefined): string {
  if (!originalUrl) return '/default-avatar.svg'
  const encoded = encodeURIComponent(unwrapMisskeyProxy(originalUrl))
  return `https://delivery.piyo.me/proxy/image.webp?url=${encoded}&avatar=1&fallback`
}
