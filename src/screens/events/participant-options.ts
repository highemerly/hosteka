import type { ParticipantOptionView } from '@/components/event/ParticipantList'
import type { EventOptionGroupDto, ManageParticipantDto } from '@/server/serializers/event'

/**
 * 選んだオプションをチップの形にする。並びはイベントの表示順
 * （詳細画面の参加者一覧と揃える）。
 *
 * **自由入力の回答も同じ形にする。** 見る側にとっては、選んだ答えも
 * 書いた答えも同じ「この人の回答」で、種類ごとに置き場を分ける理由が無い。
 * 詳細画面の並べ方（`server/serializers/event.ts` の `answerViews`）と同じ。
 */
export function selectedOptionViews(
  participant: Pick<ManageParticipantDto, 'selectedOptionIds' | 'optionTextAnswers'>,
  optionGroups: EventOptionGroupDto[]
): ParticipantOptionView[] {
  const selected = new Set(participant.selectedOptionIds)
  return optionGroups.flatMap((group) => {
    const text = participant.optionTextAnswers[group.id]
    if (text) return [{ question: group.title, name: text }]

    return group.options
      .filter((o) => selected.has(o.id))
      .map((o) => ({ question: group.title, name: o.name }))
  })
}
