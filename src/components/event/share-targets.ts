/**
 * SNS シェア先の定義と URL 組み立て。
 *
 * 投稿先の選択は anypost.dev に任せる。Fediverse は投稿先が人によって違い、
 * サーバー名を聞いて `https://<server>/share` を組み立てる実装は
 * 「自分のサーバー名を正確に打てる人」しか通れない。
 * anypost.dev はその選択と記憶を引き受けるサービスで、
 * 本サービスの他の投稿導線（EventContact）でも既に使っている。
 *
 * URL 組み立ては純関数として切り出してある。壊れても画面には
 * 「押しても何も起きない」としか出ないので、ここはテストで固定する。
 */

export type ShareInput = {
  /** 共有するページの絶対URL */
  url: string
  /** イベント名。本文の先頭に置く */
  title: string
}

/**
 * anypost.dev の投稿画面URL。
 *
 * `t` が本文。Fediverse 系はここでサーバーを選ばせ、
 * それ以外のサービスへも同じ画面から渡せる。
 */
export function buildAnypostShareUrl({ url, title }: ShareInput): string {
  return `https://anypost.dev/share?t=${encodeURIComponent(`${title}\n${url}`)}`
}

/**
 * 連絡先1件。イベントの作成者と幹事を指す。
 *
 * `id` は閲覧者自身を宛先から外すためだけに使う。
 * 自分宛のメンションを含んだ本文を開いても、誰にも届かない。
 */
export type ContactTarget = {
  id: string
  username: string
  server: string
  platform: string
}

/**
 * メンションで届く相手か。
 *
 * **Discord ユーザーは届かない。** `@name@discord.com` は
 * Fediverse でも X でも解決しないので、宛先に混ぜると
 * 本文の先頭にただの文字列が並ぶだけになる。
 */
export function canMention(target: ContactTarget): boolean {
  return (
    Boolean(target.username && target.server) &&
    target.server !== 'discord.com' &&
    target.platform !== 'discord'
  )
}

export type ContactInput = {
  /** 連絡するページの絶対URL */
  url: string
  /** イベント名 */
  title: string
  /** 宛先。**先頭を作成者にする** — 投稿先の判断に使う */
  targets: ContactTarget[]
  /** 閲覧者。未ログインなら null */
  viewer: { id: string; server: string; platform: string } | null
}

/**
 * 主催者へ連絡するための anypost.dev の投稿画面URL。
 * **宛先が1人もいなければ null。** ボタンごと出さないための合図。
 *
 * シェアと違い `a=1`（投稿画面を直接開く）を付ける。
 * 連絡は「このイベントについてこの人に言いたいことがある」状態で
 * 押されるので、投稿先を選び直させる意味がない。
 * ただし `i`（投稿元サーバー）が決まらないときは付けない —
 * サーバー未確定のまま自動で進めても、選択画面に戻るだけになる。
 */
export function buildAnypostContactUrl({
  url,
  title,
  targets,
  viewer,
}: ContactInput): string | null {
  const recipients = mentionableRecipients(targets, viewer)
  if (recipients.length === 0) return null

  const mentions = recipients.map((target) => `@${target.username}@${target.server}`)
  return composeUrl(viewer, `${mentions.join(' ')}\n\n「${title}」について\n${url}`)
}

/**
 * その人へ連絡するための anypost.dev の投稿画面URL。
 * **宛先が届かない相手（Discord）や自分自身なら null。**
 *
 * **本文はメンションだけにする。** イベントやグループへの連絡と違い、
 * ここには「何について」が無い。相手のページのURLを添えても、
 * 受け取るのは本人なので何も伝わらない
 * （`「テスト太郎」について https://.../users/taro@...` は読めない文になる）。
 */
export function buildAnypostMentionUrl({
  targets,
  viewer,
}: Pick<ContactInput, 'targets' | 'viewer'>): string | null {
  const recipients = mentionableRecipients(targets, viewer)
  if (recipients.length === 0) return null

  // 末尾の空白は、開いた画面でそのまま書き始められるようにするため
  const mentions = recipients.map((target) => `@${target.username}@${target.server}`)
  return composeUrl(viewer, `${mentions.join(' ')} `)
}

/** 届く宛先だけを、重複と自分自身を除いて並べる */
function mentionableRecipients(
  targets: ContactTarget[],
  viewer: ContactInput['viewer']
): ContactTarget[] {
  const recipients: ContactTarget[] = []
  for (const target of targets) {
    if (!canMention(target)) continue
    if (viewer && target.id === viewer.id) continue
    // 作成者が幹事も兼ねている場合に同じ相手を2回呼ばない
    if (recipients.some((r) => r.username === target.username && r.server === target.server)) {
      continue
    }
    recipients.push(target)
  }
  return recipients
}

/** 投稿画面のURL。`i` が決まるときだけ投稿画面を直接開く（`a=1`） */
function composeUrl(viewer: ContactInput['viewer'], body: string): string {
  const text = encodeURIComponent(body)
  const from = postingServerFor(viewer)

  if (!from) return `https://anypost.dev/share?t=${text}`
  return `https://anypost.dev/share?i=${encodeURIComponent(from)}&t=${text}&a=1`
}

/**
 * `i`（投稿元サーバー）に渡す値。**決められないなら null。**
 *
 * **閲覧者の居場所だけで決める。宛先は見ない。** 以前は「宛先と同じ
 * プラットフォームからでなければメンションは解決しない」という理屈で
 * 宛先の側を優先していた（主催者が X なら未ログインでも `i=x.com`、
 * 閲覧者と宛先が分かれていれば何も渡さない）。届くかどうかを先読みする
 * ぶん、**ログインしている人まで選択画面へ戻されていた** — 自分の
 * サーバーは分かっているのに、毎回選び直させることになる。
 * 宛先が別の場所にいるなら、anypost.dev の投稿画面で選び直せばよい。
 *
 * **Discord だけは渡さない。** anypost.dev の投稿先として選べないので、
 * `i=discord.com` を渡しても選択画面に戻るだけになる。
 * X（`x.com`）は投稿先として選べるので、そのまま渡す。
 */
function postingServerFor(viewer: ContactInput['viewer']): string | null {
  if (!viewer || !viewer.server) return null
  if (viewer.platform === 'discord' || viewer.server === 'discord.com') return null
  return viewer.server
}
