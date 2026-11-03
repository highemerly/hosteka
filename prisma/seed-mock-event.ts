/**
 * モックと同じ見え方のテストイベントを作る。
 *
 *   npx tsx prisma/seed-mock-event.ts
 *
 * 参加者・オプショングループ・参加規約・サーバー制限を一通り持たせてある。
 * 実データでしか出ない崩れ（名前の長さ、コメントの有無、選択肢の定員）を
 * 確認するためのもの。何度実行しても同じ状態になる。
 */
import { prisma } from './client'


const EVENT_ID = 'mock-event-fediverse-2026'

/**
 * 参加条件バッジの見え方を確認するための派生イベント。
 * プラットフォーム制限とサーバー限定は独立に効くので、
 * 組み合わせごとに実物が要る。
 */
const VARIANTS = [
  {
    id: 'mock-event-cond-fediverse',
    title: '【条件確認】Fediverse のみ',
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowedFediverseServers: null,
  },
  {
    id: 'mock-event-cond-all-but-discord',
    title: '【条件確認】Fediverse と X',
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: true,
    allowedFediverseServers: null,
  },
  {
    id: 'mock-event-cond-x-plus-servers',
    title: '【条件確認】Mastodon 2サーバー ＋ X',
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: true,
    allowedFediverseServers: JSON.stringify([
      { server: 'handon.club', type: 'mastodon' },
      { server: 'mastodon.social', type: 'mastodon' },
    ]),
  },
  {
    id: 'mock-event-cond-mixed-servers',
    title: '【条件確認】Mastodon と Misskey のサーバー混在',
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    allowedFediverseServers: JSON.stringify([
      { server: 'handon.club', type: 'mastodon' },
      { server: 'misskey.io', type: 'misskey' },
      { server: 'mastodon.social', type: 'mastodon' },
    ]),
  },
  {
    id: 'mock-event-cond-legacy-servers',
    title: '【条件確認】旧形式のサーバー限定（種別不明）',
    isAllowedForFediverse: true,
    isAllowedForDiscord: false,
    isAllowedForTwitter: false,
    // 種別を持たない旧データ。3実装とも出るのが正しい
    allowedFediverseServers: JSON.stringify(['handon.club', 'mastodon.social']),
  },
  {
    id: 'mock-event-cond-discord',
    title: '【条件確認】Discord のみ',
    isAllowedForFediverse: false,
    isAllowedForDiscord: true,
    isAllowedForTwitter: false,
    allowedFediverseServers: null,
  },
  {
    id: 'mock-event-cond-none',
    title: '【条件確認】制限なし（バッジが出ないこと）',
    isAllowedForFediverse: true,
    isAllowedForDiscord: true,
    isAllowedForTwitter: true,
    allowedFediverseServers: null,
  },
]

