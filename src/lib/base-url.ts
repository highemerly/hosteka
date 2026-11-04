/**
 * ベースURLを取得する
 *
 * セキュリティ上の理由から、環境変数 NEXTAUTH_URL のみを使用します。
 * Host ヘッダーはクライアントが改ざん可能なため、信頼しません。
 *
 * @returns ベースURL
 */
export function getBaseUrl(): string {
  const baseUrl = process.env.NEXTAUTH_URL

  if (!baseUrl) {
    // 環境変数が設定されていない場合は開発環境と見なす
    console.warn('[Security] NEXTAUTH_URL is not set. Using localhost fallback.')
    return 'http://localhost:3000'
  }

  // 末尾のスラッシュを削除して正規化
  return baseUrl.replace(/\/$/, '')
}

/**
 * 公開URL。**無ければ null**（`getBaseUrl` と違って localhost に倒さない）。
 *
 * 静的なページ（トップ・一覧・FAQ など）の HTML は Docker のビルド中に1回だけ作られ、
 * 本番ではそれがそのまま配られる。そこに絶対URLを焼き込むには、ビルドのときに
 * `NEXTAUTH_URL` を渡す必要がある（Dockerfile の `ARG NEXTAUTH_URL`。docker-build.yml が渡す）。
 * 渡さずにビルドした場合（手元・ほかの人が自分で立てる場合）に `http://localhost:3000` を
 * 配らないよう、無ければ null を返して、絶対URLの要るもの（OG 画像）を載せない。
 */
export function publicBaseUrl(): string | null {
  const baseUrl = process.env.NEXTAUTH_URL?.trim()
  return baseUrl ? baseUrl.replace(/\/$/, '') : null
}
