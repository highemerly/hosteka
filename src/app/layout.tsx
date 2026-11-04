import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { ConfirmDialogProvider } from "@/components/common/ConfirmDialog";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { FlashToast } from "@/components/common/FlashToast";
import { Providers } from "@/app/providers";
import { publicBaseUrl } from "@/lib/base-url";
import { defaultOgImages, twitterCard } from "@/lib/og/default";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Hosteka";
const SITE_DESCRIPTION =
  "Hosteka は Mastodon、Misskey、Pleroma、Discord と連携したコミュニティイベントプラットフォームです。SNSアカウントで簡単にイベント開催・参加が可能。";

/*
  OGP の既定値。**このアプリの流入は Fediverse のリンクプレビューなので、
  ここが空だとリンクを貼った側の見え方が落ちる。**

  **画像は絶対URLで書く必要がある**（クローラーは相対URLを解決しない）。静的なページの
  HTML は Docker のビルド中に作られるので、公開URLはビルド引数の `NEXTAUTH_URL` で渡す
  （`publicBaseUrl`）。渡さずにビルドしたら `metadataBase` も画像も置かない（localhost を配らない）。

  Next.js の metadata は**キー単位で上書き**される。ページ側が `openGraph` を
  持つとこの節ごと置き換わるので、`siteName` と画像（`defaultOgImages`）は
  各 generateMetadata にも要る（`server/metadata/*.ts`）。
*/
const BASE_URL = publicBaseUrl()
const OG_IMAGES = defaultOgImages()

export const metadata: Metadata = {
  ...(BASE_URL && { metadataBase: new URL(BASE_URL) }),
  title: "Hosteka(SNSコミュニティのためのイベントプラットフォーム)",
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: "website",
    locale: "ja_JP",
    images: OG_IMAGES,
  },
  twitter: {
    card: twitterCard(OG_IMAGES),
    description: SITE_DESCRIPTION,
    images: OG_IMAGES.map((i) => i.url),
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: 下のスクリプトが描画前に class / colorScheme を
    // 書き換えるため、サーバー出力と初回クライアント出力が一致しない。
    //
    // フォントの変数は <html> に置く。globals.css の `--font-sans` は :root で
    // `var(--font-geist-sans)` を参照するので、<body> に置くと :root からは
    // 見えず、`--font-sans` ごと無効になってブラウザ既定のフォント（Times）に
    // 落ちる。Geist は一度も読み込まれず、日本語は端末任せになっていた
    // （Chrome はゴシックを当てるので気づかず、iOS Safari で見た目が崩れた）。
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        {/*
          スタイル適用前に同期実行してFOUCを防ぐ。全閲覧者で内容が同一なので
          HTML の CDN キャッシュ可能性は損なわれない。
          将来 CSP を導入する場合は必ず hash ベース（'sha256-…'）で許可すること。
          リクエスト毎の nonce を使うと HTML がキャッシュ不能になる。
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/*
          RUM（next-rum）。`/_n-rum/` は Next へ届かない — k8sg1 の
          `manifests/hosteka/prd/ingressroute.yaml` がコレクタへ回している。
          開発環境では誰も受けないので出さない。
          next/script にしないのは、afterInteractive では計測の登録が
          最初の描画に間に合わないから。GPC を有効にしたブラウザでは
          beacon.js 自身が何もせずに終わる。
          送るものはプライバシーポリシー「分析ツール」に書いてある。
        */}
        {process.env.NODE_ENV === 'production' && <script async src="/_n-rum/beacon.js" />}
      </head>
      <body className="antialiased">
        {/*
          Providers（TanStack Query）はここで一度だけ張る。
          画面ごとに張ると画面遷移のたびにキャッシュが捨てられる。
        */}
        <Providers>
          <TooltipProvider>
            <ConfirmDialogProvider>
              {/*
                ヘッダーとフッターは**ここで一度だけ描く**
                （docs/DESIGN_GUIDELINES.md「レイアウト」）。画面ごとに
                外枠を持たせない。`error.tsx` もこの中に描かれるので、
                あちらに自前のヘッダーを置くと二重になる。
              */}
              <div className="flex min-h-screen flex-col">
                <SiteHeader />
                {/* 運営からのお知らせ。掲載中のものが無ければ何も描かない */}
                <AnnouncementBanner />
                <main className="flex-1">{children}</main>
                <SiteFooter />
              </div>
            </ConfirmDialogProvider>
          </TooltipProvider>
        </Providers>
        <Toaster position="top-center" richColors closeButton />
        {/* 読み直しを越えて預けた知らせを出す（lib/flash.ts） */}
        <FlashToast />
      </body>
    </html>
  );
}
