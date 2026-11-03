/**
 * 「どうやって投稿するか」の決め方。
 *
 * **画面から切り離す。** 選べる方法は「自分のプラットフォーム」と「投稿の
 * 権限があるか」で決まり、旧実装ではこの分岐が JSX の中に散っていた。
 * 散らすと、選べるのに送ると失敗する選択肢が生まれる。
 *
 * **方法は2つだけ。** 以前は「自分のサーバーへ」「x.com へ」「任意の
 * サーバーへ」を別々の方法として並べていたが、それは「どこへ投稿するか」で
 * あって方法ではない。宛先が Fediverse と X に分かれていると、方法を
 * 切り替えて2回やり直すことになっていた。行き先は `destinations.ts` が
 * 宛先から決める。
 *
 * 日程調整とイベントで同じものを使う。連絡の仕組みは共通で、
 * 違うのは宛先の集め方だけ。
 */

export type PostMethod =
  /** Hosteka から直接投稿する。主催者＋投稿権限があるときだけ */
  | 'direct'
  /** 投稿画面（anypost.dev）へ移動して、自分で投稿する */
  | 'external'

/**
 * 1つの投稿が届く範囲。**両方に届く投稿は無い。**
 * メンションの形と文字数の上限がここで分かれる。
 */
export type PostNetwork = 'fediverse' | 'twitter'

/** 直接投稿に対応しているプラットフォーム。API もこの2つだけを通す */
export const DIRECT_POST_PLATFORMS = ['mastodon', 'misskey']

/** 自分のサーバーへ渡せるプラットフォーム */
const FEDIVERSE_PLATFORMS = ['mastodon', 'misskey', 'pleroma']

export type ContactViewer = {
  platform: string
  server: string
  /**
   * API が直接投稿を通す相手か。
   *
   * **「権限があるか」とは別物。** 誰に投稿させるかはリソースごとに違う
   * （日程調整は主催者だけ、イベントは参加者も送れる）。ここを
   * 「主催者かどうか」で書くと、イベント側で参加者から選択肢が消える。
   */
  mayPostDirectly: boolean
  /** 実際に送れるか。上に加えて、投稿できる権限で入っているか */
  canPostDirectly: boolean
}

export type PostMethodOption = {
  method: PostMethod
  /**
   * 直接投稿だが、いまの権限では送れない。
   * **選択肢自体は出す** — 「できない」ではなく「入り直せばできる」なので、
   * 消すと権限を上げる道が画面から見えなくなる。
   */
  needsPermission: boolean
}

export function isFediversePlatform(platform: string): boolean {
  return FEDIVERSE_PLATFORMS.includes(platform.toLowerCase())
}

export function isTwitterPlatform(platform: string): boolean {
  return platform.toLowerCase() === 'twitter'
}

/**
 * 選べる投稿方法。
 *
 * **送れないものは出さない。** 直接投稿は API が通す相手にだけ出す
 * （`mayPostDirectly`）。投稿画面へ移動する道は誰にでもある —
 * 宛先が1人もいない日程調整でも、主催者は「これから答えてほしい」と
 * 声をかけたい。
 */
export function postMethodOptions(viewer: ContactViewer): PostMethodOption[] {
  const options: PostMethodOption[] = []

  if (viewer.mayPostDirectly && DIRECT_POST_PLATFORMS.includes(viewer.platform.toLowerCase())) {
    options.push({ method: 'direct', needsPermission: !viewer.canPostDirectly })
  }
  options.push({ method: 'external', needsPermission: false })
  return options
}

/**
 * 最初に選ばれている投稿方法。
 *
 * **いちばん手数の少ない道を選ぶ。** 直接投稿できるならそれ。
 * 権限が足りない直接投稿は既定にしない — 開いた瞬間に
 * 「権限が要ります」だけが出ている画面になる。
 */
export function defaultPostMethod(viewer: ContactViewer): PostMethod {
  const direct = postMethodOptions(viewer).find((o) => o.method === 'direct')
  return direct && !direct.needsPermission ? 'direct' : 'external'
}
