import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ContactScreen, type RecipientGroup } from './ContactScreen'
import type { ContactUser } from './mentions'
import type { ContactViewer } from './post-method'

// UnsavedChangesGuard が useRouter を呼ぶ。app router はテストに無い
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const user = (over: Partial<ContactUser>): ContactUser => ({
  id: 'u1',
  username: 'alice',
  displayName: 'Alice',
  avatar: null,
  server: 'handon.club',
  platform: 'mastodon',
  ...over,
})

const alice = user({})
const bob = user({ id: 'u2', username: 'bob', displayName: 'Bob', server: 'x.com', platform: 'twitter' })

const viewer = (over: Partial<ContactViewer> = {}): ContactViewer => ({
  platform: 'mastodon',
  server: 'handon.club',
  mayPostDirectly: true,
  canPostDirectly: true,
  ...over,
})

const open = vi.fn()
const onPost = vi.fn(async () => ({ sent: 1 }))

function renderScreen(
  over: { viewer?: ContactViewer; groups?: RecipientGroup[]; defaultGroupIds?: string[] } = {}
) {
  return render(
    <ContactScreen
      id="event_1"
      backHref="/events/event_1"
      backLabel="イベントに戻る"
      heading="参加者への連絡"
      subject="忘年会"
      targetUrl="https://hosteka.example/events/event_1"
      draftKey="draft"
      viewer={over.viewer ?? viewer()}
      groups={over.groups ?? [{ id: 'attending', label: '参加予定', users: [alice, bob] }]}
      defaultGroupIds={over.defaultGroupIds ?? ['attending']}
      unreachableCount={0}
      unreachableNote=""
      registrationDeadline={null}
      posting={false}
      onPost={onPost}
    />
  )
}

const chooseExternal = () =>
  fireEvent.click(screen.getByRole('radio', { name: /サーバーへ移動して手動で投稿/ }))

/** 投稿方法の選択肢。画面には他の択一（いますぐ／予約）もあるので、まとまりで絞る */
const methodChoices = () =>
  within(screen.getByRole('radiogroup', { name: '投稿方法' })).getAllByRole('radio')

/** 投稿画面を開くボタン。押した先のURLで中身を確かめる */
const externalButtons = () => screen.getAllByRole('button', { name: /へ移動して投稿/ })
const openedUrl = (call = 0) => new URL(open.mock.calls[call][0] as string)

