import 'server-only'

import type { Metadata } from 'next'

import { prisma } from '@/lib/prisma'
import { formatUserHandle, parseUserHandle } from '@/lib/user-handle'
import { defaultOgImages, twitterCard } from '@/lib/og/default'

/**
 * ユーザーページの OGP メタデータ。
 *
 * **このアプリの流入経路は Fediverse のリンクプレビューなので、ここは
 * サーバー側に残す**（クローラーは JS を実行しない。`./event.ts` と同じ理由）。
 *
 * **画像は載せない。** アイコンは他サーバーの URL で、載せるなら
 * `getAvatarUrl()` のプロキシを通すことになる。イベントもグループも
 * 画像を持たせていないので、ここだけ増やさない。
 */
export async function getUserProfileMetadata(rawHandle: string): Promise<Metadata> {
  const handle = parseUserHandle(rawHandle)

  /*
    **見つからないときは索引させない。** 存在しないハンドルの URL は
    いくらでも作れるので、索引されると中身のないページが並ぶ。
  */
  const notFound: Metadata = {
    title: 'ユーザーが見つかりません - Hosteka',
    description: 'このユーザーは存在しないか、利用を停止した可能性があります。',
    robots: { index: false, follow: false },
  }

  if (!handle) return notFound

  const user = await prisma.user.findUnique({
    where: { username_server: handle },
    select: {
      username: true,
      displayName: true,
      server: true,
      bio: true,
      ban: { select: { id: true } },
    },
  })

  if (!user || user.ban) return notFound

  const at = `@${formatUserHandle(user)}`
  const title = `${user.displayName}（${at}） - Hosteka`

  /*
    **改行を畳む。** 自己紹介は Markdown なので普通に改行が入るが、
    `<meta content>` に改行が残ると description ごと出力から落ちる
    （リンクプレビューに何も出なくなる）。実際そうなっていた。
  */
  const bio = user.bio?.replace(/\s+/g, ' ').trim()
  const description = bio
    ? bio.length > 160
      ? `${bio.slice(0, 157)}...`
      : bio
    : `${user.displayName}（${at}）のページです。主催しているイベントと日程調整を見られます。`

  return {
    title,
    description,
    openGraph: {
      siteName: 'Hosteka',
      title: `${user.displayName}（${at}）`,
      description,
      type: 'profile',
      locale: 'ja_JP',
      images: defaultOgImages(),
    },
    twitter: {
      card: twitterCard(defaultOgImages()),
      title: `${user.displayName}（${at}）`,
      description,
    },
  }
}