const PARTICIPANTS = [
  { username: 'mockhost', display: 'はん', server: 'handon.club', status: 'attending', organizer: true, comment: '主催です。よろしくお願いします！' },
  { username: 'mocksakura', display: 'さくら', server: 'handon.club', status: 'attending', organizer: true, comment: '受付を担当します' },
  { username: 'mocktaro', display: 'たろう', server: 'mastodon.social', status: 'attending', organizer: false, comment: '初参加です！' },
  { username: 'mockhanako', display: 'はなこ', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockjiro', display: 'じろう', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockyuki', display: 'ゆき', server: 'mastodon.social', status: 'maybe', organizer: false, comment: '仕事次第で参加します' },
  { username: 'mockken', display: 'けん', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockmidori', display: 'みどり', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mocksora', display: 'そら', server: 'mastodon.social', status: 'participation_request', organizer: false, comment: '空きが出たら参加したいです' },
  { username: 'mockaoi', display: 'あおい', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockriku', display: 'りく', server: 'mastodon.social', status: 'attending', organizer: false },
  { username: 'mocknagisa', display: 'なぎさ', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockkaede', display: 'かえで', server: 'handon.club', status: 'attending', organizer: false, comment: '楽しみにしています' },
  { username: 'mockshion', display: 'しおん', server: 'mastodon.social', status: 'attending', organizer: false },
  { username: 'mocktsubasa', display: 'つばさ', server: 'handon.club', status: 'maybe', organizer: false },
  { username: 'mockhinata', display: 'ひなた', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockmakoto', display: 'まこと', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockyuto', display: 'ゆうと', server: 'mastodon.social', status: 'attending', organizer: false },
  { username: 'mockren', display: 'れん', server: 'handon.club', status: 'attending', organizer: false },
  { username: 'mockkotone', display: 'ことね', server: 'handon.club', status: 'attending', organizer: false, comment: '初めて参加します' },
  { username: 'mocksota', display: 'そうた', server: 'handon.club', status: 'attending', organizer: false },
  // 参加以外の回答。折りたたみの中の見え方を確認するため
  { username: 'mockrei', display: 'れい', server: 'handon.club', status: 'not_attending', organizer: false, comment: 'その日は出張です' },
  { username: 'mockharu', display: 'はる', server: 'mastodon.social', status: 'not_attending', organizer: false },
  { username: 'mockmio', display: 'みお', server: 'handon.club', status: 'cancelled', organizer: false },
  { username: 'mockyui', display: 'ゆい', server: 'handon.club', status: 'cancelled', organizer: false, comment: '都合が悪くなりました' },
]

const OPTION_GROUPS = [
  {
    title: '懇親会',
    responseType: 'single',
    options: [
      { name: '参加する（+2,000円）', maxParticipants: 20 },
      { name: '参加しない', maxParticipants: null },
    ],
  },
  {
    title: '食事の希望',
    responseType: 'multiple',
    options: [
      { name: 'ベジタリアン', maxParticipants: null },
      { name: 'アレルギー対応あり', maxParticipants: null },
      { name: 'アルコールなし', maxParticipants: null },
    ],
  },
  {
    title: 'Tシャツのサイズ',
    responseType: 'single',
    options: [
      { name: 'S', maxParticipants: 5 },
      { name: 'M', maxParticipants: 15 },
      { name: 'L', maxParticipants: 15 },
      { name: '不要', maxParticipants: null },
    ],
  },
  // 自由入力。選択肢は持たず、回答は participantGroupSelection.textAnswer に入る
  {
    title: 'このイベントをどこで知りましたか',
    responseType: 'text',
    options: [],
  },
]

/**
 * 一覧画面の確認用。セクションごとに1件は入るようにしてある。
 * 一覧に出すので isHighlighted: true（条件確認用の派生は false のまま）。
 */
const LISTING = [
  {
    id: 'mock-list-deadline-soon',
    title: '【一覧確認】締切が3日後のイベント',
    startInDays: 10,
    deadlineInDays: 3,
    maxParticipants: 30,
    attendees: 6,
    location: '新宿区西新宿2-8-1',
    hashtags: ['もくもく会'],
    allowParticipationRequest: true,
  },
  {
    id: 'mock-list-almost-full',
    title: '【一覧確認】残席がわずかなイベント',
    startInDays: 14,
    deadlineInDays: 12,
    maxParticipants: 10,
    attendees: 9,
    location: 'オンライン',
    hashtags: ['LT大会', 'hosteka', 'fediverse'],
    allowParticipationRequest: true,
  },
  {
    id: 'mock-list-request',
    title: '【一覧確認】満員だが参加リクエストを受け付けるイベント',
    startInDays: 12,
    deadlineInDays: 10,
    maxParticipants: 8,
    attendees: 8,
    location: '千代田区丸の内1-1-1',
    hashtags: ['hosteka'],
    allowParticipationRequest: true,
  },
  {
    id: 'mock-list-closed',
    title: '【一覧確認】満員で受付を終了したイベント',
    startInDays: 12,
    deadlineInDays: 10,
    maxParticipants: 8,
    attendees: 8,
    location: '千代田区丸の内1-1-1',
    hashtags: ['hosteka'],
    allowParticipationRequest: false,
  },
  {
    id: 'mock-list-no-capacity',
    title: '【一覧確認】定員も締切もなく、タイトルがとても長いイベントの見え方を確認するためのもの',
    startInDays: 30,
    deadlineInDays: null,
    maxParticipants: null,
    attendees: 3,
    location: null,
    hashtags: [],
    allowParticipationRequest: true,
  },
]

/** 常に「今から先」になるよう相対で決める。固定日にすると時間が経つと終了扱いになる */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000)
}

