# Cookie 一覧

名前と有効期限の定義元は `src/lib/cookie-names.ts`。**この文書に書くのは
「なぜその形なのか」**で、値そのものはあちらが持つ。

## 命名規則

- `ht-<項目>`。区切りはハイフン、分類の段は置かない（名前は全リクエストに載るので短く）
- **本番では全部に `__Host-` を付ける。** Path=/ かつ Secure かつ Domain 未指定の
  ときだけ有効なプレフィックスで、サブドメインからの Cookie 注入をブラウザが
  防いでくれる。開発環境（http）では Secure を付けられないので外す
- 名前を変えたら**プライバシーポリシーの一覧**
  （`src/components/legal/PrivacyDocument.tsx`）も直す

## 一覧

本番の名前で書く。開発環境では `__Host-` が付かない。

| Cookie名 | 用途 | 有効期限 | httpOnly | 書く場所 |
|---|---|---|---|---|
| `__Host-ht-session` | セッション（jose で署名した JWT） | 14日 | **Yes** | `server/auth/cookies.ts` |
| `__Host-ht-viewer` | ヘッダー表示用のビューア情報（base64url の JSON） | 14日 | **No** | 同上 |
| `__Host-ht-oauth` | ログインの往復のあいだだけ持つ「このブラウザで始めた」印。Mastodon / Pleroma はアプリの ID と csrf、Misskey は MiAuth のセッション ID（暗号化済み。シークレットは DB の `oauth_apps`） | 10分 | Yes | mastodon / misskey / pleroma の `register`。コールバックが消す |

いずれも `SameSite=Lax`、`Path=/`、`Secure` は本番のみ。

## 守ること

**セッションとビューアは必ず同時に書く**（`setSessionCookies`）。片方だけ
更新すると「ログイン済みなのに古い名前が出る」状態になる。消すときも同様
（`clearSessionCookies`）。

**ビューア Cookie をサーバーから参照しない。** httpOnly ではないので閲覧者が
自由に書き換えられる。ヘッダーのアバターや出し分けを fetch 待ちなしで描くため
**だけ**に存在する。署名もしない — 署名は「信頼してよい」という誤った
シグナルになる。認可は必ず `ht-session` の JWT を検証して行う
（`server/auth/session.ts`）。

**ビューアには 1KB の上限がある。** Cookie は全リクエストに載るうえ、
超えると一部のブラウザが黙って捨てる。`encodeViewer` はアバターURLを落とし、
名前を切り詰めてでも収める（表示が欠けてもログインは成立させる）。

**クライアントから書く・消すときは `path: '/'` と `secure: COOKIE_SECURE` を渡す。**
`__Host-` の条件を欠いた Set-Cookie はブラウザが黙って捨てる。削除も Set-Cookie
なので、Secure を付け忘れると**消したつもりで残る**。サーバー側の
`cookies.delete()` も同じで、名前だけ渡すと Secure が付かない。

## Cookie ではないもの

キーの定義元は `src/lib/storage-keys.ts`。命名は Cookie と同じ `ht-<項目>`。
**サーバーが読まないものは Cookie に置かない。** Cookie は全リクエストに載るうえ、
`document.cookie` で書いたものは Safari が期限を最大7日に切り詰める。
名前を変えたらプライバシーポリシーの一覧も直す（こちらも guard テストが見ている）。

| キー | 置き場 | 理由 |
|---|---|---|
| `ht-theme` | localStorage | Cookie にすると `Vary: Cookie` かユーザー別 HTML が要る（`lib/theme.ts`） |
| `ht-server` | localStorage | 前回ログインしたサーバー。読むのはログイン画面だけ（`lib/remembered-server.ts`）。アカウント削除で消す |
| `ht-flash` | sessionStorage | 読み直しを越えて1回だけ出す知らせ。URL に載せると公開キャッシュに閲覧者の状態が混ざる（`lib/flash.ts`） |
| `ht-event-contact-draft` / `ht-pre-event-contact-draft` | sessionStorage | 権限の取り直しに出るあいだの連絡文の下書き（`attendable/contact/ContactScreen.tsx`） |
