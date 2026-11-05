import type { NextConfig } from "next";

const PRIVATE_NO_STORE = [{ key: 'Cache-Control', value: 'private, no-store' }]

/**
 * 公開キャッシュに載せてよい API のパス（`/api/` より後ろ）。
 *
 * **足すときは、そのルートが `auth: 'none'` であることを必ず確かめること。**
 * セッションを読むルートをここに入れると、他人の応答が CDN から配られる。
 *
 * **除外は前方一致になる。** 下の否定先読みは先頭しか見ないので、
 * `v1/announcements` と書くと `/api/v1/announcements/<id>` もこの網から外れる。
 * 外れたルートは `defineRoute` が自分で `private, no-store` を宣言する。
 */
const PUBLICLY_CACHEABLE_API = ['v1/home', 'v1/announcements']

/**
 * **RSC の要求は CDN に持たせない。**
 *
 * `RSC: 1` を付けた要求には、同じURLで HTML ではなくフライト（と `/?_rsc` への
 * 307）が返る。Cloudflare は `Accept-Encoding` 以外の `Vary` を無視するので、
 * これが公開キャッシュに載ると、`/` を開いた全員が生のフライトを受け取る。
 *
 * `proxy.ts` では止められない。**`rsc` ヘッダも `_rsc` クエリも、proxy に
 * 届く前に Next が取り除く**（本番ビルドで実測）。ここの `has` は元の要求を
 * 見るので判定できる。`Cache-Control` は proxy が後から上書きするので、
 * CDN だけが読む `CDN-Cache-Control` で止める（Cloudflare はこちらを優先する）。
 */
const RSC_MARKERS = [
  { type: 'header', key: 'rsc' },
  { type: 'query', key: '_rsc' },
] as const
const CDN_NO_STORE = [{ key: 'CDN-Cache-Control', value: 'no-store' }]

/**
 * Content Security Policy。全パスに付ける。
 *
 * **`script-src` に `'unsafe-inline'` を残す。** App Router はどのページにも
 * インラインスクリプト（RSC のデータ `self.__next_f.push(...)`）を埋め込み、中身は
 * ページごと・ビルドごとに変わるので、固定のハッシュでは許可できない。nonce は
 * 全ページを動的にし、HTML を CDN に持たせられなくなる（Next の CSP のガイド）。
 * **ハッシュを足さないこと** — ハッシュか nonce があると、ブラウザは
 * `'unsafe-inline'` を無視し、テーマの初期化や RSC のスクリプトが止まる。
 *
 * それでも次は止まる: 外部からのスクリプトの読み込み、外への送信（`connect-src`）、
 * `<base>` の差し替え、プラグイン、枠への埋め込み、外へのフォーム送信。
 *
 * - `img-src https:` … アバターは各 Fediverse サーバー・Discord・X から来る
 * - RUM（`/_n-rum/`）は同じホスト名で配っているので `'self'` で足りる
 * - 開発時だけ `'unsafe-eval'`（React がエラーの位置を復元するのに使う）
 *
 * 違反は E2E（`e2e/support.ts` の `openCleanly`）が拾う。
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig: NextConfig = {
  /*
    **CLAUDE.md を Next に書き換えさせない。**
    16.3 の `next dev` は起動のたびに CLAUDE.md へ
    `<!-- BEGIN:nextjs-agent-rules -->` の節を追記する。あのファイルは
    このリポジトリの決まりを人が書いたもので、フレームワークの生成物ではない。
    追記されたままだと、毎回 uncommitted な差分が出て、コミットに混ざる。
  */
  agentRules: false,
  /*
    別の端末（スマホ実機など）から `next dev` を開くときに許すホスト。
    `next dev` でしか効かない。手元の LAN の IP なので値はリポジトリに
    書かず、`.env.local` の `ALLOWED_DEV_ORIGINS`（カンマ区切り）から読む。
  */
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
  output: 'standalone',
  /*
    OG 画像（`app/og/**`）が実行時に読む日本語のフォント。fs で読むので、
    standalone の出力に入るよう明示する（入れ忘れると本番でだけ読めずに落ちる）。
  */
  outputFileTracingIncludes: {
    '/og/**': ['./src/assets/fonts/**/*'],
  },
  serverExternalPackages: ['@prisma/client'],
  compress: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }],
      },
      // 認証が必要なページ
      {
        source: '/dashboard/:path*',
        headers: PRIVATE_NO_STORE,
      },
      {
        source: '/account/:path*',
        headers: PRIVATE_NO_STORE,
      },
      {
        source: '/events/:path*',
        headers: PRIVATE_NO_STORE,
      },
      {
        source: '/pre-events/:path*',
        headers: PRIVATE_NO_STORE,
      },
      {
        source: '/orgs/:path*',
        headers: PRIVATE_NO_STORE,
      },
      /*
        ユーザーのページ。**未ログインでも見られるが、ここに入れる。**
        Cloudflare は `Accept-Encoding` 以外の `Vary` を無視するので、
        RSC フライトと HTML が同じキャッシュキーに同居し、ログイン中の
        セッションが匿名へ配られうる（CLAUDE.md「レンダリングとキャッシュ」）。
        `/orgs` も同じ理由でここに居るので、揃えておく。
      */
      {
        source: '/users/:path*',
        headers: PRIVATE_NO_STORE,
      },
      {
        source: '/admin/:path*',
        headers: PRIVATE_NO_STORE,
      },
      {
        source: '/auth/:path*',
        headers: PRIVATE_NO_STORE,
      },
      /*
        APIエンドポイント。**既定は「キャッシュさせない」。**

        ここは `defineRoute` に載っていない9本も含めて全部を覆う最後の網なので、
        許可ではなく拒否を既定にしておく。例外は下の `PUBLICLY_CACHEABLE_API` に
        書いたものだけで、**`auth: 'none'` かつ閲覧者に依らない応答**に限る
        （`defineRoute` の `publicCache` が型でそれを縛っている）。

        除外したルートは無防備になるのではなく、`defineRoute` 側が
        自分で `Cache-Control` を宣言する。
      */
      {
        source: `/api/:path((?!${PUBLICLY_CACHEABLE_API.join('|')}).*)`,
        headers: PRIVATE_NO_STORE,
      },
      ...RSC_MARKERS.map((marker) => ({
        source: '/:path*',
        has: [marker],
        headers: CDN_NO_STORE,
      })),
    ]
  },
  async redirects() {
    return [
      /*
        お知らせをファイル（`src/announcements/*.md`）から DB へ移した名残。
        中身は移さずに取り下げたので、貼られている旧URLは一覧へ送る
        （404 にするより、いま出ているお知らせを見せたほうがよい）。
      */
      {
        source: '/announcements/incident-2026-04',
        destination: '/announcements',
        permanent: true,
      },
      {
        source: '/dashboard/events',
        destination: '/events',
        permanent: true,
      },
      {
        source: '/dashboard/pre-events',
        destination: '/pre-events',
        permanent: true,
      },
      /*
        ユーザーのページを Fediverse の書き方（`/users/@alice@server`）で
        貼られる。アドレスバーを正規形へ寄せる。
        **これだけでは足りない** — `%40` で符号化された形はこの source に
        当たらないので、最後の砦は `parseUserHandle`（先頭の `@` を落とす）。
      */
      {
        source: '/users/@:handle',
        destination: '/users/:handle',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
