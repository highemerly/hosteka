import type { MetadataRoute } from 'next'

import { buildSitemap } from '@/server/sitemap'

/**
 * sitemap.xml。中身は `server/sitemap.ts`。
 *
 * **組み立てた結果を1時間覚えておく。** 中身は誰が来ても同じで、無認証で叩ける。
 * 毎回組み立てると、叩かれるたびに DB を3回引く（イベント・日程調整・お知らせを
 * 最大2000件ずつ）。Cloudflare は `.xml` を既定では持たないので、全部がここまで届く。
 * 公開や終了が sitemap に出るのは最大1時間遅れるが、クローラーが読む頻度より短い。
 *
 * ビルド時に焼く（`revalidate`）形にしないのは、Docker のビルド中に DB が無いため。
 */
export const dynamic = 'force-dynamic'

const TTL_MS = 60 * 60 * 1000

let memo: { at: number; entries: Promise<MetadataRoute.Sitemap> } | null = null

export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = Date.now()
  if (!memo || now - memo.at >= TTL_MS) {
    // 組み立て中に来た要求も同じ結果を待つ（同時に来ても DB を引くのは1回）
    const entries = buildSitemap(new Date(now))
    memo = { at: now, entries }
    // 失敗は覚えない。DB が一時的に落ちただけで、1時間エラーを返し続けないように
    entries.catch(() => {
      if (memo?.entries === entries) memo = null
    })
  }
  return memo.entries
}
