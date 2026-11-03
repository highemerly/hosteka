import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { eventFormSchema, type EventFormValues } from '@/schemas/event'
import type { EventDetailDto, ViewerParticipationDto } from '@/server/serializers/event'

import { ParticipateDialog } from './ParticipateDialog'
import { buildPreviewEvent } from './preview-event'

/**
 * 参加登録モーダル。
 *
 * **満員・締切後は「参加」で送ってもサーバーが弾く。** リクエストだけが
 * 締切チェックを通り抜けるので、選択肢に「参加」を並べたままにすると
 * 「選べるのに送ると失敗する選択肢」ができる。実際、締切後は
 * `attending` を送っていた（満員しか見ていなかった）。
 */
const mutate = vi.fn()

vi.mock('@/lib/api/queries/events', () => ({
  useParticipate: () => ({ mutate, isPending: false }),
}))

const VALUES: EventFormValues = {
  title: 'Fediverse 交流会',
  description: '',
  hashtags: [],
  startDate: '2099-09-12',
  startTime: '',
  endDate: '',
  endTime: '',
  location: '',
  fee: '',
  relatedUrl: '',
  terms: '',
  maxParticipants: null,
  registrationDeadlineDate: '',
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  isPublic: true,
  isHighlighted: true,
  allowMaybe: true,
  allowParticipationRequest: true,
  organizationId: '',
  optionGroups: [],
}

function makeEvent(
  overrides: Partial<EventFormValues>,
  patch: Partial<EventDetailDto> = {}
): EventDetailDto {
  const base = buildPreviewEvent({
    values: eventFormSchema.parse({ ...VALUES, ...overrides }),
    viewer: null,
    organization: null,
    now: new Date('2026-07-01T00:00:00Z'),
  })
  return { ...base, ...patch }
}

/** 定員ちょうどまで埋まっている */
const full = (overrides: Partial<EventFormValues> = {}) =>
  makeEvent(
    { maxParticipants: 2, ...overrides },
    { counts: { attending: 2, maybe: 0, participationRequest: 0 } }
  )

/** 回答締切を過ぎている */
const closed = (overrides: Partial<EventFormValues> = {}) =>
  makeEvent({ registrationDeadlineDate: '2020-01-01', ...overrides })

function setup(
  event: EventDetailDto,
  participation: ViewerParticipationDto | null = null,
  mode: 'create' | 'edit' = 'create'
) {
  return render(
    <ParticipateDialog
      event={{ ...event, viewer: { ...event.viewer, participation } }}
      open
      onOpenChange={() => {}}
      mode={mode}
    />
  )
}

beforeEach(() => {
  mutate.mockClear()
})

describe('参加リクエストになる場面', () => {
  it.each([
    ['満員', full],
    ['回答締切を過ぎている', closed],
  ])('%s：出欠回答の選択肢を出さない', (_name, make) => {
    setup(make())

    expect(screen.queryByRole('radiogroup', { name: '出欠回答' })).toBeNull()
    for (const label of ['参加', '未定', '欠席']) {
      expect(screen.queryByRole('radio', { name: label })).toBeNull()
    }
  })

  it.each([
    ['満員', full],
    ['回答締切を過ぎている', closed],
  ])('%s：まだ確定ではないことを目立たせる', (_name, make) => {
    setup(make())

    expect(screen.getByText('この登録では参加は確定しません')).toBeTruthy()
    expect(screen.getByText(/主催者が承認すると参加が確定します/)).toBeTruthy()
  })

  it('「参加登録」とは名乗らない（押せば参加できると読める）', () => {
    setup(full())
    expect(screen.getByRole('heading', { name: '参加リクエスト' })).toBeTruthy()
  })

  it('リクエストになる理由を書く', () => {
    setup(full())
    expect(screen.getByText(/定員に達しているため/)).toBeTruthy()
  })

  it('締切後は締切を理由として書く', () => {
    setup(closed())
    expect(screen.getByText(/回答締切を過ぎているため/)).toBeTruthy()
  })

  it('participation_request として送る', () => {
    setup(full())
    fireEvent.click(screen.getByRole('button', { name: '参加をリクエストする' }))

    expect(mutate).toHaveBeenCalled()
    expect(mutate.mock.calls[0][0].input.status).toBe('participation_request')
  })

  it('締切後も participation_request として送る（以前は attending を送っていた）', () => {
    setup(closed())
    fireEvent.click(screen.getByRole('button', { name: '参加をリクエストする' }))

    expect(mutate.mock.calls[0][0].input.status).toBe('participation_request')
  })

  it('取り消した人は未回答と同じ扱い', () => {
    setup(full(), {
      status: 'cancelled',
      comment: null,
      termsAccepted: false,
      selectedOptionIds: [],
      optionTextAnswers: {},
    })
    expect(screen.getByText('この登録では参加は確定しません')).toBeTruthy()
  })
})

