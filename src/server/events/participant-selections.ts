import type { Prisma } from '@/generated/prisma/client'
import type { OptionResponseType } from '@/schemas/event'

/**
 * 参加登録で送られてきた回答を、保存する行の形にする。
 *
 * **イベントが持つグループを起点に組み立てる。** 以前は本文の
 * `selectedGroupOptions` をそのまま回して行を作っていたので、
 * 他のイベントのグループIDや選択肢IDを送られても、そのまま
 * `participant_group_selections` に入った（外部キーは通ってしまう）。
 * ここを通せば、**そのイベントに無いものは落ちる。**
 *
 * 種類ごとの扱いもここに集める。単一選択に2つ送られたら1つに詰め、
 * 選択式のグループへ届いた自由入力と、自由入力のグループへ届いた
 * 選択肢IDは捨てる。ルート（POST / PUT）の両方が同じ関数を通す。
 */

export type AnswerableGroup = {
  id: string
  /** DB の列は文字列。値の集合は `optionResponseType` が持つ */
  responseType: string
  options: { id: string }[]
}

/** 参加登録の本文のうち、回答にあたる部分 */
export type GroupAnswers = {
  selectedGroupOptions: Record<string, string[]>
  groupTextAnswers: Record<string, string>
}

/** `participant_group_selections` 1行ぶん */
export type GroupSelectionWrite = {
  groupId: string
  /** 自由入力の回答。選択式なら null */
  textAnswer: string | null
  /** 選んだ選択肢。自由入力なら空 */
  optionIds: string[]
}

export function resolveGroupSelections(
  groups: AnswerableGroup[],
  answers: GroupAnswers
): GroupSelectionWrite[] {
  const writes: GroupSelectionWrite[] = []

  for (const group of groups) {
    const responseType = group.responseType as OptionResponseType

    if (responseType === 'text') {
      const text = (answers.groupTextAnswers[group.id] ?? '').trim()
      // 空欄は「答えなかった」。空の行を残すと、CSV でも一覧でも
      // 「答えた人」として数えることになる
      if (text) writes.push({ groupId: group.id, textAnswer: text, optionIds: [] })
      continue
    }

    const known = new Set(group.options.map((o) => o.id))
    const chosen = [...new Set(answers.selectedGroupOptions[group.id] ?? [])].filter((id) =>
      known.has(id)
    )
    // 単一選択に2つ届いたら先頭だけ。送れてしまう経路は塞ぐ
    const optionIds = responseType === 'multiple' ? chosen : chosen.slice(0, 1)

    if (optionIds.length > 0) writes.push({ groupId: group.id, textAnswer: null, optionIds })
  }

  return writes
}

/**
 * 回答を `participant_group_selections` / `participant_group_options` へ書く。
 *
 * **作成（POST）と更新（PUT）で同じ関数を通す。** 以前は同じループが
 * 両方に書き写されていて、片方だけ直した日に「作成では保存されるのに
 * 変更すると消える」項目ができる形になっていた。
 *
 * 呼ぶ前に既存の行を消しておくこと（更新側）。ここでは消さない —
 * 消す範囲は呼び出し側の文脈（参加者1人ぶん）で決まる。
 */
export async function writeGroupSelections(
  tx: Pick<Prisma.TransactionClient, 'participantGroupSelection' | 'participantGroupOption'>,
  participantId: string,
  groups: AnswerableGroup[],
  answers: GroupAnswers
): Promise<void> {
  for (const write of resolveGroupSelections(groups, answers)) {
    const selection = await tx.participantGroupSelection.create({
      data: {
        participantId,
        groupId: write.groupId,
        textAnswer: write.textAnswer,
      },
    })

    if (write.optionIds.length > 0) {
      await tx.participantGroupOption.createMany({
        data: write.optionIds.map((optionId) => ({ selectionId: selection.id, optionId })),
      })
    }
  }
}
