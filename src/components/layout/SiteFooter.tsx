import Link from 'next/link'

import ThemeToggle from '@/components/layout/ThemeToggle'

/**
 * 全ページ共通のフッター。layout.tsx で一度だけ描画する。
 *
 * テーマ切替はここに置く。日常的に触るものではないので、
 * ヘッダーの一等地を占有させない。
 */
export function SiteFooter() {
  /*
    **お知らせを先頭に置く。** ヘッダー下のバナーは×で閉じられるので、
    閉じたあとに読み直す道がここにしか無い。

    機能紹介（`/feature`）はページだけ残してある。中身ができるまで
    ここから案内しない。
  */
  const links = [
    { href: '/announcements', label: 'お知らせ' },
    { href: '/faq', label: 'よくある質問' },
    { href: '/terms', label: '利用規約' },
    { href: '/privacy', label: 'プライバシー' },
    { href: '/release-notes', label: 'リリースノート' },
  ]

  /*
    **ソースコードへの入口。** AGPL-3.0 で公開しているので、使っている人が
    ソースを辿れるようにしておく（外部の手が入ったコードを動かすなら、
    ネットワーク越しの利用者へソースを示すのは義務になる）。
    行き先は固定なので、外部リンクの中間ページは挟まない。
  */
  const sourceUrl = 'https://github.com/highemerly/hosteka'

  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
          <a
            href={sourceUrl}
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            ソースコード
          </a>
        </nav>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Hosteka — SNSコミュニティのためのイベントプラットフォーム
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">表示テーマ</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  )
}