describe('通常の参加登録', () => {
  it('空きがあれば選択肢を出す', () => {
    setup(makeEvent({}))

    expect(screen.getByRole('radio', { name: '参加' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '欠席' })).toBeTruthy()
    expect(screen.queryByText('この登録では参加は確定しません')).toBeNull()
  })

  it('リクエストを受け付けないイベントは、満員でも通常の選択肢のまま', () => {
    // 詳細画面ではボタンが「満員のため受付を終了しました」になる。
    // ここで勝手にリクエストへ読み替えると、受け付けない設定を裏切る
    setup(full({ allowParticipationRequest: false }))

    expect(screen.getByRole('radio', { name: '参加' })).toBeTruthy()
    expect(screen.queryByText('この登録では参加は確定しません')).toBeNull()
  })

  it('既に参加で回答済みの人は、満員でもリクエスト扱いにしない', () => {
    // 内容を手直しするたびにリクエストへ落ちてしまう
    setup(full(), {
      status: 'attending',
      comment: null,
      termsAccepted: false,
      selectedOptionIds: [],
      optionTextAnswers: {},
    })
    expect(screen.queryByText('この登録では参加は確定しません')).toBeNull()
  })
})

/*
  **選べる先が1つでも、それが「今の状態」とは限らない。**
  キャンセルしたあと、「未定」を受け付けないイベントでは選べるのが
  「参加」だけになる。件数だけで「内容の手直し」と決めていたため、
  再登録しようとすると「参加として回答済みです」と出て**送れなかった。**
*/
describe('キャンセルしたあとの再登録', () => {
  const cancelled: ViewerParticipationDto = {
    status: 'cancelled',
    comment: null,
    termsAccepted: false,
    selectedOptionIds: [],
    optionTextAnswers: {},
  }

  it('「未定」を受け付けないイベントでも再登録できる', () => {
    setup(makeEvent({ allowMaybe: false }), cancelled)

    expect(screen.queryByText(/回答済みです/)).toBeNull()
    expect(screen.getByRole('button', { name: '参加で回答する' })).toBeTruthy()
  })

  /*
    **選択肢が1つでもセグメントのまま出す。** ここだけ文章に変えると
    「同じ操作のはずなのに画面が違う」ことになる。
  */
  it('選択肢が1つでも、普段と同じセグメントで出す', () => {
    setup(makeEvent({ allowMaybe: false }), cancelled)

    expect(screen.getByRole('radiogroup', { name: '出欠回答' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '参加' })).toBeTruthy()
  })

  it('「未定」も選べるイベントでは選択肢を出す', () => {
    setup(makeEvent({ allowMaybe: true }), cancelled)
    expect(screen.getByRole('radiogroup', { name: '出欠回答' })).toBeTruthy()
  })
})

