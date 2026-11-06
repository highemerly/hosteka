import { ExternalLink, Minus, Plus, RefreshCw, Wrench } from 'lucide-react'

import { ContentPage } from '@/components/content/ContentPage'
import { formatJstDateTime } from '@/lib/jst'
import type { ChangeType, ReleaseNote } from '@/lib/release-notes'
import generated from '@/screens/content/release-notes-generated.json'
import { LEGACY_RELEASE_NOTES } from '@/screens/content/release-notes-legacy'

export const metadata = {
  title: 'リリースノート - Hosteka (SNSコミュニティのためのイベントプラットフォーム)',
  description: 'Hostekaの更新履歴とリリースノートをご覧いただけます。'
}

// ISRでキャッシュを有効化（5分間隔で更新）
export const revalidate = 300

/*
  変更の種別。**色で区別しない**（docs/DESIGN_GUIDELINES.md）。
  以前は緑・青・赤・黄の4色で塗り分けていたが、これは分類であって
  重要度ではない。4色を並べると、どれが重い変更なのかを色が
  嘘で答えることになる。記号と語で区別する。
*/
const changeTypeConfig: Record<ChangeType, { label: string; icon: typeof Plus }> = {
  add: { label: '追加', icon: Plus },
  fix: { label: '修正', icon: Wrench },
  remove: { label: '削除', icon: Minus },
  change: { label: '変更', icon: RefreshCw },
}

/*
  新しい版から。2.0.6 以降はタグのビルドが PR 本文から作って焼き込む
  （scripts/release-notes.ts。リポジトリに置いてあるのは空の配列で、ブランチや手元では
  手書きの分だけが出る）。
*/
const releaseNotes: ReleaseNote[] = [...(generated as ReleaseNote[]), ...LEGACY_RELEASE_NOTES]

function releasedOn(release: ReleaseNote): string | undefined {
  if (!release.releasedAt) return release.date
  return formatJstDateTime(release.releasedAt, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ReleaseNotes() {
  return (
    <ContentPage title="リリースノート">
      <div className="space-y-8">
        {releaseNotes.map((release) => (
          <section key={release.version}>
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-bold text-foreground">Ver {release.version}</h2>
              <span className="text-sm text-muted-foreground">{releasedOn(release)}</span>
            </div>

            <ul className="mt-3 rule-y">
              {release.changes.map((change, index) => {
                const { label, icon: Icon } = changeTypeConfig[change.type]
                return (
                  <li key={index} className="flex items-start gap-3 py-2">
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      <Icon className="size-3" aria-hidden />
                      {label}
                    </span>
                    <span className="text-sm text-foreground">{change.text}</span>
                  </li>
                )
              })}
            </ul>

            {/*
              PR の一覧（英語）。行き先は固定なので、外部リンクの中間ページは挟まない
              （フッターの「ソースコード」と同じ）
            */}
            {release.url ? (
              <a
                href={release.url}
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-4" aria-hidden />
                すべての変更を見る
              </a>
            ) : null}
          </section>
        ))}
      </div>
    </ContentPage>
  )
}
