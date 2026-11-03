import 'server-only'

/**
 * 認証まわりの共有シークレット。
 *
 * ★重要★ この値は NextAuth のセッション署名だけのものではない。
 * `src/lib/crypto.ts` の deriveKey() が `User.accessToken` と
 * `oauth_apps.clientSecret` を暗号化する AES-256-GCM 鍵をここから導出しており、
 * Misskey の MiAuth も同じ値で HMAC する。
 *
 * したがって **値をローテートすると、保存済みの OAuth アクセストークンが
 * すべて復号不能になり、Mastodon / Misskey への投稿機能が回復不可能に壊れる**。
 * NextAuth を撤去したあとも、値そのものは変えないこと。
 *
 * **鍵の出どころはこの関数だけ。** 直接 `process.env` を読む場所を作らないこと
 * （以前 `crypto.ts` と `miauth-callback.ts` が `NEXTAUTH_SECRET` を直読みしており、
 * 名前を移した環境では「ログインは通るのに復号だけ落ちる」状態になった）。
 */
export function getAuthSecret(): string {
  const next = process.env.NEXTAUTH_SECRET
  const auth = process.env.AUTH_SECRET

  /*
    **両方あって中身が違うなら起動を止める。** 名前の移行中に新しい値を
    `AUTH_SECRET` へ入れると、`??` は黙ってそちらを選び、**保存済みの
    アクセストークンが全部読めなくなる**。片方が空文字の取り違えも同じ。
    気づけるのは「投稿だけができない」という遠い症状なので、ここで落とす。
  */
  if (next && auth && next !== auth) {
    throw new Error(
      'AUTH_SECRET と NEXTAUTH_SECRET に別の値が設定されています。' +
        'この値は保存済みアクセストークンの暗号鍵の導出元で、取り違えると復号できなくなります。' +
        '移行するときは同じ値を入れること。'
    )
  }

  const secret = auth ?? next
  if (!secret) {
    throw new Error(
      'AUTH_SECRET（または NEXTAUTH_SECRET）が設定されていません。' +
        'この値は保存済みアクセストークンの暗号鍵の導出元でもあるため、変更してはいけません。'
    )
  }
  return secret
}
