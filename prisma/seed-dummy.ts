import { prisma } from './client'


async function main() {
  console.log('Creating dummy data for development...')

  // まずdev-loginで使えるAliceを作成/取得
  const alice = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'alice',
        server: 'handon.club',
      },
    },
    update: {},
    create: {
      username: 'alice',
      displayName: 'Alice (主催者)',
      server: 'handon.club',
      platform: 'mastodon',
      avatar: 'https://via.placeholder.com/150?text=A',
      accessToken: 'dev-token',
      lastTermsAcceptedAt: new Date(),
    },
  })
  console.log(`Created/Found Alice: ${alice.id}`)

  // 8人の架空ユーザーを作成

  // Mastodonユーザー 3人
  const mastodonUser1 = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'tanaka',
        server: 'mastodon.social',
      },
    },
    update: {},
    create: {
      username: 'tanaka',
      displayName: '田中太郎🍣',
      server: 'mastodon.social',
      platform: 'mastodon',
      avatar: 'https://via.placeholder.com/150?text=T',
      lastTermsAcceptedAt: new Date(),
    },
  })

  const mastodonUser2 = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'sakura',
        server: 'fedibird.com',
      },
    },
    update: {},
    create: {
      username: 'sakura',
      displayName: '桜美咲',
      server: 'fedibird.com',
      platform: 'mastodon',
      avatar: 'https://via.placeholder.com/150?text=S',
      lastTermsAcceptedAt: new Date(),
    },
  })

  const mastodonUser3 = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'yamamoto',
        server: 'pawoo.net',
      },
    },
    update: {},
    create: {
      username: 'yamamoto',
      displayName: '山本健二',
      server: 'pawoo.net',
      platform: 'mastodon',
      avatar: 'https://via.placeholder.com/150?text=Y',
      lastTermsAcceptedAt: new Date(),
    },
  })

  // Misskeyユーザー 3人
  const misskeyUser1 = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'suzuki',
        server: 'misskey.io',
      },
    },
    update: {},
    create: {
      username: 'suzuki',
      displayName: '鈴木花子🌸',
      server: 'misskey.io',
      platform: 'misskey',
      avatar: 'https://via.placeholder.com/150?text=Sz',
      lastTermsAcceptedAt: new Date(),
    },
  })

  const misskeyUser2 = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'sato',
        server: 'misskey.dev',
      },
    },
    update: {},
    create: {
      username: 'sato',
      displayName: '佐藤翔',
      server: 'misskey.dev',
      platform: 'misskey',
      avatar: 'https://via.placeholder.com/150?text=St',
      lastTermsAcceptedAt: new Date(),
    },
  })

  const misskeyUser3 = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'watanabe',
        server: 'nijimiss.moe',
      },
    },
    update: {},
    create: {
      username: 'watanabe',
      displayName: '渡辺結衣🎮',
      server: 'nijimiss.moe',
      platform: 'misskey',
      avatar: 'https://via.placeholder.com/150?text=W',
      lastTermsAcceptedAt: new Date(),
    },
  })

  // Pleromaユーザー 1人
  const pleromaUser = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'kobayashi',
        server: 'pleroma.soykaf.com',
      },
    },
    update: {},
    create: {
      username: 'kobayashi',
      displayName: '小林誠',
      server: 'pleroma.soykaf.com',
      platform: 'mastodon', // PleromaはMastodon互換API
      avatar: 'https://via.placeholder.com/150?text=K',
      lastTermsAcceptedAt: new Date(),
    },
  })

  // Discordユーザー 1人
  const discordUser = await prisma.user.upsert({
    where: {
      username_server: {
        username: 'nakamura',
        server: 'discord.com',
      },
    },
    update: {},
    create: {
      username: 'nakamura',
      displayName: '中村友美🎵',
      server: 'discord.com',
      platform: 'discord',
      avatar: 'https://via.placeholder.com/150?text=N',
      lastTermsAcceptedAt: new Date(),
    },
  })

  const allDummyUsers = [
    mastodonUser1,
    mastodonUser2,
    mastodonUser3,
    misskeyUser1,
    misskeyUser2,
    misskeyUser3,
    pleromaUser,
    discordUser,
  ]

  console.log(`Created ${allDummyUsers.length} dummy users`)

  // 今日から1ヶ月後の日付を基準に
  const futureDate = (daysFromNow: number) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromNow)
    return date
  }

  // イベント1: 全員参加のイベント
  const event1 = await prisma.event.create({
    data: {
      title: 'Fediverse新年オフ会2025',
      description: `# Fediverse新年オフ会2025 🎉

みなさん、新年あけましておめでとうございます！
Fediverseの仲間で集まって、楽しくオフ会をしましょう！

## 内容
- 自己紹介タイム
- フリートーク
- 参加者同士の交流
- ビンゴ大会（景品あり！）

## 持ち物
- 名刺（任意）
- 交流したい気持ち

初参加の方も大歓迎です！お気軽にどうぞ！`,
      startDate: futureDate(30),
      startTime: '14:00',
      endDate: futureDate(30),
      endTime: '18:00',
      location: '東京都新宿区 カフェ「Fediverse」',
      maxParticipants: 50,
      isPublic: true,
      allowMaybe: true,
      fee: '1500円（ドリンク代込み）',
      terms: '・他の参加者への迷惑行為は禁止です\n・写真撮影は許可を取ってから行ってください\n・当日キャンセルはなるべく避けてください',
      creatorId: alice.id,
    },
  })

  // イベント2: 様々なステータスのイベント
  const event2 = await prisma.event.create({
    data: {
      title: 'プログラミング勉強会 #12',
      description: `# プログラミング勉強会 #12

## テーマ
今回のテーマは「Webフロントエンド最新動向2025」です。

## 内容
- React/Vue/Svelteの最新情報
- 新しいフレームワークの紹介
- ハンズオンセッション
- LT大会（希望者）

## 対象者
- プログラミングに興味がある方
- 初心者〜中級者向け

オンラインでも参加可能です！`,
      startDate: futureDate(45),
      startTime: '13:00',
      endDate: futureDate(45),
      endTime: '17:00',
      location: '東京都渋谷区 コワーキングスペース「TechHub」',
      maxParticipants: 30,
      isPublic: true,
      allowMaybe: true,
      fee: '無料',
      registrationDeadlineDate: futureDate(40),
      registrationDeadlineTime: '23:59',
      terms: '・Wi-Fi環境があります\n・PC持参推奨です',
      creatorId: alice.id,
    },
  })

  // イベント3: 参加登録なしのイベント
  const event3 = await prisma.event.create({
    data: {
      title: '花見オフ2025🌸',
      description: `# お花見オフ会2025 🌸

春のお花見オフ会を開催します！

## 場所
代々木公園（詳細な場所は参加者にお知らせします）

## 持ち寄り歓迎
- 飲み物
- お菓子
- おつまみ

雨天の場合は延期します。`,
      startDate: futureDate(90),
      startTime: '11:00',
      endDate: futureDate(90),
      endTime: '15:00',
      location: '代々木公園',
      maxParticipants: 20,
      isPublic: true,
      allowMaybe: true,
      fee: '各自持ち寄り',
      creatorId: alice.id,
    },
  })

  console.log('Created 3 events')

  // イベント1: 全員参加登録
  for (const user of allDummyUsers) {
    await prisma.eventParticipant.upsert({
      where: {
        eventId_userId: {
          eventId: event1.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        eventId: event1.id,
        userId: user.id,
        status: 'attending',
        comment: `参加します！楽しみにしています。 from ${user.server}`,
        termsAccepted: true,
      },
    })
  }
  console.log('All 8 users registered for Event 1')

  // イベント2: 様々なステータス
  const statuses = [
    { user: mastodonUser1, status: 'attending', comment: '絶対参加します！LTやりたいです' },
    { user: mastodonUser2, status: 'attending', comment: '楽しみにしています！' },
    { user: mastodonUser3, status: 'maybe', comment: '仕事の都合で未定ですが、なるべく参加したいです' },
    { user: misskeyUser1, status: 'maybe', comment: '予定調整中です' },
    { user: misskeyUser2, status: 'not_attending', comment: '残念ですが、その日は別の予定があります' },
    { user: misskeyUser3, status: 'attending', comment: 'オンラインで参加予定です！' },
    { user: pleromaUser, status: 'cancelled', comment: '急用ができてしまいました...', cancellationReason: 'user_cancelled' },
    { user: discordUser, status: 'participation_request', comment: '参加リクエストです。初めてですがよろしくお願いします' },
  ]

  for (const { user, status, comment, cancellationReason } of statuses) {
    await prisma.eventParticipant.upsert({
      where: {
        eventId_userId: {
          eventId: event2.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        eventId: event2.id,
        userId: user.id,
        status,
        comment,
        termsAccepted: status !== 'participation_request',
        cancellationReason,
      },
    })
  }
  console.log('Various statuses set for Event 2')

  // 日程調整（PreEvent）を3つ作成

  const preEvent1 = await prisma.preEvent.create({
    data: {
      title: 'ボードゲーム会日程調整',
      description: `# ボードゲーム会

みんなでボードゲームを楽しみましょう！
参加可能な日程に回答をお願いします。

## 候補ゲーム
- カタン
- 人狼
- コードネーム
- など

リクエストがあれば教えてください！`,
      location: '渋谷のボードゲームカフェ',
      fee: '2000円程度',
      isAllowedForFediverse: true,
      isAllowedForDiscord: true,
      isPublic: true,
      creatorId: alice.id,
    },
  })

  // PreEvent1の日程オプション
  const preEvent1Dates = [
    { startDate: futureDate(14), endDate: null },
    { startDate: futureDate(21), endDate: null },
    { startDate: futureDate(28), endDate: null },
  ]

  for (let i = 0; i < preEvent1Dates.length; i++) {
    await prisma.preEventDateOption.create({
      data: {
        preEventId: preEvent1.id,
        startDate: preEvent1Dates[i].startDate,
        displayOrder: i,
      },
    })
  }

  const preEvent2 = await prisma.preEvent.create({
    data: {
      title: '映画鑑賞会スケジュール',
      description: `# 映画鑑賞会

新作映画を一緒に観に行きませんか？

## 候補作品
参加者と相談して決めましょう！

## 場所
都内の映画館を予定`,
      location: '都内映画館',
      fee: '各自チケット代',
      isAllowedForFediverse: true,
      isAllowedForDiscord: false,
      isPublic: true,
      creatorId: alice.id,
    },
  })

  // PreEvent2の日程オプション
  const preEvent2Dates = [
    { startDate: futureDate(7), endDate: null },
    { startDate: futureDate(14), endDate: null },
  ]

  for (let i = 0; i < preEvent2Dates.length; i++) {
    await prisma.preEventDateOption.create({
      data: {
        preEventId: preEvent2.id,
        startDate: preEvent2Dates[i].startDate,
        displayOrder: i,
      },
    })
  }

  const preEvent3 = await prisma.preEvent.create({
    data: {
      title: 'オンライン飲み会日程調整🍻',
      description: `# オンライン飲み会

気軽にオンラインで飲みながら雑談しましょう！

## 時間
20:00〜22:00くらいを予定

## ツール
Discord or Zoomを予定`,
      isAllowedForFediverse: true,
      isAllowedForDiscord: true,
      isPublic: true,
      creatorId: alice.id,
    },
  })

  // PreEvent3の日程オプション（4つ）
  const preEvent3Dates = [
    { startDate: futureDate(3) },
    { startDate: futureDate(5) },
    { startDate: futureDate(10) },
    { startDate: futureDate(12) },
  ]

  for (let i = 0; i < preEvent3Dates.length; i++) {
    await prisma.preEventDateOption.create({
      data: {
        preEventId: preEvent3.id,
        startDate: preEvent3Dates[i].startDate,
        displayOrder: i,
      },
    })
  }

  console.log('Created 3 PreEvents (日程調整)')

  // 日程調整への参加登録（一部のユーザー）
  const preEvent1DateOptions = await prisma.preEventDateOption.findMany({
    where: { preEventId: preEvent1.id },
    orderBy: { displayOrder: 'asc' },
  })

  // PreEvent1への回答
  const preEvent1Responses = [
    { user: mastodonUser1, responses: ['available', 'maybe', 'unavailable'] },
    { user: misskeyUser1, responses: ['available', 'available', 'maybe'] },
    { user: misskeyUser2, responses: ['unavailable', 'available', 'available'] },
    { user: discordUser, responses: ['maybe', 'maybe', 'available'] },
  ]

  for (const { user, responses } of preEvent1Responses) {
    for (let i = 0; i < responses.length; i++) {
      await prisma.preEventParticipant.upsert({
        where: {
          preEventId_userId_dateOptionId: {
            preEventId: preEvent1.id,
            userId: user.id,
            dateOptionId: preEvent1DateOptions[i].id,
          },
        },
        update: {},
        create: {
          preEventId: preEvent1.id,
          userId: user.id,
          dateOptionId: preEvent1DateOptions[i].id,
          status: responses[i],
        },
      })
    }
  }

  console.log('Added responses to PreEvent 1')

  console.log('')
  console.log('=== Dummy Data Creation Complete ===')
  console.log('')
  console.log('Created Users:')
  console.log('  Mastodon:')
  console.log(`    - tanaka@mastodon.social`)
  console.log(`    - sakura@fedibird.com`)
  console.log(`    - yamamoto@pawoo.net`)
  console.log('  Misskey:')
  console.log(`    - suzuki@misskey.io`)
  console.log(`    - sato@misskey.dev`)
  console.log(`    - watanabe@nijimiss.moe`)
  console.log('  Pleroma:')
  console.log(`    - kobayashi@pleroma.soykaf.com`)
  console.log('  Discord:')
  console.log(`    - nakamura@discord.com`)
  console.log('')
  console.log('Created Events (主催: Alice):')
  console.log(`  1. ${event1.title} - 全員参加登録済み`)
  console.log(`  2. ${event2.title} - 様々なステータス`)
  console.log(`  3. ${event3.title} - 参加登録なし`)
  console.log('')
  console.log('Created PreEvents (日程調整):')
  console.log(`  1. ${preEvent1.title}`)
  console.log(`  2. ${preEvent2.title}`)
  console.log(`  3. ${preEvent3.title}`)
  console.log('')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