async function main() {
  // 何度実行しても同じ状態になるよう、先に消してから作り直す
  await prisma.event.deleteMany({
    where: {
      id: { in: [EVENT_ID, ...VARIANTS.map((v) => v.id), ...LISTING.map((l) => l.id)] },
    },
  })

  const users = []
  for (const p of PARTICIPANTS) {
    users.push(
      await prisma.user.upsert({
        where: { username_server: { username: p.username, server: p.server } },
        update: { displayName: p.display },
        create: {
          username: p.username,
          server: p.server,
          displayName: p.display,
          platform: 'mastodon',
          lastTermsAcceptedAt: new Date(),
        },
      })
    )
  }

  const host = users[0]
  const start = daysFromNow(21)
  const deadline = daysFromNow(19)

  const event = await prisma.event.create({
    data: {
      id: EVENT_ID,
      title: 'Fediverse 交流会 2026 夏',
      description: `## 今年もやります

Fediverse で交流している人たちが**実際に集まる**会です。
初参加の方も歓迎します。

### タイムテーブル

| 時刻 | 内容 |
|---|---|
| 19:00 | 開場・受付 |
| 19:30 | 乾杯・自己紹介 |
| 20:30 | フリータイム |
| 21:45 | 記念撮影 |

:::details 会場へのアクセス
渋谷駅ハチ公口から徒歩7分です。1階がコンビニのビルの5階になります。
:::

参加費は当日会場でお支払いください。`,
      hashtags: JSON.stringify(['fediverse交流会', 'hosteka']),
      startDate: start,
      startTime: '19:00',
      hasStartTime: true,
      endDate: start,
      endTime: '22:00',
      hasEndTime: true,
      location: '渋谷区道玄坂1-2-3 サンプルビル 5F',
      fee: '3,000円（学生 1,500円）',
      relatedUrl: 'https://example.social/events/summer-2026',
      terms: `参加費は当日会場でお支払いください。当日キャンセルの場合もキャンセル料として全額を申し受けます。

会場での写真撮影を行い、後日 Fediverse 上に投稿する場合があります。写り込みを避けたい方は受付時にお申し出ください。

他の参加者に迷惑をかける行為があった方は、参加をお断りする場合があります。`,
      maxParticipants: 40,
      registrationDeadlineDate: deadline,
      registrationDeadlineTime: '23:59',
      allowMaybe: true,
      allowParticipationRequest: true,
      isPublic: true,
      isHighlighted: true,
      isAllowedForFediverse: true,
      isAllowedForDiscord: false,
      isAllowedForTwitter: false,
      // 新形式（種別つき）。イベント作成APIが anypost.dev で引いて保存する形
      allowedFediverseServers: JSON.stringify([
        { server: 'handon.club', type: 'mastodon' },
        { server: 'mastodon.social', type: 'mastodon' },
      ]),
      creatorId: host.id,
    },
  })

  for (const [gi, g] of OPTION_GROUPS.entries()) {
    const group = await prisma.eventOptionGroup.create({
      data: {
        eventId: event.id,
        title: g.title,
        responseType: g.responseType,
        displayOrder: gi,
      },
    })
    for (const [oi, o] of g.options.entries()) {
      await prisma.eventOption.create({
        data: {
          eventId: event.id,
          groupId: group.id,
          name: o.name,
          maxParticipants: o.maxParticipants,
          displayOrder: oi,
        },
      })
    }
  }

  const options = await prisma.eventOption.findMany({ where: { eventId: event.id } })
  const byName = (name: string) => options.find((o) => o.name === name)!

  for (const [i, p] of PARTICIPANTS.entries()) {
    const participant = await prisma.eventParticipant.create({
      data: {
        eventId: event.id,
        userId: users[i].id,
        status: p.status,
        comment: p.comment ?? null,
        isOrganizer: p.organizer,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
      },
    })

    // 一部だけオプションを選ばせる。全員が選んでいると
    // 「選んでいない人」の見え方を確認できない
    if (i % 3 !== 2 && p.status === 'attending') {
      const group = await prisma.eventOptionGroup.findFirst({
        where: { eventId: event.id, title: '懇親会' },
      })
      if (group) {
        const selection = await prisma.participantGroupSelection.create({
          data: { participantId: participant.id, groupId: group.id },
        })
        await prisma.participantGroupOption.create({
          data: {
            selectionId: selection.id,
            optionId: byName(i % 2 === 0 ? '参加する（+2,000円）' : '参加しない').id,
          },
        })
      }

      // 自由入力も一部だけ。空欄のままの人が混ざった見え方を確かめる
      const textGroup = await prisma.eventOptionGroup.findFirst({
        where: { eventId: event.id, responseType: 'text' },
      })
      if (textGroup && i % 2 === 0) {
        await prisma.participantGroupSelection.create({
          data: {
            participantId: participant.id,
            groupId: textGroup.id,
            textAnswer: i % 4 === 0 ? '主催者のポストを見て' : '友人に誘われて',
          },
        })
      }
    }
  }

  for (const v of VARIANTS) {
    await prisma.event.create({
      data: {
        id: v.id,
        title: v.title,
        description: '参加条件バッジの表示確認用。バッジ以外は最小構成にしてある。',
        hashtags: JSON.stringify([]),
        startDate: start,
        startTime: '19:00',
        hasStartTime: true,
        isPublic: true,
        isHighlighted: false,
        isAllowedForFediverse: v.isAllowedForFediverse,
        isAllowedForDiscord: v.isAllowedForDiscord,
        isAllowedForTwitter: v.isAllowedForTwitter,
        allowedFediverseServers: v.allowedFediverseServers,
        creatorId: host.id,
      },
    })
  }

  for (const l of LISTING) {
    const listed = await prisma.event.create({
      data: {
        id: l.id,
        title: l.title,
        description: '一覧カードの表示確認用。',
        hashtags: JSON.stringify(l.hashtags),
        startDate: daysFromNow(l.startInDays),
        startTime: '19:00',
        hasStartTime: true,
        endDate: daysFromNow(l.startInDays),
        endTime: '21:00',
        hasEndTime: true,
        location: l.location,
        maxParticipants: l.maxParticipants,
        registrationDeadlineDate:
          l.deadlineInDays == null ? null : daysFromNow(l.deadlineInDays),
        registrationDeadlineTime: l.deadlineInDays == null ? null : '23:59',
        allowMaybe: true,
        allowParticipationRequest: l.allowParticipationRequest,
        isPublic: true,
        isHighlighted: true,
        creatorId: host.id,
      },
    })
    // 参加者はアバターの重なりと人数表示の確認用
    for (let i = 0; i < l.attendees; i++) {
      await prisma.eventParticipant.create({
        data: { eventId: listed.id, userId: users[i + 1].id, status: 'attending' },
      })
    }
  }

  console.log(`作成しました: /events/${event.id}`)
  console.log(`  参加者 ${PARTICIPANTS.length}人 / オプション ${OPTION_GROUPS.length}グループ`)
  console.log(`  開催日 ${start.toISOString().split('T')[0]} / 締切 ${deadline.toISOString().split('T')[0]}`)
  console.log('一覧カードの確認用: /events')
  for (const l of LISTING) console.log(`  /events/${l.id}  ${l.title.slice(0, 30)}`)
  console.log('参加条件バッジの確認用:')
  for (const v of VARIANTS) console.log(`  /events/${v.id}  ${v.title}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
