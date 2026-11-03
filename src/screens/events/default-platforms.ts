import { isFediverseViewer, type Viewer } from '@/lib/viewer'

/**
 * 新しいイベントで既定にするプラットフォーム。
 *
 * **主催者自身のプラットフォームに合わせる。** 主催者から参加者への連絡が
 * とりやすいことを既定にしたいので、まず自分と同じところだけを開ける。
 * 広げるかどうかは主催者が決める。
 *
 * 以前は誰が作っても Fediverse 固定だった。**Discord や X でログインした
 * 主催者は、既定のままだと自分のイベントに参加登録できなかった**
 * （ログインは `api/v1/auth/callback/{discord,twitter}` で実在する）。
 * 画面には「既定では主催者と同じプラットフォームのみ」と書いてあり、
 * 文言だけが正しい状態になっていた。
 */
export type PlatformDefaults = {
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
}

const ONLY = (key: keyof PlatformDefaults): PlatformDefaults => ({
  isAllowedForFediverse: key === 'isAllowedForFediverse',
  isAllowedForDiscord: key === 'isAllowedForDiscord',
  isAllowedForTwitter: key === 'isAllowedForTwitter',
})

/**
 * 閲覧者自身が属するプラットフォームの欄。知らない相手なら null。
 *
 * **既定値だけでなく「外せない欄」の判定にも使う。** 主催者が自分の
 * プラットフォームを閉じると自分のイベントに参加登録できなくなるので、
 * 画面ではその1つだけトグルを止める。既定と施錠で判定が2箇所に分かれると、
 * 片方だけ直したときに「既定で入るのに外せる」状態になる。
 *
 * Fediverse の実装名（mastodon / misskey / pleroma）を数える場所は
 * lib/viewer.ts に1つだけ置く。ここで並べ直すと増えたときにずれる。
 */
export function viewerPlatformField(viewer: Viewer | null): keyof PlatformDefaults | null {
  if (isFediverseViewer(viewer)) return 'isAllowedForFediverse'
  if (viewer?.platform === 'discord') return 'isAllowedForDiscord'
  if (viewer?.platform === 'twitter') return 'isAllowedForTwitter'
  return null
}

/**
 * 自分のプラットフォームを外せない理由。トグルの説明に添える。
 *
 * **イベントと日程調整で同じ文言を使う。** 「参加」で両方を指しているのは
 * 意図したもので、片方ずつ書き分けると、同じ制限の説明が2通りになる。
 */
export const LOCKED_PLATFORM_NOTE_ALONE =
  'ログイン中のアカウントのプラットフォームです。外すと自分が参加できなくなるため、変更できません'
/** 既に説明が入っているトグルに足すとき用 */
export const LOCKED_PLATFORM_NOTE = `（${LOCKED_PLATFORM_NOTE_ALONE}）`

export function defaultPlatforms(viewer: Viewer | null): PlatformDefaults {
  /*
    未ログイン、または知らないプラットフォームは Fediverse に倒す。
    **空にはしない。** 作成画面は未ログインでも開けるので、1つも選ばれて
    いない状態で始めると「1つ以上選んでください」で止まったまま、
    何を直せばよいのか分からない。利用者が最も多い側に倒す。
  */
  return ONLY(viewerPlatformField(viewer) ?? 'isAllowedForFediverse')
}

/**
 * 既定から変えているか。「カスタマイズする」のトグルを開いておくかを決める。
 *
 * **サーバー限定も含める。** プラットフォームが既定のままでもサーバーを
 * 絞っていれば範囲は狭まっている。畳んだままだと、効いている制限が
 * 画面のどこにも見えなくなる。
 */
export function isCustomizedPlatforms(
  values: PlatformDefaults & { allowedFediverseServers: string[] },
  viewer: Viewer | null
): boolean {
  const defaults = defaultPlatforms(viewer)
  return (
    values.allowedFediverseServers.length > 0 ||
    (Object.keys(defaults) as (keyof PlatformDefaults)[]).some(
      (key) => values[key] !== defaults[key]
    )
  )
}

