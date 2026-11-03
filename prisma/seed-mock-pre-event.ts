/**
 * モックの日程調整を作る。
 *
 *   npm run seed:mock-pre-event
 *
 * 既存データは候補日がすべて過去（E2Eテストの残骸）で、一覧にも詳細にも
 * 何も出ない。候補日・回答・締切を一通り持たせた確認用のデータを作る。
 * 何度実行しても同じ状態になる。
 */
import { prisma } from './client'


const PRE_EVENT_ID = 'mock-pre-event-2026'

/** 回答者。日程ごとに ○△× を散らして、集計と表示を確認できるようにする */
const RESPONDENTS = [
  { username: 'mockhost', display: 'はん', votes: ['available', 'available', 'maybe'] },
  { username: 'mocksakura', display: 'さくら', votes: ['available', 'unavailable', 'available'] },
  { username: 'mocktaro', display: 'たろう', votes: ['maybe', 'available', 'available'] },
  { username: 'mockhanako', display: 'はなこ', votes: ['unavailable', 'available', 'available'] },
  { username: 'mockjiro', display: 'じろう', votes: ['available', 'maybe', 'unavailable'] },
  { username: 'mockyuki', display: 'ゆき', votes: ['available', 'available', 'available'] },
  { username: 'mockken', display: 'けん', votes: ['unavailable', 'unavailable', 'maybe'] },
]

/** 一覧の確認用。締切間近・候補1つだけ・回答ゼロ */
const LISTING = [
  {
    id: 'mock-pre-list-deadline',
    title: '【一覧確認】締切が3日後の日程調整',
    startInDays: [14, 21],
    deadlineInDays: 3,
  },
  {
    id: 'mock-pre-list-single',
    title: '【一覧確認】候補が1つだけの日程調整',
    startInDays: [10],
    deadlineInDays: null,
  },
  {
    id: 'mock-pre-list-empty',
    title: '【一覧確認】まだ誰も回答していない日程調整',
    startInDays: [30, 37, 44, 51],
    deadlineInDays: null,
  },
]

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000)
}

/** 19:00 JST に寄せる。時刻がバラバラだと表示の確認がしづらい */
function evening(days: number): Date {
  const d = daysFromNow(days)
  const jst = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return new Date(
    `${jst.toISOString().split('T')[0]}T19:00:00+09:00`
  )
}

async function main() {
  const ids = [PRE_EVENT_ID, ...LISTING.map((l) => l.id)]
  // 何度実行しても同じ状態になるよう、先に消してから作り直す
  await prisma.preEvent.deleteMany({ where: { id: { in: ids } } })

  const users = []
  for (const r of RESPONDENTS) {
    users.push(
      await prisma.user.upsert({
        where: { username_server: { username: r.username, server: 'handon.club' } },
        update: { displayName: r.display },
        create: {
          username: r.username,
          server: 'handon.club',
          displayName: r.display,
          platform: 'mastodon',
          lastTermsAcceptedAt: new Date(),
        },
      })
    )
  }
  const host = users[0]

  const preEvent = await prisma.preEvent.create({
    data: {
      id: PRE_EVENT_ID,
      title: '忘年会の日程を決めます',
      description: `## 候補は3日あります

都合のよい日に ○ を付けてください。**△でも構いません。**

| 日程 | 会場 |
|---|---|
| 1日目 | 渋谷 |
| 2日目 | 新宿 |
| 3日目 | 池袋 |

いちばん多い日で確定します。`,
      location: '渋谷区道玄坂1-2-3 サンプルビル 5F',
      fee: '5,000円程度',
      terms: `会場の予約があるため、確定後のキャンセルはご遠慮ください。

やむを得ない場合は主催者までご連絡ください。`,
      registrationDeadline: daysFromNow(10),
      allowAutoRegistration: true,
      isPublic: true,
      isHighlighted: true,
      isAllowedForFediverse: true,
      allowedFediverseServers: JSON.stringify([
        { server: 'handon.club', type: 'mastodon' },
        { server: 'mastodon.social', type: 'mastodon' },
      ]),
      creatorId: host.id,
      dateOptions: {
        create: [12, 19, 26].map((days, i) => ({
          startDate: evening(days),
          displayOrder: i,
        })),
      },
    },
    include: { dateOptions: { orderBy: { displayOrder: 'asc' } } },
  })

  for (const [i, r] of RESPONDENTS.entries()) {
    for (const [j, option] of preEvent.dateOptions.entries()) {
      await prisma.preEventParticipant.create({
        data: {
          preEventId: preEvent.id,
          userId: users[i].id,
          dateOptionId: option.id,
          status: r.votes[j],
          comment: i === 0 ? '主催です。よろしくお願いします！' : i === 2 ? '2日目が第一希望です' : null,
          autoRegisterWhenPromoted: i % 2 === 0,
        },
      })
    }
  }

  for (const l of LISTING) {
    await prisma.preEvent.create({
      data: {
        id: l.id,
        title: l.title,
        description: '一覧カードの表示確認用。',
        isPublic: true,
        isHighlighted: true,
        isAllowedForFediverse: true,
        registrationDeadline: l.deadlineInDays == null ? null : daysFromNow(l.deadlineInDays),
        creatorId: host.id,
        dateOptions: {
          create: l.startInDays.map((days, i) => ({
            startDate: evening(days),
            displayOrder: i,
          })),
        },
      },
    })
  }

  console.log(`作成しました: /pre-events/${preEvent.id}`)
  console.log(`  候補 ${preEvent.dateOptions.length}日 / 回答 ${RESPONDENTS.length}人`)
  console.log('一覧の確認用: /pre-events')
  for (const l of LISTING) console.log(`  /pre-events/${l.id}  ${l.title}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
