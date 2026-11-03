/**
 * Cookie名の定数定義
 *
 * 命名規則: `ht-<項目>`（ht = hosteka）。区切りはハイフン、分類の段は置かない。
 * 名前は全リクエストに載るので短くする
 *
 * **本番では全部に `__Host-` を付ける。** Path=/ かつ Secure かつ Domain 未指定の
 * ときだけ有効なプレフィックスで、サブドメインからの Cookie 注入をブラウザが
 * 防いでくれる。条件を満たさない Set-Cookie はブラウザが黙って捨てるので、
 * **クライアントから書く・消すときも `secure: COOKIE_SECURE` と `path: '/'` を渡す**
 * （削除も Set-Cookie なので、Secure が無いと消えない）。
 *
 * 名前を変えたら `src/components/legal/PrivacyDocument.tsx` の一覧も直す。
 */

const isProd = process.env.NODE_ENV === 'production'

/** Secure 属性を付けるか。`__Host-` の条件なので名前と必ず揃える */
export const COOKIE_SECURE = isProd

function hostCookie(name: string): string {
  return isProd ? `__Host-${name}` : name
}

// ==================== ログイン ====================

/**
 * セッショントークン（httpOnly）。認証の真実はこれだけ。
 */
export const COOKIE_SESSION = hostCookie('ht-session')

/**
 * 表示用のビューア情報（**httpOnly ではない**）。
 *
 * ヘッダーのアバターやボタンの出し分けを fetch 待ちなしで描画するためだけに
 * 存在する。クライアントが読める＝クライアントが書き換えられるということなので、
 * **サーバーはこの Cookie を一切信頼してはならない**。
 * 署名もしない。署名は「信頼してよい」という誤ったシグナルになるため。
 *
 * 実際の認可は必ず COOKIE_SESSION の JWT を検証して行う。
 */
export const COOKIE_VIEWER = hostCookie('ht-viewer')

/** OAuth 往復のあいだだけ持つクライアント情報（暗号化済み） */
export const COOKIE_OAUTH_SESSION = hostCookie('ht-oauth')

// ==================== 表示の状態 ====================

/**
 * 閉じたお知らせバナーの id（**httpOnly ではない**）。
 *
 * ログインしていない人にも「閉じたら出てこない」を効かせるため、DB ではなく
 * Cookie に置く。**サーバーはこの Cookie を一切参照しない** — 書き換えられても
 * 起きるのは「自分の画面にバナーが出る／出ない」だけで、誰の権限も動かない。
 */
export const COOKIE_ANNOUNCEMENTS_READ = hostCookie('ht-ann')

// ==================== 有効期限 ====================

/** OAuth認証セッションの有効期限（10分） */
export const COOKIE_MAX_AGE_OAUTH_SESSION = 10 * 60

/** セッションの有効期限（14日） */
export const COOKIE_MAX_AGE_SESSION = 14 * 24 * 60 * 60

/**
 * 閉じたお知らせバナーを覚えておく期間（180日）。
 *
 * 中身は**そのとき掲載中の id だけ**に入れ替わるので、期限が来る前に
 * 値のほうが入れ替わる（`src/lib/announcements.ts`）。
 */
export const COOKIE_MAX_AGE_ANNOUNCEMENTS_READ = 180 * 24 * 60 * 60
