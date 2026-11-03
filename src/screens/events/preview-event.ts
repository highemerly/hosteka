import type { Viewer } from '@/lib/viewer'
import type { EventFormOutput } from '@/schemas/event'
import type { EventDetailDto } from '@/server/serializers/event'

/**
 * フォームの入力から、詳細ページが描ける形（`EventDetailDto`）を組み立てる。
 * 作成前プレビュー専用。**保存はしない。**
 *
 * ここでの規則は、サーバーが実際に保存・整形するときの規則と
 * **同じでなければならない**（`api/v1/events` の POST と
 * `lib/event-datetime.ts` の `composeDateTime` / `composeDeadline`）。
 * ずれると「プレビューでは19時だったのに作ったら9時だった」ことになる。
 * 実際にそのずれが起きていたので、ここは規則を書き写すのではなく
 * **同じ結果になることをテストで固定する**（preview-event.test.ts）。
 */

/**
 * プレビュー中のイベントID。
 *
 * 実在しない値であることが分かる文字列にしてある。`EventDetailView` は
 * プレビューではIDの行を出さないので画面には現れないが、
 * 万一リンクが組み立てられても本物のイベントを指さない。
 */
export const PREVIEW_EVENT_ID = '__preview__'

/**
 * 時刻を指定したとみなすか。
 *
 * **`00:00` は「指定なし」。** サーバー側（`api/v1/events`）が
 * `!!startTime && startTime !== '00:00'` で判定しているので、
 * ここだけ素直に「入力があれば時刻あり」にすると、0時開始のイベントで
 * プレビューと結果が食い違う。
 */
function hasTime(time: string | undefined): boolean {
  return Boolean(time) && time !== '00:00'
}

/** `YYYY-MM-DD` と `HH:MM` を JST の瞬間にする */
function jstInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00+09:00`).toISOString()
}

export type PreviewInput = {
  values: EventFormOutput
  /** ログイン中の利用者。主催者として出す。未ログインなら仮の名前になる */
  viewer: Viewer | null
  /** グループ主催にしている場合の表示名。`organizationId` から引いて渡す */
  organization: { id: string; slug: string; name: string } | null
  /**
   * 編集中のイベント。作成時は null。
   *
   * **参加者と主催者は引き継ぐ。** 既に20人いるイベントの編集で
   * 「まだ参加者がいません」と出すと、残席や参加者一覧の見え方を
   * 確かめられないどころか、消えたように読める。
   */
  existing?: EventDetailDto | null
  /** 「今」。作成日・最終更新に出す。テストから固定できるようにしてある */
  now: Date
}

export function buildPreviewEvent({
  values,
  viewer,
  organization,
  existing = null,
  now,
}: PreviewInput): EventDetailDto {
  const startHasTime = hasTime(values.startTime)
  const endHasTime = hasTime(values.endTime)

  return {
    id: PREVIEW_EVENT_ID,
    title: values.title,
    description: values.description ?? null,
    hashtags: values.hashtags,

    startDate: jstInstant(values.startDate, startHasTime ? values.startTime! : '00:00'),
    endDate: values.endDate
      ? jstInstant(values.endDate, endHasTime ? values.endTime! : '00:00')
      : null,
    hasStartTime: startHasTime,
    hasEndTime: endHasTime,

    location: values.location ?? null,
    fee: values.fee ?? null,
    relatedUrl: values.relatedUrl ?? null,
    terms: values.terms ?? null,

    // 中止したイベントを編集しているなら、中止の姿のまま見せる
    status: existing?.status ?? 'active',
    isPublic: values.isPublic,
    isHighlighted: values.isHighlighted,
    maxParticipants: values.maxParticipants ?? null,

    /*
      締切の時刻は未入力なら 23:59（`composeDeadline` と同じ）。
      **`hasTime` を通さない。** あちらは `time || '23:59'` なので、
      `00:00` を指定したイベントは 0時締切として扱われる。
    */
    registrationDeadline: values.registrationDeadlineDate
      ? jstInstant(
          values.registrationDeadlineDate,
          values.registrationDeadlineTime || '23:59'
        )
      : null,

    allowMaybe: values.allowMaybe,
    allowParticipationRequest: values.allowParticipationRequest,

    /*
      サーバーは保存時に anypost.dev でサーバーの種別を引く
      （`enrichServersWithPlatform`）。**プレビューでは引かない。**
      外部へ問い合わせるとプレビューを開くのが遅くなるうえ、
      失敗したときに何を出すかという分岐が増える。
      種別不明として扱うので、バッジは「Fediverse 一般」の姿になる。
    */
    allowedServers: values.allowedFediverseServers.map((server) => ({
      server,
      platform: null,
    })),
    isAllowedForFediverse: values.isAllowedForFediverse,
    isAllowedForDiscord: values.isAllowedForDiscord,
    isAllowedForTwitter: values.isAllowedForTwitter,

    creator: existing?.creator ?? {
      id: viewer?.id ?? 'preview-creator',
      username: viewer?.username ?? 'you',
      displayName: viewer?.name || viewer?.username || 'あなた',
      avatar: viewer?.avatar ?? null,
      server: viewer?.server ?? '',
      platform: viewer?.platform ?? 'mastodon',
    },
    organization,

    // 作成時はまだ誰も登録していない（「まだ参加者がいません」が出る）
    participants: existing?.participants ?? [],
    counts: existing?.counts ?? { attending: 0, maybe: 0, participationRequest: 0 },

    /*
      IDは保存して初めて決まる。`ParticipateDialog` は
      `optionGroups[].id` / `options[].id` を選択状態のキーに使うので、
      **グループ内で一意でありさえすればよい。**

      編集中でも作り直す。フォームの値は選択肢のIDを持たないので、
      既存のIDと結び付ける手がかりが並び順しかない。並べ替えたときに
      別の選択肢のIDを割り当てるくらいなら、選択済み人数
      （`takenCount`）が0に見えるほうが害が小さい。
    */
    optionGroups: values.optionGroups.map((g, gi) => ({
      id: `${PREVIEW_EVENT_ID}-g${gi}`,
      title: g.title,
      responseType: g.responseType,
      /*
        **自由入力は選択肢を持たない。** 編集中の下書きは切り替えても
        選択肢を捨てないので（書き直させないため）、ここで落とす。
        保存のときに落とすのと同じ規則（`eventOptionGroupSchema`）。
      */
      options:
        g.responseType === 'text'
          ? []
          : g.options.map((o, oi) => ({
              id: `${PREVIEW_EVENT_ID}-g${gi}-o${oi}`,
              name: o.name,
              maxParticipants: o.maxParticipants ?? null,
              takenCount: 0,
            })),
    })),

    /*
      **参加者の目線で描く。** 主催者が確かめたいのは「参加者に
      どう見えるか」なので、幹事メニューではなく参加登録ボタンを出す。
      締切超過・満員・参加できないプラットフォームの判定は
      `resolveEventActionState` がこの DTO から導く。
    */
    viewer: {
      isAuthenticated: true,
      isOrganizer: false,
      canCancel: false,
      canChangeOrganization: false,
      participation: null,
      isEligible: true,
      ineligibleReason: null,
    },

    createdAt: existing?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  }
}
