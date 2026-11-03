import type { MetadataRoute } from 'next'

import { getBaseUrl } from '@/lib/base-url'

/**
 * robots.txt。
 *
 * **これまで置いていなかった。** そのため管理画面・ダッシュボード・
 * アカウント設定までクローラーが辿っていた。中身は見えない
 * （`proxy.ts` がログイン画面へ送る）が、ログイン画面が延々と
 * 索引され、クロールの予算を公開ページから奪う。
 *
 * **リクエスト時に組み立てる。** `NEXTAUTH_URL` はビルド時には無いので
 * （Dockerfile が渡していない）、静的に焼くと sitemap の行が
 * `http://localhost:3000` になる。
 */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin',
        '/dashboard',
        '/account',
        // ログイン・失敗画面。索引しても入口にならない
        '/auth/',
        '/dev/',
        // 外部リンクの中継。行き先そのものが索引されるべき
        '/external-link',
        // 主催者だけが開ける画面。開くとログインへ飛ばされる
        '/events/create',
        '/pre-events/create',
        '/events/*/edit',
        '/events/*/contact',
        '/events/*/register',
        '/events/*/cancel',
        '/pre-events/*/edit',
        '/pre-events/*/contact',
      ],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  }
}
