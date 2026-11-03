import { prisma } from './client'


async function main() {
  // テストユーザーを作成
  const alice = await prisma.user.create({
    data: {
      username: 'alice',
      displayName: 'Alice (主催者)',
      server: 'mastodon.social',
      platform: 'mastodon',
      avatar: '/default-avatar.svg',
    },
  })

  const bob = await prisma.user.create({
    data: {
      username: 'bob',
      displayName: 'Bob (参加者)',
      server: 'handon.club',
      platform: 'mastodon',
      avatar: '/default-avatar.svg',
    },
  })

  const charlie = await prisma.user.create({
    data: {
      username: 'charlie',
      displayName: 'Charlie (観察者)',
      server: 'fedibird.com',
      platform: 'mastodon',
      avatar: '/default-avatar.svg',
    },
  })

  // テストイベントを作成
  const event1 = await prisma.event.create({
    data: {
      title: 'Next.js 15勉強会',
      description: `# Next.js 15の新機能について学ぼう！

## 内容
- App Routerの最新機能
- Server Actionsの活用方法
- パフォーマンス最適化のコツ

## 対象者
- Next.jsの基本的な知識がある方
- React 18以降を使ったことがある方

## 持ち物
- ノートPC
- やる気

お気軽にご参加ください！`,
      startDate: new Date('2025-01-15T10:00:00Z'),
      startTime: '10:00',
      endDate: new Date('2025-01-15T17:00:00Z'),
      endTime: '17:00',
      location: '東京都渋谷区某所',
      maxParticipants: 25,
      isPublic: true,
      allowMaybe: true,
      fee: '1000円（昼食代込み）',
      relatedUrl: 'https://nextjs.org/',
      terms: 'イベント参加にあたり、以下の規約にご同意ください：\n・写真撮影・SNS投稿は主催者の許可を得てから行ってください\n・他の参加者への迷惑行為は禁止です\n・キャンセルは前日までにお願いします',
      creatorId: alice.id,
    },
  })

  // オプショングループ付きのイベント
  const event2 = await prisma.event.create({
    data: {
      title: '新年会 2025 🎉',
      description: `# 新年あけましておめでとうございます！

今年もよろしくお願いします！みんなでわいわい楽しく新年を祝いましょう。

## 会場
新宿の居酒屋を予定しています。詳細は参加者に個別にお知らせします。

## タイムスケジュール
- 18:00 開始
- 18:30 乾杯
- 20:30 一次会終了
- 21:00 二次会（希望者のみ）

## 注意事項
- 飲み放題プランの選択をお願いします
- アレルギーがある方は事前にお知らせください`,
      startDate: new Date('2025-01-11T18:00:00Z'),
      startTime: '18:00',
      endDate: new Date('2025-01-11T23:00:00Z'),
      endTime: '23:00',
      location: '新宿某居酒屋',
      maxParticipants: 30,
      isPublic: true,
      allowMaybe: true,
      fee: '飲み放題プランにより異なります',
      registrationDeadlineDate: new Date('2025-01-09T23:59:00Z'),
      registrationDeadlineTime: '23:59',
      terms: '未成年の方の参加はご遠慮ください。\n当日の飲酒運転は絶対に禁止です。',
      creatorId: alice.id,
    },
  })

  // 3つ目のイベント（限定公開）
  const event3 = await prisma.event.create({
    data: {
      title: 'TypeScript深掘り勉強会（上級者向け）',
      description: `# TypeScript上級者向け勉強会

## 内容
- 型レベルプログラミング
- Template Literal Typesの活用
- Conditional Typesの実践的な使い方
- パフォーマンスを考慮した型設計

## 前提知識
- TypeScriptの基本文法を理解している
- Genericsを使った経験がある
- 実際のプロジェクトでTypeScriptを使用している

**初心者の方はまず基礎勉強会にご参加ください。**`,
      startDate: new Date('2025-02-08T14:00:00Z'),
      startTime: '14:00',
      endDate: new Date('2025-02-08T18:00:00Z'),
      endTime: '18:00',
      location: 'オンライン（Zoom）',
      maxParticipants: 15,
      isPublic: false,
      allowMaybe: false,
      isAllowedForFediverse: true,
      isAllowedForDiscord: false,
      allowedFediverseServers: JSON.stringify(['mastodon.social', 'handon.club']),
      fee: '無料',
      relatedUrl: 'https://www.typescriptlang.org/',
      creatorId: alice.id,
    },
  })

  // オプショングループ1: 飲み放題プラン
  const drinkGroup = await prisma.eventOptionGroup.create({
    data: {
      eventId: event2.id,
      title: '飲み放題プラン',
      responseType: 'single',
      displayOrder: 0,
    },
  })

  await prisma.eventOption.createMany({
    data: [
      {
        eventId: event2.id,
        groupId: drinkGroup.id,
        name: 'アルコール飲み放題',
        maxParticipants: null,
        displayOrder: 0,
      },
      {
        eventId: event2.id,
        groupId: drinkGroup.id,
        name: 'ソフトドリンク飲み放題',
        maxParticipants: null,
        displayOrder: 1,
      },
      {
        eventId: event2.id,
        groupId: drinkGroup.id,
        name: '単品注文',
        maxParticipants: null,
        displayOrder: 2,
      },
    ],
  })

  // オプショングループ2: 記念品
  const souvenirGroup = await prisma.eventOptionGroup.create({
    data: {
      eventId: event2.id,
      title: '記念品',
      responseType: 'multiple',
      displayOrder: 1,
    },
  })

  await prisma.eventOption.createMany({
    data: [
      {
        eventId: event2.id,
        groupId: souvenirGroup.id,
        name: 'オリジナルTシャツ',
        maxParticipants: 30,
        displayOrder: 0,
      },
      {
        eventId: event2.id,
        groupId: souvenirGroup.id,
        name: 'ステッカーセット',
        maxParticipants: null,
        displayOrder: 1,
      },
    ],
  })

  // イベント1の参加者データ
  await prisma.eventParticipant.create({
    data: {
      eventId: event1.id,
      userId: bob.id,
      status: 'attending',
      comment: 'Next.js 15の新機能、とても楽しみです！App Routerについて詳しく学びたいです。',
      termsAccepted: true,
    },
  })

  await prisma.eventParticipant.create({
    data: {
      eventId: event1.id,
      userId: charlie.id,
      status: 'maybe',
      comment: '参加したいのですが、仕事の都合で未定です。当日の朝に連絡します。',
      termsAccepted: true,
    },
  })

  // イベント2の参加者データとオプション選択
  const event2Participant1 = await prisma.eventParticipant.create({
    data: {
      eventId: event2.id,
      userId: bob.id,
      status: 'attending',
      comment: '新年会楽しみです！今年もよろしくお願いします🎉',
      termsAccepted: true,
    },
  })

  const event2Participant2 = await prisma.eventParticipant.create({
    data: {
      eventId: event2.id,
      userId: charlie.id,
      status: 'attending',
      comment: 'お疲れさまでした！今年も楽しくやっていきましょう！',
      termsAccepted: true,
    },
  })

  // オプション選択データを追加
  const drinkOptions = await prisma.eventOption.findMany({
    where: { eventId: event2.id, groupId: drinkGroup.id }
  })
  const souvenirOptions = await prisma.eventOption.findMany({
    where: { eventId: event2.id, groupId: souvenirGroup.id }
  })

  // Bobの選択：アルコール飲み放題 + オリジナルTシャツ
  await prisma.participantGroupSelection.create({
    data: {
      participantId: event2Participant1.id,
      groupId: drinkGroup.id,
      options: {
        create: {
          optionId: drinkOptions.find(o => o.name === 'アルコール飲み放題')!.id
        }
      }
    }
  })

  await prisma.participantGroupSelection.create({
    data: {
      participantId: event2Participant1.id,
      groupId: souvenirGroup.id,
      options: {
        create: {
          optionId: souvenirOptions.find(o => o.name === 'オリジナルTシャツ')!.id
        }
      }
    }
  })

  // Charlieの選択：ソフトドリンク飲み放題 + ステッカーセット
  await prisma.participantGroupSelection.create({
    data: {
      participantId: event2Participant2.id,
      groupId: drinkGroup.id,
      options: {
        create: {
          optionId: drinkOptions.find(o => o.name === 'ソフトドリンク飲み放題')!.id
        }
      }
    }
  })

  await prisma.participantGroupSelection.create({
    data: {
      participantId: event2Participant2.id,
      groupId: souvenirGroup.id,
      options: {
        create: {
          optionId: souvenirOptions.find(o => o.name === 'ステッカーセット')!.id
        }
      }
    }
  })

  // イベント3の参加者データ（限定公開イベント）
  await prisma.eventParticipant.create({
    data: {
      eventId: event3.id,
      userId: bob.id,
      status: 'attending',
      comment: 'TypeScriptの型レベルプログラミング、勉強させていただきます！',
      termsAccepted: true,
    },
  })

  console.log('Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })