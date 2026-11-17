import { COOKIE_VIEWER } from '@/lib/cookie-names'

/**
 * RUM（next-rum）に「ログインしているかどうか」を教える `<html data-rum-auth>`。
 *
 * ビーコンはページの表示（読み込みと画面内の移動）のたびにこの属性を読み、
 * `in` / `out` だけを送る。誰なのかは送らない。何を送るかはプライバシーポリシー
 * 「分析ツール」に書いてある。
 *
 * **HTML には書かない。** HTML は全閲覧者で同一（CDN にキャッシュする）なので、
 * 閲覧者ごとの値はブラウザで付ける。`<head>` の同期スクリプト
 * （`RUM_AUTH_INIT_SCRIPT`）が、`async` で読むビーコンより先に必ず走る。
 *
 * 判定はビューア Cookie が空でないかだけ。`useViewer` と違って中身は検証しない
 * （集計のための目安で、壊れた Cookie を持つ人はほぼいない）。表示と同じく、
 * 認可には使わない。
 */
export const RUM_AUTH_ATTRIBUTE = 'data-rum-auth'

/** `<head>` で同期実行する。`<html>` は `suppressHydrationWarning` 済み */
export const RUM_AUTH_INIT_SCRIPT = `(function(){try{
var n=${JSON.stringify(`${COOKIE_VIEWER}=`)};
var c=document.cookie.split('; ');
var a='out';
for(var i=0;i<c.length;i++){if(c[i].indexOf(n)===0&&c[i].length>n.length){a='in';break;}}
document.documentElement.setAttribute(${JSON.stringify(RUM_AUTH_ATTRIBUTE)},a);
}catch(_){}})();`

/**
 * ページを読み直さずにログアウト状態になったとき（API の 401 でビューア
 * Cookie を消したとき）に呼ぶ。ログインとログアウトは読み直すので、
 * 初期化スクリプトが付け直す。
 */
export function markRumLoggedOut(): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute(RUM_AUTH_ATTRIBUTE, 'out')
}
