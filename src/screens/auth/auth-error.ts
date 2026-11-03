/**
 * ログインの失敗の説明。
 *
 * **コードは OAuth コールバックが決め、画面はここでしか訳さない。**
 * 旧画面は switch を JSX の中に持っていて、`request_expired` と
 * `missing_session`（どちらも実際に発行される）が拾えておらず、
 * 「不明なエラーが発生しました」になっていた。
 * `auth-error.test.ts` が `src/` を走査して、発行されるコードが
 * ここに揃っていることを見ている。
 */
export type AuthErrorInfo = {
  /** 見出し。何が起きたかを一行で */
  title: string
  /** 説明。**利用者が次に何をすればいいかまで書く** */
  message: string
  /**
   * ログインし直せば解決するか。
   * BAN のように「やり直しても同じ」ものにログインボタンを出すと、
   * 何度でも同じ壁に当たらせることになる。
   */
  retryable: boolean
}

export const AUTH_ERRORS: Record<string, AuthErrorInfo> = {
  missing_parameters: {
    title: 'ログインを完了できませんでした',
    message:
      '認証に必要な情報が届きませんでした。もう一度ログインしてください。',
    retryable: true,
  },
  invalid_state: {
    title: 'ログインを完了できませんでした',
    message:
      '認証の照合に失敗しました。別のタブでログインし直した場合などに起こります。もう一度ログインしてください。',
    retryable: true,
  },
  missing_session: {
    title: 'ログインの途中の情報が失われました',
    message:
      'ログインを始めてから時間が経ったか、Cookie が消えています。もう一度ログインしてください。',
    retryable: true,
  },
  expired_state: {
    title: 'ログインの有効期限が切れました',
    message: '始めてから時間が経ちすぎています。もう一度ログインしてください。',
    retryable: true,
  },
  request_expired: {
    title: 'ログインの有効期限が切れました',
    message: '始めてから時間が経ちすぎています。もう一度ログインしてください。',
    retryable: true,
  },
  verification_failed: {
    title: 'ログインの確認に失敗しました',
    message:
      '認証の内容を確かめられませんでした。もう一度ログインしてください。',
    retryable: true,
  },
  token_exchange_failed: {
    title: 'サーバーとのやり取りに失敗しました',
    message:
      'アクセストークンを受け取れませんでした。相手のサーバーが混んでいる可能性があります。しばらく待ってからもう一度お試しください。',
    retryable: true,
  },
  user_fetch_failed: {
    title: 'アカウント情報を受け取れませんでした',
    message:
      '相手のサーバーからユーザー情報を取得できませんでした。しばらく待ってからもう一度お試しください。',
    retryable: true,
  },
  invalid_account: {
    title: 'このアカウントでは登録できません',
    message:
      'ユーザー名に使えない文字が含まれています。お使いのサーバーの管理者までお問い合わせください。',
    retryable: false,
  },
  user_banned: {
    title: 'アカウントを停止しています',
    message:
      '利用規約に反する行為が認められたため、このアカウントの利用を停止しています。心当たりがない場合は管理者までお問い合わせください。',
    retryable: false,
  },
  internal_error: {
    title: 'システムエラーが発生しました',
    message:
      'Hosteka 側で問題が起きました。しばらく待ってからもう一度お試しください。',
    retryable: true,
  },
}

const UNKNOWN: AuthErrorInfo = {
  title: 'ログインできませんでした',
  message:
    '原因を特定できませんでした。もう一度ログインしても直らない場合は、管理者までお問い合わせください。',
  retryable: true,
}

export function authErrorInfo(code: string | null | undefined): AuthErrorInfo {
  if (!code) return UNKNOWN
  return AUTH_ERRORS[code] ?? UNKNOWN
}
