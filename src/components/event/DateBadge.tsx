/**
 * 紙面（帯の下）の高さ。**日めくりと候補の札で同じ値を使う。**
 *
 * 日めくりは「数字＋曜日」の2行、候補の札は「#3」の1行なので、成り行きに
 * 任せると高さが変わり、イベントと日程調整で見出しの高さが揃わなくなる。
 * 値は日めくりの内訳そのまま（`leading-none` なので行箱＝文字サイズ）:
 *
 * - md: pt-1.5(6) + 20 + pt-1(4) + 10 + pb-1.5(6) = 46
 * - sm: pt-1(4) + 16 + pt-0.5(2) + 9 + pb-1(4) = 35
 */
const PAPER_BODY = { md: 'h-[46px]', sm: 'h-[35px]' } as const

/**
 * 開催日のバッジ。
 *
 * カレンダーの日めくりを模した形にして、日付であることを文字を読む前に
 * 分からせる。詳細ページ・一覧カード・シェア用サムネイルで同じ形を使い、
 * 「この四角＝開催日」という対応を育てる。
 *
 * **押せない要素なので立体表現は付けない。** 影を付けるとボタンに見え、
 * 押しても何も起きないことに気づくまで戸惑わせる。
 */
export function DateBadge({
  date,
  size = 'md',
}: {
  /** ISO 文字列。JST として表示する */
  date: string
  size?: 'md' | 'sm'
}) {
  /*
    ja-JP の toLocaleString は month: 'numeric' でも「9月」と単位付きで返す。
    そのまま「月」を足すと「9月月」になるので、数値だけを取り出す。
    JST 固定にするため formatToParts でタイムゾーンを明示する。
  */
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(new Date(date))
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

  const small = size === 'sm'

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 flex-col overflow-hidden rounded-lg border border-border ${
        small ? 'w-11' : 'w-13'
      }`}
      style={{ backgroundColor: 'var(--calendar-paper)' }}
    >
      <span
        className={`text-center font-medium ${small ? 'py-px text-[10px]' : 'py-0.5 text-[11px]'}`}
        style={{
          backgroundColor: 'var(--calendar-accent)',
          color: 'var(--calendar-accent-foreground)',
        }}
      >
        {pick('month')}月
      </span>
      {/* 中の余白の合計が `PAPER_BODY` と一致する。高さは変わらない */}
      <span className={`flex flex-col ${PAPER_BODY[size]}`}>
        <span
          className={`px-1 text-center leading-none font-bold ${
            small ? 'pt-1 text-base' : 'pt-1.5 text-xl'
          }`}
          style={{ color: 'var(--calendar-paper-foreground)' }}
        >
          {pick('day')}
        </span>
        <span
          className={`px-1 text-center leading-none ${
            small ? 'pt-0.5 pb-1 text-[9px]' : 'pt-1 pb-1.5 text-[10px]'
          }`}
          style={{ color: 'var(--calendar-paper-muted)' }}
        >
          {pick('weekday')}
        </span>
      </span>
    </span>
  )
}

/**
 * 候補日の札。日程調整の見出しに置く。
 *
 * **`DateBadge` と同じ骨格・同じ大きさにする。** 候補が複数あるので
 * 日付そのものは出せないが、ここだけ小さい別の印にすると、イベントと
 * 日程調整で見出しの高さが揃わず、並べたときに別の画面に見える。
 *
 * 日めくりと違えるのは3点。
 *
 * - **帯はシアン**（`--candidate-accent`）。赤のままだと、日付が決まって
 *   いないものが日めくりと同じ顔で並ぶ
 * - **紙を1枚後ろに重ねる。** 「この中から選ぶ」ことを、数字を読む前に
 *   形で示す。候補が1つしか無いときは重ねない（重なりが嘘になる）
 * - **紙面は `#3` の1行だけ。** 「3」の下に「日」を置くと、日めくりの
 *   「26」「日」と同じ並びになり、**3日（日曜）に見える**
 */
export function CandidatesBadge({ count, size = 'md' }: { count: number; size?: 'md' | 'sm' }) {
  const small = size === 'sm'

  return (
    /*
      `role="img"` を付ける。素の span の `aria-label` は読み上げられない。
      候補の数は隣の題名にも一覧にも出ないので、ここで言う相手が他にいない。
    */
    <span
      role="img"
      aria-label={`候補${count}日`}
      className={`relative inline-flex shrink-0 ${small ? 'w-11' : 'w-13'}`}
    >
      {/* 後ろに覗く紙。紙面より一段暗い（同じ白だと白地の上で消える） */}
      {count > 1 ? (
        <span
          aria-hidden
          className={`absolute inset-0 rounded-lg border border-border ${
            small ? '-translate-y-[3px] translate-x-[3px]' : '-translate-y-1 translate-x-1'
          }`}
          style={{ backgroundColor: 'var(--candidate-stack)' }}
        />
      ) : null}

      <span
        aria-hidden
        className="relative flex w-full flex-col overflow-hidden rounded-lg border border-border"
        style={{ backgroundColor: 'var(--calendar-paper)' }}
      >
        <span
          className={`text-center font-medium ${small ? 'py-px text-[10px]' : 'py-0.5 text-[11px]'}`}
          style={{
            backgroundColor: 'var(--candidate-accent)',
            color: 'var(--candidate-accent-foreground)',
          }}
        >
          候補
        </span>
        <span
          className={`flex items-center justify-center gap-px px-1 leading-none ${PAPER_BODY[size]}`}
        >
          {/* 「#」は数字より小さく淡く。同じ大きさだと数字がどれか一拍遅れる */}
          <span
            className={small ? 'text-[10px]' : 'text-xs'}
            style={{ color: 'var(--calendar-paper-muted)' }}
          >
            #
          </span>
          <span
            className={`font-bold tabular-nums ${small ? 'text-base' : 'text-xl'}`}
            style={{ color: 'var(--calendar-paper-foreground)' }}
          >
            {count}
          </span>
        </span>
      </span>
    </span>
  )
}
