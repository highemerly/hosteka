/**
 * 日本時間（JST）の日時を組み立てる場所。**アプリ内で唯一。**
 *
 * ## なぜ1箇所に集めるのか
 *
 * JavaScript の `Date` はタイムゾーンを持たない。ある瞬間を指す数値でしかなく、
 * 「何時か」は表示するときに**実行環境のタイムゾーン**で決まる。つまり
 * `date.toLocaleString('ja-JP')` は
 *
 *   - 開発機（JST）        … 正しく見える
 *   - 本番サーバー（UTC）  … 9時間ずれる
 *   - 海外にいる利用者の端末 … その土地の時刻になる
 *
 * と、**書いた人の環境でだけ正しく見える**。テストも開発機で通る。
 * だから見つかるのはいつも本番で、しかも「9時間ずれている」と
 * 言われるまで誰も気づかない。実際に参加者一覧の登録日時、CSVの登録日時、
 * 管理画面の各種日時が全部ずれていた。
 *
 * 対策は「気をつける」ではなく、**タイムゾーンを書き忘れられる場所を無くす**こと。
 * ここを通せば忘れようがなく、`src/lib/jst.guard.test.ts` が
 * 抜け道（素の `toLocale*`）を機械的に見つける。
 *
 * ## `new Date(d.toLocaleString(...))` を書かないこと
 *
 * 「JSTのDateを作る」ために、いったん文字列にして読み直す書き方が
 * 広まっていた（このファイルの `toJstWallClock` が引き受けている）。
 * これは2つの意味で危ない。
 *
 *   1. 戻り値は**瞬間としては嘘**になる。壁掛け時計の読みを、その場の
 *      タイムゾーンの時刻として作り直しているだけなので、`getTime()` で
 *      比べたり ISO で保存したりすると9時間ずれる
 *   2. `new Date('9/12/2026, 7:00:00 PM')` の解釈は**実装依存**（ECMA-262）。
 *      たまたま V8 で動いているだけで、仕様上の保証がない
 *
 * 表示だけが目的なら `formatJst*`、部品が欲しいなら `jstParts` を使う。
 * どちらも `Intl` に時刻帯を渡すだけで、文字列を読み直さない。
 *
 * 日本には夏時間が無いので +09:00 は年間を通じて一定だが、
 * それでも**オフセットを直に足し引きしない**。数値が何を意味するのかが
 * 読めなくなるうえ、`Intl` に渡せば済む話になる。
 */

/** このアプリが扱う唯一のタイムゾーン */
export const JST = 'Asia/Tokyo'

/** 表示に使うロケール */
const LOCALE = 'ja-JP'

export type JstParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/*
  部品の取り出しに使う整形器。**使い回す。**
  `Intl.DateTimeFormat` の生成は安くないうえ、一覧では1行ごとに呼ばれる。

  `hourCycle: 'h23'` を明示する。`hour12: false` だけだと ICU の版によって
  深夜0時が `24` になり、日付をまたいだ集計が静かにずれる。
*/
const PARTS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: JST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function asDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * その瞬間を JST で見たときの、年月日時分秒。
 *
 * **`toJST(x).getHours()` の置き換え。** あちらは実装依存の文字列解釈を
 * 挟むが、こちらは `Intl` が返した部品をそのまま読む。
 */
export function jstParts(value: Date | string | number): JstParts {
  const parts = PARTS_FORMAT.formatToParts(asDate(value))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * 日時。既定は「2026/9/12 19:00:00」。
 * `options` で形を変えられるが、**時刻帯は上書きさせない**。
 */
export function formatJstDateTime(
  value: Date | string | number,
  options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>
): string {
  return asDate(value).toLocaleString(LOCALE, { ...options, timeZone: JST })
}

/** 日付。既定は「2026/9/12」 */
export function formatJstDate(
  value: Date | string | number,
  options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>
): string {
  return asDate(value).toLocaleDateString(LOCALE, { ...options, timeZone: JST })
}

/** 時刻。既定は「19:00」 */
export function formatJstTime(
  value: Date | string | number,
  options?: Omit<Intl.DateTimeFormatOptions, 'timeZone'>
): string {
  return asDate(value).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
    timeZone: JST,
  })
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * `<input type="date">` に入れる「2026-09-12」。
 *
 * **`toLocaleDateString('sv-SE')` で代用しない。** スウェーデン語ロケールが
 * たまたま ISO と同じ並びなのを利用した書き方で、読んでも意図が分からず、
 * 時刻帯を渡し忘れる余地も残る。
 */
export function toJstDateInput(value: Date | string | number): string {
  const p = jstParts(value)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/**
 * 機械が読む日時（CSV など）の「2026-09-12T19:00:00+09:00」。
 *
 * **オフセットまで書く。** 付けないと、読んだ側が自分の時刻帯の
 * 時刻として解釈する。`toISOString()` は UTC（`Z`）で出るので、
 * 人が CSV を開いたときに9時間ずれて見える。
 */
export function toJstIso(value: Date | string | number): string {
  const p = jstParts(value)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}+09:00`
}

/** `<input type="time">` に入れる「19:00」 */
export function toJstTimeInput(value: Date | string | number): string {
  const p = jstParts(value)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * JST の壁掛け時計の読みを、その場のタイムゾーンの `Date` として作り直す。
 *
 * **戻り値は瞬間としては正しくない。** `getFullYear()` `getHours()` などの
 * ローカル getter で JST の部品を読むためだけの入れ物で、`getTime()` で
 * 比較したり保存したりしてはならない（9時間ずれる）。
 *
 * 新しい呼び出しを増やさないこと。部品が欲しいなら `jstParts`、
 * 表示したいなら `formatJst*` で足りる。ここにあるのは、この形を前提に
 * 書かれた既存の呼び出し（`toJST`）を、**実装依存の
 * 文字列解釈から切り離す**ためだけの受け皿。
 */
export function toJstWallClock(value: Date | string | number): Date {
  const d = asDate(value)
  const p = jstParts(d)
  return new Date(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
    d.getMilliseconds()
  )
}