beforeEach(() => {
  sessionStorage.clear()
  open.mockClear()
  onPost.mockClear()
  vi.stubGlobal('open', open)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('連絡画面', () => {
  it('投稿方法は2つだけで、宛先より先に出す', () => {
    renderScreen()

    expect(methodChoices().map((el) => el.textContent)).toEqual([
      expect.stringContaining('Hosteka から直接投稿'),
      expect.stringContaining('サーバーへ移動して手動で投稿'),
    ])

    const headings = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent)
    expect(headings).toEqual(['投稿方法', '宛先', '本文', '送信'])
  })

  it('束が「参加予定」1つでも、選ぶチップを出す', () => {
    renderScreen()

    const chip = screen.getByRole('button', { name: /参加予定/ })
    expect(chip.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('この投稿で届く相手はいません')).toBeTruthy()
  })

  it('直接投稿は X の人に届かないことを言い、投稿には入れない', async () => {
    renderScreen()

    expect(screen.getByText('X の1人には直接投稿では届きません')).toBeTruthy()
    expect(screen.getByText('この投稿で届く相手 1人')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '投稿する' }))
    await vi.waitFor(() => expect(onPost).toHaveBeenCalled())
    expect(onPost).toHaveBeenCalledWith(
      expect.objectContaining({
        posts: ['@alice\n\n忘年会のお知らせです。\n\nhttps://hosteka.example/events/event_1'],
        recipientIds: ['u1'],
      })
    )
  })

  it('権限が無いうちは本文の欄が無いので、「書きかけは残る」とは言わない', () => {
    renderScreen({ viewer: viewer({ canPostDirectly: false }) })
    fireEvent.click(screen.getByRole('radio', { name: /Hosteka から直接投稿/ }))

    expect(screen.getByText('Hosteka から直接投稿するには、投稿の権限が必要です。')).toBeTruthy()
    expect(screen.queryByLabelText('メッセージ')).toBeNull()
    expect(screen.queryByText(/書きかけの内容/)).toBeNull()
  })

  it('いますぐ投稿か予約投稿かを選ばせる。予約を選ぶと日時を聞く', () => {
    renderScreen()

    const now = screen.getByRole('radio', { name: 'いますぐ投稿' })
    const later = screen.getByRole('radio', { name: '予約投稿' })
    expect(now.getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByLabelText('送る日時')).toBeNull()

    fireEvent.click(later)
    expect(later.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('送る日時')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'この日時に送る' })).toBeTruthy()

    fireEvent.click(now)
    expect(screen.queryByLabelText('送る日時')).toBeNull()
  })

  it('予約は Mastodon だけ。他では選ばせない', () => {
    renderScreen({ viewer: viewer({ platform: 'misskey' }) })
    expect(screen.queryByRole('radio', { name: '予約投稿' })).toBeNull()
    expect(screen.getByRole('button', { name: '投稿する' })).toBeTruthy()
  })

  it('投稿画面へ移動するときは、投稿先ごとにボタンを出す', () => {
    renderScreen()
    chooseExternal()

    expect(externalButtons().map((el) => el.textContent)).toEqual([
      'handon.club へ移動して投稿（1人）',
      'x.com へ移動して投稿（1人）',
    ])
    expect(screen.getByText('この投稿で届く相手 2人')).toBeTruthy()
    expect(screen.getByText('Fediverse と X では投稿が分かれます')).toBeTruthy()

    externalButtons().forEach((el) => fireEvent.click(el))
    expect(openedUrl(0).searchParams.get('i')).toBe('handon.club')
    expect(openedUrl(0).searchParams.get('t')).toMatch(/^@alice\n\n忘年会/)
    expect(openedUrl(1).searchParams.get('i')).toBe('x.com')
    expect(openedUrl(1).searchParams.get('t')).toMatch(/^@bob\n\n忘年会/)
  })

  it('公開範囲を選ばせるのは直接投稿のときだけ', () => {
    renderScreen()
    expect(screen.getByLabelText('公開範囲')).toBeTruthy()

    chooseExternal()
    expect(screen.queryByLabelText('公開範囲')).toBeNull()

    fireEvent.click(externalButtons()[0])
    expect(openedUrl().searchParams.get('v')).toBe('public')
  })

  it('投稿元サーバーは自分のサーバーが入っていて、書き換えられる', () => {
    renderScreen()
    chooseExternal()

    const input = screen.getByLabelText('投稿元サーバー') as HTMLInputElement
    expect(input.value).toBe('handon.club')

    // URL ごと貼られても通す
    fireEvent.change(input, { target: { value: 'https://Mstdn.Example/' } })
    expect(externalButtons()[0].textContent).toBe('mstdn.example へ移動して投稿（1人）')

    fireEvent.click(externalButtons()[0])
    expect(openedUrl().searchParams.get('i')).toBe('mstdn.example')
    // 投稿元が変わったので、handon.club の相手はもう縮められない
    expect(openedUrl().searchParams.get('t')).toMatch(/^@alice@handon\.club\n\n/)
  })

  it('ホスト名として読めない投稿元では Fediverse あてを押せない。X あては押せる', () => {
    renderScreen()
    chooseExternal()

    fireEvent.change(screen.getByLabelText('投稿元サーバー'), { target: { value: 'handon' } })
    expect(screen.getByRole('alert').textContent).toBe('有効なホスト名を入力してください')

    const [fediverse, twitter] = externalButtons() as HTMLButtonElement[]
    expect(fediverse.disabled).toBe(true)
    expect(twitter.disabled).toBe(false)
  })

  it('Fediverse で入っていない人には投稿元サーバーを聞かない', () => {
    renderScreen({
      viewer: viewer({ platform: 'twitter', server: 'x.com', canPostDirectly: false }),
    })

    // 直接投稿できないので、選べる方法は1つ
    expect(methodChoices()).toHaveLength(1)
    expect(screen.queryByLabelText('投稿元サーバー')).toBeNull()
    expect(externalButtons().map((el) => el.textContent)).toEqual([
      'x.com へ移動して投稿（1人）',
      'Fediverse サーバーへ移動して投稿（1人）',
    ])
  })

  it('分割したときも、ボタンは全部 primary にする', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      user({ id: `x${i}`, username: `twitter_user_${i}`, server: 'x.com', platform: 'twitter' })
    )
    renderScreen({ groups: [{ id: 'attending', label: '参加予定', users: [alice, ...many] }] })
    chooseExternal()

    const buttons = externalButtons()
    expect(buttons.length).toBeGreaterThan(2)
    expect(buttons[1].textContent).toMatch(/^x\.com へ移動して投稿（1\/\d+・\d+人）$/)
    expect(buttons.map((el) => el.getAttribute('data-variant'))).toEqual(
      buttons.map(() => 'primary')
    )
  })

  it('宛先がいなくても投稿画面へは行ける。人数は書かない', () => {
    renderScreen({ groups: [{ id: 'all', label: '回答者全員', users: [] }], defaultGroupIds: ['all'] })
    chooseExternal()

    expect(externalButtons().map((el) => el.textContent)).toEqual(['handon.club へ移動して投稿'])
  })
})
