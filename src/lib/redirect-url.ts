/**
 * 安全なリダイレクトURL検証ユーティリティ
 * オープンリダイレクト脆弱性を防ぐ
 */

/**
 * リダイレクトURLが安全かどうかを検証し、安全なURLを返す
 *
 * @param url - 検証対象のURL（相対パスまたは絶対URL）
 * @param baseUrl - アプリケーションのベースURL
 * @param defaultPath - 無効な場合のデフォルトパス
 * @returns 安全なリダイレクトURL
 */
export function getSafeRedirectUrl(
  url: string | null | undefined,
  baseUrl: string,
  defaultPath: string = '/dashboard'
): string {
  // nullまたはundefinedの場合はデフォルト
  if (!url) {
    return `${baseUrl}${defaultPath}`
  }

  // プロトコル相対URL（//example.com）は危険なので拒否
  if (url.startsWith('//')) {
    return `${baseUrl}${defaultPath}`
  }

  // 相対パス（/で始まる）は安全
  if (url.startsWith('/')) {
    // ただし//で始まらないことを確認済み
    return `${baseUrl}${url}`
  }

  // 絶対URLの場合は同一オリジンのみ許可
  try {
    const targetUrl = new URL(url)
    const base = new URL(baseUrl)

    // プロトコルがhttp/https以外は拒否
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return `${baseUrl}${defaultPath}`
    }

    // 同一オリジンのみ許可
    if (targetUrl.origin === base.origin) {
      return url
    }

    // 異なるオリジンはデフォルトにリダイレクト
    return `${baseUrl}${defaultPath}`
  } catch {
    // URL解析に失敗した場合はデフォルト
    return `${baseUrl}${defaultPath}`
  }
}
