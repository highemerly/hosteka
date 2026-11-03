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