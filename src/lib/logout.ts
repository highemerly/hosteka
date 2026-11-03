import { setFlash } from '@/lib/flash'

/**
 * ログアウト。
 *
 * **Cookie を消すだけにしない。** サーバー側でセッションを失効させないと、
 * 漏れたトークンのコピーが有効期限まで使えてしまう
 * （失効の伝播は `revocation-cache.ts`。CLAUDE.md の Session Management を参照）。
 *
 * 失敗しても遷移はする。ここで止めると、ログアウトできない状態に閉じ込める。
 *
 * **画面ごとに書かない。** ヘッダーとマイページの2箇所から呼ぶが、
 * 片方だけ `fetch` を忘れても画面上は正常にログアウトしたように見える
 * （Cookie が消えるのは応答を待たずに遷移するため）。
 */
export async function logout(): Promise<void> {
  try {
    const response = await fetch('/api/v1/auth/logout', { method: 'POST' })
    /*
      **成功と言えるのは応答が返ったときだけ。** Cookie を消すのは
      この応答なので、届かなければログイン中のまま。そこで
      「ログアウトしました」と出すと嘘になる。
    */
    setFlash(
      response.ok
        ? { type: 'success', message: 'ログアウトしました' }
        : { type: 'error', message: 'ログアウトできませんでした。もう一度お試しください' }
    )
  } catch (error) {
    console.error('ログアウトに失敗しました', error)
    setFlash({ type: 'error', message: 'ログアウトできませんでした。もう一度お試しください' })
  } finally {
    /*
      ページ全体を読み直す。router.push だとクライアント側のキャッシュに
      ログイン中の姿が残る。**知らせはここを越えられない**ので flash に預けてある。
      Next の規則（no-location-assign-relative-destination）は
      「内部遷移に location を使うな」と言うが、ここは**読み直しそのものが目的**。
    */
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/'
  }
}
