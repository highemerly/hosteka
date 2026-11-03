import type { ReactNode } from 'react'
import Link from 'next/link'

import { DataTable } from '@/components/content/DataTable'

/**
 * よくある質問の中身。
 *
 * **画面と別のファイルに置く。** 質問を足すのはたいてい文章を書く作業で、
 * 折りたたみの実装を読みながらやることではない。
 */
export type FAQItem = {
  id: string
  question: string
  answer: ReactNode
}

export type FAQCategory = {
  id: string
  title: string
  /** 目次に出す代表質問。**そのカテゴリに何が書いてあるか**を1問で示す */
  exampleQuestionId: string
  questions: FAQItem[]
}

export const FAQ_CATEGORIES: FAQCategory[] = [
  {
    id: 'basic',
    title: '一般',
    exampleQuestionId: 'supported-platforms',
    questions: [
      {
        id: 'what-is-hosteka',
        question: 'Hosteka（ホステカ）とはなんですか？',
        answer: 'MastodonやMisskeyなどでログインし利用できるイベント参加者の募集・管理プラットフォームです。アカウント登録なく利用でき、イベント主催者に優しい設計になっています。'
      },
      {
        id: 'what-is-hostekas-benefit',
        question: 'Hosteka は他のサイトと何が違いますか？',
        answer: <>運営者の過去のイベント主催の経験から、イベント主催者の負荷を減らすことを重要視した設計としています。よろしければ、<Link href="https://highemerly.hatenadiary.jp/entry/release-hosteka" className="text-primary hover:underline">運営者のブログ</Link>もご参照ください。</>
      },
      {
        id: 'supported-platforms',
        question: 'どのアカウントでログインできますか？',
        answer: 'Mastodon、Misskey、Pleroma、X (旧Twitter)、Discord をサポートしています。ただし、プラットフォーム毎に利用できる機能が若干異なり、最も利用できる機能が充実しているのはMastodonです。X と Discord では一部機能が利用できません。'
      },
      {
        id: 'x-support',
        question: 'X (旧Twitter）でログインできますか？',
        answer: 'はい。ただし、Hosteka から X へ直接投稿することはできないため、参加者への連絡は X の投稿画面へ移動して自分で投稿する形になります。'
      },
      {
        id: 'how-to-create-account',
        question: 'Hosteka 用のアカウントはどのように作成しますか？',
        answer: 'Hosteka 用に新規アカウントを作成する必要はありません。既にお持ちの Mastodon、Misskey、Pleroma、X、Discord アカウントでそのままログインできます。'
      },
      {
        id: 'who-is-admin',
        question: '誰が運営していますか？',
        answer: <><Link href="https://highemerly.net/contact.html" className="text-primary hover:underline">はん(highemerly)</Link>が個人で運営しています。</>
      },
      {
        id: 'fee',
        question: 'Hostekaを利用するのに費用はかかりますか？',
        answer: 'いいえ。主催者・参加者ともに無料です。ただし、イベント主催者に対しての費用の支払いについては発生することがありますので、イベント主催者へお問い合わせください。'
      },
      {
        id: 'diff-events-and-pre-events',
        question: '「イベント」と「日程調整」の違いはなんですか？',
        answer: '「イベント」は開催日程が決まっているイベントの参加者を募るために利用できます。一方、「日程調整」は、まだ日程が決まっていないイベントで、あらかじめ友人などに参加可否の都合を聞きたい場合に利用できます。'
      },
      {
        id: 'bug-report',
        question: '不具合があります。',
        answer: <>しばらく待ってから再度アクセスしてみてください。何度も再発する場合、<Link href="https://highemerly.net/contact.html" className="text-primary hover:underline">管理者</Link>までご連絡ください。</>
      },
      {
        id: 'down-detector',
        question: 'サービスが落ちています。',
        answer: <>しばらく待ってから再度アクセスしてみてください。<Link href="https://status.highemerly.net/#hosteka" className="text-primary hover:underline">運営ステータス</Link>もご参照ください。</>
      },
    ]
  },
  {
    id: 'events-create',
    title: 'イベントの主催（作成・編集）',
    exampleQuestionId: 'event-private',
    questions: [
      {
        id: 'event-rules',
        question: 'イベントの参加規約は後から変更できますか？',
        answer: 'まだ誰も参加登録していない間は変更できます。1人でも参加登録すると変更できなくなります（削除はできます）。登録済みの参加者は現行の参加規約に同意しており、そのユーザーたちに新しい参加規約に同意してもらうことが難しいためです。日程調整も同じで、1人でも回答すると変更できなくなります。どうしても追記が必要な場合、あとから変更可能な「詳細説明文」欄に注意事項を追記するか、イベントの作り直しをご検討ください。'
      },
      {
        id: 'event-options',
        question: 'イベントの「オプション・アンケート」とは何ですか？どういうときに使うのですか？',
        answer: '参加者が参加登録する際に、出欠以外に回答してもらう質問を追加できます。回答の種類は「単一選択」「複数選択」「自由入力」から選べ、選択肢ごとに定員も設定できます。たとえば、飲み放題付きプランの会食を主催する場合、「ドリンクプラン」という見出しを作成し、選択肢に「アルコール飲み放題」「ソフトドリンク飲み放題」を設定すれば、事前にドリンクプランの予約が可能となります。'
      },
      {
        id: 'event-mandatry',
        question: 'イベント作成時の必須項目はなんですか？',
        answer: 'イベント名と開催日のみです。他の項目はあとから編集できますが、参加規約だけは、参加登録した人ができたあとは変更できません。'
      },
      {
        id: 'event-private',
        question: 'プライベートなイベントを作成したいのですが、イベントを作成すると公開されてしまいますか？ 第三者に私のイベントを見つけられてしまいますか？',
        answer: '初期設定では公開されますので、イベントの作成・編集画面の「高度な設定」で、以下2点をオンにしてください。\n(1) 「ログインユーザーのみが閲覧できるようにする」･･･ログインしていない人はイベントページを開けなくなり、検索エンジンやAIクローラーなどのBotに捕捉されにくくなります。\n(2) 「Hosteka のイベント一覧に載せない」･･･イベント一覧や検索、グループのページなどに表示されなくなり、リンクを知っているユーザーのみアクセスできるようになります。\nなお、この設定を行っても、リンクを知っているログインユーザーはアクセスできてしまいます。SNSなどで告知する際には十分ご注意ください。日程調整でも同じ設定ができます。'
      },
      {
        id: 'event-business',
        question: '営利目的のイベントは開催できますか？',
        answer: <>問題ありません。ただし、法令違反・性行為やわいせつな行為・宗教活動・宗教団体への勧誘・面識のない異性との出会いや交際を目的とする場合は開催できません。詳しくは、<Link href="/terms#prohibited" className="text-primary hover:underline">利用規約の禁止事項</Link>を参照してください。</>
      },
      {
        id: 'event-online',
        question: 'イベント以外の目的（同人誌の共著募集、オンラインゲームの固定メンバー募集、フラワースタンド企画募集など）で利用してもいいですか？',
        answer: <>問題ありません。ただし、法令違反・性行為やわいせつな行為・宗教活動・宗教団体への勧誘・面識のない異性との出会いや交際を目的とする場合は開催できません。詳しくは、<Link href="/terms#prohibited" className="text-primary hover:underline">利用規約の禁止事項</Link>を参照してください。</>
      },
      {
        id: 'event-fee-collection',
        question: 'イベントの参加費用を前払いさせることは可能ですか？',
        answer: 'Hosteka 上で費用を支払う仕組みはありません。イベント主催者が対応してください。'
      },
      {
        id: 'event-delete',
        question: '作成したイベントを削除できますか？',
        answer:
          'できません。参加者の記録ごと消えてしまうため、削除機能は廃止しました。受付を閉じたい場合はイベントを中止してください。中止しても参加者への連絡・出欠の記録・参加者のCSV出力は続けられます。',
      },
      {
        id: 'how-to-markdown',
        question: 'Markdownとはなんですか？Markdownの書き方がわかりません。',
        answer: <>簡単な記号を使って構造的な文章を記述する言語です。簡単な書き方ガイドを <Link href="/markdown-guide" className="text-primary hover:underline">Markdown記法ガイド</Link>に記載していますので、参照してください。</>
      },
      {
        id: 'inquery-cannot-participate',
        question: '参加登録期限を超過していないのに、参加登録ができないと言われました。',
        answer: '初期設定では、イベントを作成した人と同じプラットフォームのアカウントだけが参加登録できます。たとえば Fediverse アカウントで作成したイベントには、Discord や X のアカウントで参加登録できません。設定を変更するには、イベントの編集画面の「高度な設定」で「参加登録に利用できるプラットフォームをカスタマイズする」をオンにし、参加を受け付けるプラットフォームを選んでください。',
      },
      {
        id: 'account-organization',
        question: 'ログインに利用していた Fediverse サーバーが閉鎖されます。既存のイベントはどうなりますか？',
        answer: <>Fediverse サーバーが閉鎖されると、Hosteka にログインはできなくなりますが、既存のイベントなど Hosteka 側のデータは消えません。もし開催前のイベントがある場合は、<Link href="/dashboard/my-orgs" className="text-primary hover:underline">グループ</Link> 機能を活用してください（別の Fediverse サーバーに新しいアカウントを登録後、グループに新しいサーバーのアカウントを管理責任者として登録し、イベントをグループ名義にしてください。そうすると、新しいサーバーのアカウントでイベントの編集が可能です）。</>
      },
    ]
  },
  {
    id: 'events-manage',
    title: 'イベント参加者の管理',
    exampleQuestionId: 'scheduled_post',
    questions: [
      {
        id: 'cancel',
        question: '強制的にユーザーを参加させたり、キャンセルさせたりすることはできますか？',
        answer: 'ある特定ユーザーを強制的に参加させることはできません。しかし、参加登録済みの特定ユーザーをキャンセルさせることはできます。キャンセルさせることができるのは、主催者および幹事に限ります。「幹事メニュー」の「参加者を編集」をご活用ください。'
      },
      {
        id: 'ban-participants',
        question: '特定ユーザーの参加を拒否できますか？',
        answer: '残念ながら事前にブロックすることはできません。参加申請されたユーザーを主催者キャンセルとして扱うことはできます。「幹事メニュー」の「参加者を編集」をご活用ください。'
      },
      {
        id: 'contact-participants',
        question: '参加者に連絡できますか？',
        answer: 'Hosteka内での連絡はできず、各SNSを利用して連絡する必要があります。便利な方法をいくつか提供していますので、イベントページの「幹事メニュー」から、「参加者への連絡」をクリックしてご確認ください。なお、あなたがMastodonまたはMisskeyでログインしている場合、あなたのアカウントから投稿する「Hosteka から直接投稿」を利用できます。'
      },
      {
        id: 'scheduled_post',
        question: '参加者にリマインダーを設定することはできますか？',
        answer: 'あなたがMastodonアカウントでログインしていれば、できます。幹事メニューの「参加者への連絡」をクリックし、投稿方法で「Hosteka から直接投稿」を選んで「予約投稿」に切り替え、送る日時を指定してください。'
      },
      {
        id: 'scheduled_post_history',
        question: '設定している参加者へのリマインダーをあとから確認出来ますか？あとから変更できますか？',
        answer: 'マイページの「幹事向けメニュー」にある「予約投稿」で確認できます。変更は出来ませんが取り消しは可能です。変更が必要な場合、一度取り消して再度リマインダーを設定してください。'
      },
      {
        id: 'set-admin',
        question: '「幹事にする」とはなんですか？幹事になるとどうなりますか？',
        answer: <>
          幹事メニューは、主催者（＝イベント作成者）および幹事だけが利用できるようになっています。「参加者を編集」の画面で参加者の一部を「幹事にする」ことで、イベントの中止以外の幹事メニューを主催者と同じように操作できるようになります。
          <DataTable
            caption="主催者・幹事・参加者が使える機能の比較"
            head={['権限', '主催者', '幹事', '参加者']}
            rows={[
              ['イベントの編集', '○', '○', '×'],
              ['イベントの中止', '○', '×', '×'],
              ['参加者のキャンセル', '○', '○', '×'],
              ['幹事の指定・解除', '○', '○', '×'],
              ['出欠登録', '○', '○', '×'],
              ['参加者への連絡', '○', '○', '○'],
              ['参加者のCSV出力', '○', '○', '×'],
            ]}
          />
        </>
      },
      {
        id: 'absent',
        question: '幹事メニューの「出欠登録」機能とはなんですか？利用は必須ですか？',
        answer: '当日の参加者の出欠確認や会費徴収有無などを記録できる幹事専用の便利機能です。主催者および幹事だけが利用できます。利用は必須ではなく、使いたい場合のみご利用いただければ結構です。'
      },
    ]
  },
  {
    id: 'participation',
    title: 'イベントへの参加',
    exampleQuestionId: 'change-paticipate',
    questions: [
      {
        id: 'how-to-answer',
        question: 'アカウントを作らずにイベントに登録できますか？',
        answer: 'はい。お持ちのSNSアカウント（Mastodon、Misskey、Pleroma、X、Discordに限る）でログインすれば、Hostekaアカウントは作成不要です。'
      },
      {
        id: 'pendding',
        question: '「未定」と回答できますか？未定と回答した場合どうなりますか？',
        answer: 'できる場合とできない場合があります。主催者が「未定」回答を許容している場合のみ、「未定」を回答できます。なお、回答締切が設定されているイベントの場合、回答締切までに「参加」に変更しないと、自動的に「キャンセル」扱いとなりますのでご注意ください（回答締切が設定されていない場合は何も起こりません）。'
      },
      {
        id: 'change-paticipate',
        question: '回答は後から変更できますか？キャンセルできますか？',
        answer: 'はい。同じSNSアカウントでログインして回答を変更できます。キャンセルも可能です。ただし、回答締切が設定されているイベントの場合、回答締切までしか変更・キャンセルできません。それ以降の変更・キャンセルを希望の場合、主催者に相談してみてください。'
      },
      {
        id: 'cannot-paticipate-events',
        question: '参加ボタンが押せません。',
        answer: '1. SNSアカウントでログインしていますか？マイページへアクセスして確認してください。\n2. 幹事が設定した回答締切を過ぎていたり、定員オーバーしていたりする可能性があります。参加リクエストを送信するか、送信できない場合は主催者に問い合わせてみてください。\n3. 参加登録に利用できるプラットフォームやサーバーが限定されている可能性があります。別のSNSアカウントでログインして確認してみてください。'
      },
      {
        id: 'how-to-contact-creator',
        question: 'イベント主催者にどうやって連絡できますか？',
        answer: 'Hostekaでは連絡手段を用意していません。イベントページの「主催者へ連絡」から、主催者のSNSアカウント宛に連絡してみてください。'
      },
      {
        id: 'safe-events',
        question: 'Hostekaで開催されるイベントには参加しても安全ですか？',
        answer: 'ご自身で判断してください。Hostekaはイベントの内容を確認・関知していません。万が一トラブルが発生した場合でも、当事者間で解決をお願いします。'
      },
      {
        id: 'danger-events',
        question: '不適切なイベントを見つけました。どうしたらよいですか？',
        answer: '「利用規約に反する」イベントでしたら、是非通報をお願いします。ログインしていれば、イベントページの説明の下に「通報」ボタンがあります。\n一方で、「ご自身の趣味・思想に反する」イベントでしたら、参加しないことをお勧めします。'
      },
    ]
  },
  {
    id: 'organization',
    title: 'グループ',
    exampleQuestionId: 'how-to-organization',
    questions: [
      {
        id: 'what-is-organization',
        question: 'グループ機能とはなんですか？',
        answer: 'イベントや日程調整を複数人（複数アカウント）で管理するための機能です。グループは誰でも簡単に作成でき、イベントの共同運営だけでなく、そのグループに所属するイベントを一覧で表示させることも出来ます。'
      },
      {
        id: 'why-organization',
        question: 'グループ機能を使うメリットはなんですか？グループ機能を使わないとできないことはありますか？',
        answer: 'グループ機能を使うと、イベントをグルーピングして参加者が探しやすくなったり、複数アカウントでイベントを管理しやすくなったりするメリットがあります。グループを作らないとできないことはありません。'
      },
      {
        id: 'how-to-organization',
        question: 'グループ機能の使い方を教えてください。',
        answer: <> まず、<Link href="/dashboard/my-orgs" className="text-primary hover:underline">あなたのグループ</Link> 画面から「グループを作成」を押して、任意の名前を持つグループを作ります。その際、任意の管理者を何人でも追加できます。作成したのち、イベント・日程調整の作成または編集画面の「高度な設定」で「グループ名義で開催する」をオンにすると、グループ名義で開催できます。</>
      },
      {
        id: 'delete-account-of-organization-owner',
        question: 'グループの管理者のアカウントが削除された場合どうなりますか。',
        answer: '「管理責任者」は全ての権限を持っています。つまり、削除されたアカウント以外の「管理責任者」が存在すれば、特に問題なくサービスをご利用いただけます。'
      },
      {
        id: 'organization-permissions',
        question: 'グループの管理責任者、スタッフの違いはなんですか？',
        answer: <>
          グループそのものの編集ができるかどうかと、グループ名義のイベントの中止・日程調整の削除ができるかどうかが違います。スタッフは、グループ名義のイベントに対しては幹事と同じ権限を持ちます。
          <DataTable
            caption="グループの管理責任者とスタッフの権限の比較"
            head={['権限', '管理責任者', 'スタッフ', '参考/イベント主催者']}
            rows={[
              ['グループの編集・削除', '○', '×', '-'],
              ['グループメンバーの管理', '○', '×', '-'],
              ['イベント・日程調整の編集', '○', '○', '○'],
              ['イベントの中止・日程調整の削除', '○', '×', '○'],
              ['イベント参加メンバーの管理', '○', '○', '○'],
            ]}
          />
          <p className="mt-2 text-sm text-muted-foreground">※ イベント主催者とは、グループとは関係なく、通常の方法でイベントを作成したユーザーのことです。管理責任者には通常の方法のイベント主催者が持つ権限全てが与えられます。</p>
        </>
      },
    ]
  },
  {
    id: 'pre-events',
    title: '日程調整の主催',
    exampleQuestionId: 'pre-event-add-candidate',
    questions: [
      {
        id: 'what-is-pre-event',
        question: '日程調整機能とはなんですか？',
        answer: '開催日程が未定のイベントについて、参加候補者の都合を事前に確認できる機能です。複数の候補日を提示し、参加者に都合を回答してもらうことで、最適な日程を決定できます。'
      },
      {
        id: 'pre-event-add-candidate',
        question: '日程調整を作成した後に、候補日を編集できますか？',
        answer: '候補日の追加・削除は可能です。まだ回答のない候補日は日時も変更できますが、回答が届いている候補日は変更できません。変えたい場合は一度削除して、新しい候補として追加してください（その候補の回答は消えます）。'
      },
      {
        id: 'how-to-markdown',
        question: 'Markdownとはなんですか？Markdownの書き方がわかりません。',
        answer: <>簡単な記号を使って構造的な文章を記述する言語です。簡単な書き方ガイドを <Link href="/markdown-guide" className="text-primary hover:underline">Markdown記法ガイド</Link>に記載していますので、参照してください。</>
      },
      {
        id: 'text-candidate-for-pre-event',
        question: '日程候補はテキスト形式／自由入力形式で入力することはできますか？',
        answer: 'できません。カレンダー形式（日付のみ、または日付＋時刻。必要なら終了日時も）で指定してください。'
      },
    ]
  },
]