/*
  参加リクエスト中の人は、承認を自分で出せない（選び直せる先が無い）。
  **今の状態をそのまま選択肢に並べる** — 以前は選択肢の既定値が
  `attending` に落ちていて、内容を直して送ると `attending` を送って
  サーバーに弾かれていた。
*/
describe('参加リクエスト中の人', () => {
  const pending: ViewerParticipationDto = {
    status: 'participation_request',
    comment: null,
    termsAccepted: false,
    selectedOptionIds: [],
    optionTextAnswers: {},
  }

  it('選び直せる先が無くても、今の状態は選択肢に出す', () => {
    setup(makeEvent({}), pending)

    const current = screen.getByRole('radio', { name: '参加リクエスト' })
    expect(current.getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('radio', { name: '参加' })).toBeNull()
  })

  it('内容を保存しても、状態は参加リクエストのまま送る', () => {
    setup(makeEvent({}), pending)
    fireEvent.click(screen.getByRole('button', { name: '内容を保存する' }))

    expect(mutate.mock.calls[0][0].input.status).toBe('participation_request')
  })

  it('取りやめる先はある', () => {
    setup(makeEvent({}), pending)
    expect(screen.getByRole('radio', { name: 'キャンセル' })).toBeTruthy()
  })
})

/*
  **キャンセルは出欠回答の選択肢に統合してある。**
  以前は確認つきの別モーダルに分けていたので、変更しに来た人が
  一度閉じて別のボタンを探すことになっていた。
*/
describe('参加のキャンセル', () => {
  const attending: ViewerParticipationDto = {
    status: 'attending',
    comment: null,
    termsAccepted: false,
    selectedOptionIds: [],
    optionTextAnswers: {},
  }

  const pick = () => fireEvent.click(screen.getByRole('radio', { name: 'キャンセル' }))

  it('回答済みの人には選択肢として並ぶ', () => {
    setup(makeEvent({}), attending, 'edit')
    expect(screen.getByRole('radio', { name: 'キャンセル' })).toBeTruthy()
  })

  it('まだ回答していない人には出さない（取りやめる回答が無い）', () => {
    setup(makeEvent({}))
    expect(screen.queryByRole('radio', { name: 'キャンセル' })).toBeNull()
  })

  /*
    欠席は既に「参加していない」ので、取り下げるものが無い
    （`lib/status-transition.ts`）。選べるのに送ると失敗する選択肢を出さない。
  */
  it('欠席で回答済みの人には出さない。参加・未定へ戻すだけ', () => {
    setup(
      makeEvent({}),
      {
        status: 'not_attending',
        comment: null,
        termsAccepted: false,
        selectedOptionIds: [],
        optionTextAnswers: {},
      },
      'edit'
    )

    expect(screen.queryByRole('radio', { name: 'キャンセル' })).toBeNull()
    for (const label of ['参加', '未定', '欠席']) {
      expect(screen.getByRole('radio', { name: label })).toBeTruthy()
    }
  })

  it('選ぶと、何が起きるかをその場で読ませる', () => {
    setup(makeEvent({}), attending, 'edit')
    pick()

    expect(screen.getByText('参加をキャンセルします')).toBeTruthy()
  })

  it('規約のあるイベントだけ、規約に従った対応が要ることを添える', () => {
    setup(makeEvent({ terms: '## 参加規約\n\n遅刻しないこと' }), attending, 'edit')
    pick()

    expect(screen.getByText('規約に従った対応が必要となる場合があります')).toBeTruthy()
  })

  it('規約が無ければ添えない', () => {
    setup(makeEvent({}), attending, 'edit')
    pick()

    expect(screen.queryByText('規約に従った対応が必要となる場合があります')).toBeNull()
  })

  it('cancelled として送る', () => {
    setup(makeEvent({}), attending, 'edit')
    pick()
    fireEvent.click(screen.getByRole('button', { name: '参加をキャンセルする' }))

    expect(mutate.mock.calls[0][0].input.status).toBe('cancelled')
    expect(mutate.mock.calls[0][0].isUpdate).toBe(true)
  })

  /*
    キャンセルは記録の削除ではない。行は `cancelled` として残り、
    コメントは参加者一覧にも CSV にも出る。**書き直せなければならない** —
    隠していた頃は、参加のときに書いた一言がそのまま送られていた。
  */
  it('キャンセルでもコメントを書ける', () => {
    setup(makeEvent({}), attending, 'edit')
    pick()

    const box = screen.getByLabelText('コメント（任意・参加者一覧に公開）')
    fireEvent.change(box, { target: { value: '急用で行けなくなりました' } })
    fireEvent.click(screen.getByRole('button', { name: '参加をキャンセルする' }))

    expect(mutate.mock.calls[0][0].input.comment).toBe('急用で行けなくなりました')
  })

  /*
    来る人と来られない人では書くことが違う。手本が1つだと片方に寄る。
  */
  it('キャンセルでは手本もキャンセルのものにする', () => {
    setup(makeEvent({}), attending, 'edit')

    const box = screen.getByLabelText('コメント（任意・参加者一覧に公開）')
    expect(box.getAttribute('placeholder')).toBe('楽しみです！')

    pick()
    expect(box.getAttribute('placeholder')).toBe('参加される方は楽しんでください！')
  })

  it('参加のときのコメントを消して送れる', () => {
    setup(
      makeEvent({}),
      { ...attending, comment: '楽しみにしています' },
      'edit'
    )
    pick()

    fireEvent.change(screen.getByLabelText('コメント（任意・参加者一覧に公開）'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '参加をキャンセルする' }))

    expect(mutate.mock.calls[0][0].input.comment).toBeUndefined()
  })

  it('規約があっても、キャンセルには同意を求めない', () => {
    setup(makeEvent({ terms: '## 参加規約' }), attending, 'edit')
    pick()

    expect(screen.queryByText('参加規約への同意が必要です')).toBeNull()
    expect(
      screen.getByRole('button', { name: '参加をキャンセルする' }).hasAttribute('disabled')
    ).toBe(false)
  })
})

