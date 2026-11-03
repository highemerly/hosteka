import { describe, expect, it } from 'vitest'

import { resolveGroupSelections, type AnswerableGroup } from './participant-selections'

/**
 * 参加登録の回答から、保存する行を組み立てる。
 *
 * **ここが「そのイベントのものか」を確かめる唯一の場所。** 以前は本文の
 * `selectedGroupOptions` をそのまま回して行を作っていたので、別のイベントの
 * IDを送れば、そのまま保存できた（外部キーは通ってしまう）。
 */

const GROUPS: AnswerableGroup[] = [
  { id: 'g_single', responseType: 'single', options: [{ id: 'o1' }, { id: 'o2' }] },
  { id: 'g_multi', responseType: 'multiple', options: [{ id: 'o3' }, { id: 'o4' }] },
  { id: 'g_text', responseType: 'text', options: [] },
]

const answers = (input: {
  selectedGroupOptions?: Record<string, string[]>
  groupTextAnswers?: Record<string, string>
}) => ({
  selectedGroupOptions: input.selectedGroupOptions ?? {},
  groupTextAnswers: input.groupTextAnswers ?? {},
})

describe('resolveGroupSelections', () => {
  it('選んだ選択肢と自由入力を、イベントの表示順で行にする', () => {
    expect(
      resolveGroupSelections(
        GROUPS,
        answers({
          selectedGroupOptions: { g_single: ['o2'], g_multi: ['o3', 'o4'] },
          groupTextAnswers: { g_text: '友人から' },
        })
      )
    ).toEqual([
      { groupId: 'g_single', textAnswer: null, optionIds: ['o2'] },
      { groupId: 'g_multi', textAnswer: null, optionIds: ['o3', 'o4'] },
      { groupId: 'g_text', textAnswer: '友人から', optionIds: [] },
    ])
  })

  it('このイベントに無いグループ・選択肢は捨てる', () => {
    expect(
      resolveGroupSelections(
        GROUPS,
        answers({
          // o9 は他のイベントの選択肢、g_other は他のイベントのグループ
          selectedGroupOptions: { g_single: ['o9'], g_other: ['o1'] },
          groupTextAnswers: { g_other: 'よその設問への答え' },
        })
      )
    ).toEqual([])
  })

  it('単一選択に2つ届いたら先頭だけ残す', () => {
    expect(
      resolveGroupSelections(GROUPS, answers({ selectedGroupOptions: { g_single: ['o1', 'o2'] } }))
    ).toEqual([{ groupId: 'g_single', textAnswer: null, optionIds: ['o1'] }])
  })

  it('答えなかったグループは行を作らない（空欄も「答えなかった」）', () => {
    expect(
      resolveGroupSelections(
        GROUPS,
        answers({ selectedGroupOptions: { g_multi: [] }, groupTextAnswers: { g_text: '   ' } })
      )
    ).toEqual([])
  })

  /*
    種類が食い違う回答は捨てる。**画面が送り分けているから安全、にしない** —
    保存の形を決めるのはここ1箇所でよい。
  */
  it('選択式へ届いた自由入力と、自由入力へ届いた選択肢は捨てる', () => {
    expect(
      resolveGroupSelections(
        GROUPS,
        answers({
          selectedGroupOptions: { g_text: ['o1'] },
          groupTextAnswers: { g_single: 'ここには書けない' },
        })
      )
    ).toEqual([])
  })
})
