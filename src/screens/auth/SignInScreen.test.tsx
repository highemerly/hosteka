import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STORAGE_SERVER } from '@/lib/storage-keys'

import SignInScreen from './SignInScreen'

/**
 * ログイン画面。
 *
 * **選んだプラットフォームによって、送る先も送る中身も変わる。**
 * 旧画面はその分岐を JSX と送信処理に散らしていて、Misskey・Discord・X の
 * 3つが返り値の形の食い違いで動かなくなっていた（画面上は
 * 「ネットワークエラー」としか出ない）。ここでは「何をどこへ送ったか」を見る。
 */
const post = vi.fn()

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { post: (...args: unknown[]) => post(...args) },
}))

let params = new URLSearchParams()
/** スマホ幅か。`matchMedia('(max-width: …)')` の答え */
let narrow = false
/** `scrollIntoView` を呼ばれた要素。jsdom は実装していない */
const scrolled = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => params,
}))

/** ログイン中のアカウント（viewer cookie）。既定は未ログイン */
let viewer: { platform: string; server: string } | null = null
vi.mock('@/hooks/useViewer', () => ({
  useViewer: () => ({ viewer, status: viewer ? 'authed' : 'anonymous' }),
}))

beforeEach(() => {
  localStorage.clear()
  params = new URLSearchParams()
  viewer = null
  post.mockReset()
  post.mockResolvedValue({ authUrl: 'https://mastodon.social/oauth/authorize?x=1' })
  vi.stubGlobal('location', { href: '' })
  narrow = false
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') ? narrow : false,
  }))
  scrolled.mockReset()
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled(this)
  }
})

const choose = (label: string) =>
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(label) }))
const termsCheckbox = () => screen.getByRole('checkbox', { name: /利用規約/ })
/** 規約への同意を入れる。**入れないと送れない**ので、送る前に必ず通る */
const agree = () => fireEvent.click(termsCheckbox())
const submit = () => fireEvent.click(screen.getByRole('button', { name: /ログイン$/ }))