describe('自由入力のオプション', () => {
  const TEXT_GROUP: EventFormValues['optionGroups'] = [
    { title: 'どこで知りましたか', responseType: 'text', options: [] },
  ]

  /** 自由入力のグループは、プレビューと同じ規則で id が決まる */
  const groupId = (event: EventDetailDto) => event.optionGroups[0].id

  it('選択肢ではなく入力欄を出し、書いた本文を送る', () => {
    const event = makeEvent({ optionGroups: TEXT_GROUP })
    setup(event)

    expect(screen.queryByRole('radiogroup', { name: 'どこで知りましたか' })).toBeNull()

    fireEvent.change(screen.getByLabelText('どこで知りましたか'), {
      target: { value: '友人から' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加で回答する' }))

    expect(mutate.mock.calls[0][0].input.groupTextAnswers).toEqual({
      [groupId(event)]: '友人から',
    })
  })

  /*
    **書くことが無い人に書かせない。** 単一選択と違い、空欄でも送れる。
    サーバーも空欄は「答えなかった」として扱う。
  */
  it('空欄のままでも送れる', () => {
    setup(makeEvent({ optionGroups: TEXT_GROUP }))

    expect(screen.queryByText('選択が必要な項目があります')).toBeNull()
    expect(
      screen.getByRole('button', { name: '参加で回答する' }).hasAttribute('disabled')
    ).toBe(false)
  })

  it('上限を超えたら、送る前に止めて理由を出す', () => {
    setup(makeEvent({ optionGroups: TEXT_GROUP }))

    fireEvent.change(screen.getByLabelText('どこで知りましたか'), {
      target: { value: 'あ'.repeat(101) },
    })

    expect(screen.getByText('回答は100文字以内で入力してください')).toBeTruthy()
    expect(screen.getByRole('button', { name: '参加で回答する' }).hasAttribute('disabled')).toBe(
      true
    )
  })

  /*
    開いて保存しただけで消える事故は、参加者側にも同じ形で起きる。
    変更のときは前に書いた本文を出しておく。
  */
  it('変更では前に書いた本文を出す', () => {
    const event = makeEvent({ optionGroups: TEXT_GROUP })
    setup(
      event,
      {
        status: 'attending',
        comment: null,
        termsAccepted: false,
        selectedOptionIds: [],
        optionTextAnswers: { [groupId(event)]: '主催者のポストを見て' },
      },
      'edit'
    )

    expect(
      (screen.getByLabelText('どこで知りましたか') as HTMLInputElement).value
    ).toBe('主催者のポストを見て')
  })
})
