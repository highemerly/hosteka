import Link from 'next/link'
import { Scale } from 'lucide-react'

import { ConditionLink } from '@/components/event/ConditionLink'

/**
 * 「開催できない／できるイベント」の入口。
 * イベントと日程調整の作成フォームで、題名の横に置く。
 *
 * **作るときに出す。決めるのはそこだから。** 以前は利用規約の冒頭に同じ
 * 抜粋を置いていたが、規約まで降りた人しか読めなかった。
 *
 * **リンクにしない。** 書きかけを置いて `/terms` へ飛ばすと
 * `UnsavedChangesGuard` に当たる。
 *
 * **編集では出さない** — 決めるのは作るときで、開くたびに出すものではない。
 */
export function EventPolicyLink() {
  return (
    <ConditionLink
      icon={<Scale className="size-3.5" />}
      label="開催できない／できるイベント"
      tone="warning"
      title="開催できない／できるイベント"
    >
      <EventPolicyNotice />
    </ConditionLink>
  )
}

/**
 * 開催できないイベントと、できるイベントの抜粋。
 *
 * **禁止の一覧だけでは足りない。** 一覧は「駄目なもの」しか言わないので、
 * 書いていないものまで自分で駄目だと決めてしまう人が出る（有料イベントが
 * いちばん多い）。**禁止の一覧の下に、開けるほうも並べる。**
 *
 * **禁止の正文は利用規約の「禁止されるイベント等」（`TermsDocument`）。
 * ここは抜粋。書き足すときはあちらも直すこと** — 作る前に読んだものと、
 * 同意した規約が食い違う。
 */
function EventPolicyNotice() {
  return (
    <div>
      {/*
        **枠の色で2つを言い分ける。** 赤が禁止、青が開けるもの。
        同じ色で並べると、下の一覧まで警告として読まれる。
      */}
      <div className="rounded-xl border border-destructive bg-destructive/10 p-6">
        <p className="text-sm font-bold text-destructive">開催できないイベント</p>
        <ul className="mt-4 space-y-2 text-sm text-foreground">
          <li>• 法令に違反する行為を目的とするイベント（<b>違法薬物</b>の売買や使用、いわゆる<b>闇バイト</b>の募集も含みます）</li>
          <li>• <b>性行為</b>や<b>わいせつな行為</b>を目的とするイベント</li>
          <li>• <b>宗教活動や宗教団体への勧誘</b>を目的とするイベント</li>
          <li>• 面識のない異性との出会いや交際を目的とするイベント</li>
          <li>• 青少年の健全な育成に悪影響を与える可能性のあるイベント</li>
          <li>• 反社会的勢力への利益供与を目的とするイベント</li>
        </ul>
      </div>

      <div className="mt-4 rounded-xl border border-primary bg-primary/10 p-6">
        <p className="text-sm font-bold text-primary">開催できるイベント例</p>
        <ul className="mt-4 space-y-2 text-sm text-foreground">
          <li>• <b>無償</b>または<b>有償</b>のイベント</li>
          <li>• <b>不特定多数</b>または<b>特定の集団</b>に向けたイベント</li>
          <li>• <b>商用目的</b>のイベント</li>
          <li>• <b>オンライン</b>または<b>リアル会場に集まる</b>イベント</li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          上の禁止事項に当たらなければ、イベント・日程調整の種別は問いません。
        </p>
      </div>

      {/* **根拠を示す。** 規約の中と違い、読んでいる場所がどこの決まりかが分からない */}
      <p className="mt-4 text-sm text-muted-foreground">
        これは利用規約の要点の抜粋です。禁止事項の全文は
        {/* **別のタブで開く。** 書きかけのフォームの上から開くので遷移させない */}
        <Link
          href="/terms#prohibited"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          利用規約の禁止事項
        </Link>
        をご覧ください。
      </p>
    </div>
  )
}