describe('ログイン画面', () => {
  it('プラットフォームを選ぶまで、ホスト名の欄は出ない', () => {
    render(<SignInScreen />)
    expect(screen.queryByLabelText(/ホスト名/)).toBeNull()
  })

  /**
   * **権限の選択は取り直しのときだけ出す。** 大半の人は見て参加登録する
   * だけなので、選ぶものを増やさない。
   */
  it('Mastodon を選ぶと、ホスト名の欄が出る。権限の選択は出ない', () => {
    render(<SignInScreen />)
    choose('Mastodon')

    expect(screen.getByLabelText(/Mastodonサーバーのホスト名/)).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Hosteka に許可する権限' })).toBeNull()
  })

  it('ふつうのログインでは、投稿の権限を頼まない', async () => {
    render(<SignInScreen />)
    choose('Mastodon')
    fireEvent.change(screen.getByLabelText(/ホスト名/), { target: { value: 'handon.club' } })
    agree()
    submit()
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/auth/mastodon/register',
        expect.objectContaining({ requestWritePermission: false })
      )
    )
  })

  /**
   * 取り直しはログイン中のアカウントに権限を足すためのもの。
   * **アカウントも読み取り／投稿も選ばせない** — 別のサーバーを入れると
   * 別のアカウントでログインし直すだけになる。その代わり、投稿権限を
   * 付与することを、どのアカウントかまで明記する。
   */
  const UPGRADE = {
    requestWrite: 'true',
    platform: 'mastodon',
    server: 'handon.club',
    callbackUrl: '/events/abc/contact',
  }

  it('取り直しでは、何を付与するかを明記し、アカウントは聞かない。同意は聞く', () => {
    viewer = { platform: 'mastodon', server: 'handon.club' }
    params = new URLSearchParams(UPGRADE)
    render(<SignInScreen />)

    expect(screen.getByRole('heading', { name: '投稿権限を付与' })).toBeTruthy()
    expect(screen.getByText('再ログインして投稿権限を付与します')).toBeTruthy()
    expect(screen.getByText(/handon\.club の Mastodon アカウント/)).toBeTruthy()

    expect(screen.queryByRole('radiogroup', { name: 'ログインに使うプラットフォーム' })).toBeNull()
    expect(screen.queryByLabelText(/ホスト名/)).toBeNull()
    // 同意はふつうのログインと同じく取る
    expect(termsCheckbox()).toBeTruthy()
    expect(screen.getByRole('button', { name: /必要な権限は/ })).toBeTruthy()
  })

  it('取り直しでは、URL のアカウントで投稿の権限を頼む', async () => {
    viewer = { platform: 'mastodon', server: 'handon.club' }
    params = new URLSearchParams(UPGRADE)
    render(<SignInScreen />)
    agree()
    submit()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/v1/auth/mastodon/register', {
        callbackUrl: '/events/abc/contact',
        termsAccepted: true,
        server: 'handon.club',
        requestWritePermission: true,
      })
    )
  })

  it('取り直しでも、同意しないまま押すと送らない', () => {
    viewer = { platform: 'mastodon', server: 'handon.club' }
    params = new URLSearchParams(UPGRADE)
    render(<SignInScreen />)
    submit()

    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('利用規約への同意が必要です')
  })

  /*
    **URL は誰でも作れる。** ログイン中のアカウントと一致しなければ、選ぶ欄を
    隠さず、URL のサーバーも入れない（見知らぬサーバーの認可画面へ送らせない）。
  */
  it('取り直しでも、URL のサーバーがログイン中のアカウントと違えば、選ばせて、URL のサーバーは入れない', () => {
    viewer = { platform: 'mastodon', server: 'handon.club' }
    params = new URLSearchParams({ ...UPGRADE, server: 'evil.example' })
    render(<SignInScreen />)

    expect(screen.queryByText('再ログインして投稿権限を付与します')).toBeNull()
    expect(screen.queryByText(/evil\.example/)).toBeNull()
    expect((screen.getByLabelText(/ホスト名/) as HTMLInputElement).value).toBe('')
  })

  it('取り直しでも、ログインしていなければ選ばせる', () => {
    params = new URLSearchParams(UPGRADE)
    render(<SignInScreen />)

    expect(screen.queryByText('再ログインして投稿権限を付与します')).toBeNull()
    expect((screen.getByLabelText(/ホスト名/) as HTMLInputElement).value).toBe('')
  })

  it('取り直しでも、ログイン中のプラットフォームが違えば選ばせる', () => {
    viewer = { platform: 'misskey', server: 'handon.club' }
    params = new URLSearchParams(UPGRADE)
    render(<SignInScreen />)

    expect(screen.queryByText('再ログインして投稿権限を付与します')).toBeNull()
  })

  it('取り直しでも URL にサーバーが無ければ、ふつうのログインと同じく選ばせる', () => {
    params = new URLSearchParams({ requestWrite: 'true', platform: 'mastodon' })
    render(<SignInScreen />)

    expect(screen.queryByText('再ログインして投稿権限を付与します')).toBeNull()
    expect(screen.getByLabelText(/ホスト名/)).toBeTruthy()
    expect(termsCheckbox()).toBeTruthy()
  })

  it('ふつうのログインでは、投稿権限を付与するとは書かない', () => {
    render(<SignInScreen />)
    choose('Mastodon')

    expect(screen.queryByText('再ログインして投稿権限を付与します')).toBeNull()
  })

  it('ボタンの文言で、どこでログインするかを言う', () => {
    render(<SignInScreen />)
    choose('Mastodon')
    expect(screen.getByRole('button', { name: 'サーバーでログイン' })).toBeTruthy()

    choose('Discord')
    expect(screen.getByRole('button', { name: 'Discordでログイン' })).toBeTruthy()
  })

  /** 選ぶ前に出しても意味が無く、最初の画面で目に入るものが増えるだけ */
  it('プラットフォームを選ぶまで、同意もログインボタンも出さない', () => {
    render(<SignInScreen />)

    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /ログイン$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: '必要な権限は？' })).toBeNull()
  })

  /**
   * **最初から入っている同意は同意ではない。** 以前は「ログインすると
   * 同意したものとして扱います」と書くだけで、読まずに進めた。
   *
   * ボタンは非活性にしない。押せない理由がどこにも出ないので、押させてから
   * 箱の下で言う。
   */
  it('規約に同意しないまま押すと、送らずに吹き出しで言う。同意すると消える', async () => {
    render(<SignInScreen />)
    choose('Discord')
    submit()

    expect(post).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('利用規約への同意が必要です')
    expect(document.activeElement).toBe(termsCheckbox())

    agree()
    expect(screen.queryByRole('alert')).toBeNull()

    submit()
    await waitFor(() => expect(post).toHaveBeenCalled())
  })

  /**
   * 同意を取るのは利用規約だけ。権限とプライバシーポリシーは開けば
   * 確かめられる札にする。同意の箱が増えても、読まれるわけではない。
   */
  it('同意の箱は利用規約の1つだけ', () => {
    render(<SignInScreen />)
    choose('Mastodon')

    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByText('に同意します').closest('label')?.textContent).toBe('利用規約に同意します')
  })

  it('利用規約はモーダルで読める。開いただけでは同意は入らない', async () => {
    render(<SignInScreen />)
    choose('Discord')
    fireEvent.click(screen.getByRole('button', { name: '利用規約' }))

    const dialog = await screen.findByRole('dialog', { name: 'サービス利用規約' })
    // 同意する対象そのものが読める。`/terms` と同じ本文を出している
    expect(dialog.textContent).toContain('特に重要なルール')
    expect(dialog.textContent).toContain('禁止されるイベント等')
    // モーダルの外は読み上げから隠れている
    expect(
      screen.getByRole('checkbox', { name: /利用規約/, hidden: true }).getAttribute('aria-checked')
    ).toBe('false')
  })

  it('「個人情報はどう扱われますか？」でプライバシーポリシーが読める', async () => {
    render(<SignInScreen />)
    choose('Discord')
    fireEvent.click(screen.getByRole('button', { name: /個人情報はどう扱われますか/ }))

    const dialog = await screen.findByRole('dialog', { name: 'プライバシーポリシー' })
    expect(dialog.textContent).toContain('収集する個人情報とその収集方法')
  })

  /** 説明は register ルートが要求する scope と同じ表から出る（`lib/oauth-scopes.ts`） */
  it('「必要な権限は？」には、そのとき要求する権限だけが出る', async () => {
    render(<SignInScreen />)
    choose('Mastodon')
    fireEvent.click(screen.getByRole('button', { name: /必要な権限は/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Hosteka が Mastodon に求める権限' })
    expect(dialog.textContent).toContain('read:accounts')
    expect(dialog.textContent).not.toContain('write:statuses')
  })

  it('取り直しでは、権限のモーダルに投稿の権限も出る', async () => {
    params = new URLSearchParams({ requestWrite: 'true', platform: 'misskey', server: 'misskey.io' })
    render(<SignInScreen />)
    fireEvent.click(screen.getByRole('button', { name: /必要な権限は/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('read:account')
    expect(dialog.textContent).toContain('write:notes')
  })

  it('X はホスト名を要らないので、欄を出さない', () => {
    render(<SignInScreen />)
    choose('X \\(Twitter\\)')

    expect(screen.queryByLabelText(/ホスト名/)).toBeNull()
  })

  /** Pleroma の register ルートは読み取り専用のスコープしか要求しない */
  it('投稿の権限を頼めないプラットフォームでは、取り直しでも付与するとは書かない', () => {
    params = new URLSearchParams({ requestWrite: 'true', platform: 'pleroma', server: 'blob.cat' })
    render(<SignInScreen />)

    expect(screen.queryByText('再ログインして投稿権限を付与します')).toBeNull()
  })

  it('ホスト名が空のまま送ると、欄の下に理由を出して送らない', async () => {
    render(<SignInScreen />)
    choose('Misskey')
    agree()
    submit()

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })

  it('URL ごと貼られたホスト名は整形して送り、返った認証URLへ飛ぶ', async () => {
    render(<SignInScreen />)
    choose('Mastodon')
    fireEvent.change(screen.getByLabelText(/ホスト名/), {
      target: { value: 'https://handon.club/' },
    })
    agree()
    submit()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/v1/auth/mastodon/register', {
        callbackUrl: '/',
        termsAccepted: true,
        server: 'handon.club',
        requestWritePermission: false,
      })
    )
    await waitFor(() =>
      expect(window.location.href).toBe('https://mastodon.social/oauth/authorize?x=1')
    )
  })

  it('ホスト名の要らないプラットフォームには server を送らない', async () => {
    render(<SignInScreen />)
    choose('Discord')
    agree()
    submit()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/v1/auth/discord/register', {
        callbackUrl: '/',
        termsAccepted: true,
      })
    )
  })

  it('戻り先は URL の callbackUrl をそのまま渡す', async () => {
    params = new URLSearchParams({ callbackUrl: '/events/abc' })
    render(<SignInScreen />)
    choose('Discord')
    agree()
    submit()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/v1/auth/discord/register', {
        callbackUrl: '/events/abc',
        termsAccepted: true,
      })
    )
  })

  /**
   * **弾かれて来た人には、まず理由を出す。** 何の説明もなくログイン画面に
   * 立たされると、押し間違えたのか機能が消えたのかが分からない。
   */
  it('弾かれて来たときは、何をするのにログインが要るのかを出す', () => {
    params = new URLSearchParams({ callbackUrl: '/events/create' })
    render(<SignInScreen />)

    expect(screen.getByText(/イベントを作成するには、SNS アカウントでのログインが必要です/)).toBeTruthy()
  })

  it('直接ログイン画面へ来た人には、用件を決めつけない', () => {
    render(<SignInScreen />)

    expect(screen.queryByText(/ログインが必要です/)).toBeNull()
  })

  /**
   * 権限を渡せないプラットフォームで権限の取り直しに来ることがある
   * （連絡画面は相手を選ばず飛ばす）。**黙って何も起きない形にしない。**
   */
  it('権限を渡せないプラットフォームでは、その旨を出す', () => {
    params = new URLSearchParams({ requestWrite: 'true', platform: 'pleroma' })
    render(<SignInScreen />)

    expect(screen.getByText(/Pleromaでは Hosteka から直接投稿できません/)).toBeTruthy()
  })

  it('選んでいるプラットフォームをもう一度押しても、入力済みのホスト名を消さない', () => {
    render(<SignInScreen />)
    choose('Mastodon')
    fireEvent.change(screen.getByLabelText(/ホスト名/), { target: { value: 'handon.club' } })
    choose('Mastodon')

    expect(screen.getByLabelText(/ホスト名/)).toHaveProperty('value', 'handon.club')
  })

  it('別のプラットフォームへ切り替えたら、前のホスト名は持ち越さない', () => {
    render(<SignInScreen />)
    choose('Mastodon')
    fireEvent.change(screen.getByLabelText(/ホスト名/), { target: { value: 'handon.club' } })
    choose('Misskey')

    expect(screen.getByLabelText(/ホスト名/)).toHaveProperty('value', '')
  })

  /**
   * スマホでは選択肢が2行を占め、次に入れるものが画面の外へ出る。
   * 広い画面では押した物のすぐ下に見えているので、動かさない。
   */
  describe('プラットフォームを押したあとのスクロール', () => {
    it('スマホ幅では、ホスト名の欄まで送る', () => {
      narrow = true
      render(<SignInScreen />)
      choose('Mastodon')

      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(scrolled.mock.calls[0][0].contains(screen.getByLabelText(/ホスト名/))).toBe(true)
    })

    it('スマホ幅でホスト名の要らないものは、規約への同意まで送る', () => {
      narrow = true
      render(<SignInScreen />)
      choose('Discord')

      expect(scrolled).toHaveBeenCalledTimes(1)
      expect(scrolled.mock.calls[0][0].contains(termsCheckbox())).toBe(true)
    })

    it('スマホ幅で選択中のものをもう一度押しても送る', () => {
      narrow = true
      render(<SignInScreen />)
      choose('Mastodon')
      choose('Mastodon')

      expect(scrolled).toHaveBeenCalledTimes(2)
    })

    it('広い画面では送らない', () => {
      render(<SignInScreen />)
      choose('Mastodon')

      expect(scrolled).not.toHaveBeenCalled()
    })

    it('URL からプラットフォームが埋まった初期表示では送らない', () => {
      narrow = true
      params = new URLSearchParams({ platform: 'mastodon' })
      render(<SignInScreen />)

      expect(scrolled).not.toHaveBeenCalled()
    })
  })

  it('認証URLが返らなかったときは、行き先の無い遷移をしない', async () => {
    post.mockResolvedValue({})
    render(<SignInScreen />)
    choose('Discord')
    agree()
    submit()

    expect(await screen.findByText('ネットワークエラーが発生しました')).toBeTruthy()
    expect(window.location.href).toBe('')
  })
})

describe('前回ログインしたサーバー', () => {
  it('覚えているホスト名が、そのプラットフォームを選ぶと入っている', async () => {
    localStorage.setItem(STORAGE_SERVER, JSON.stringify({ mastodon: 'handon.club' }))
    render(<SignInScreen />)
    choose('Mastodon')

    await waitFor(() =>
      expect((screen.getByLabelText(/ホスト名/) as HTMLInputElement).value).toBe('handon.club')
    )
  })

  it('別のプラットフォームのホスト名は入らない', () => {
    localStorage.setItem(STORAGE_SERVER, JSON.stringify({ mastodon: 'handon.club' }))
    render(<SignInScreen />)
    choose('Misskey')

    expect((screen.getByLabelText(/ホスト名/) as HTMLInputElement).value).toBe('')
  })

  it('ログインに進むと、入れたホスト名を覚える。Cookie には書かない', async () => {
    render(<SignInScreen />)
    choose('Mastodon')
    fireEvent.change(screen.getByLabelText(/ホスト名/), { target: { value: 'https://handon.club/' } })
    agree()
    submit()

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_SERVER) ?? '{}')).toEqual({
        mastodon: 'handon.club',
      })
    )
    expect(document.cookie).toBe('')
  })
})
