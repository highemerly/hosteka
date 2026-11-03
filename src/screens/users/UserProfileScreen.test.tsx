import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UserProfileScreen from './UserProfileScreen'

/**
 * ユーザーのページ。
 *
 * **本題はメールアドレスの出し方。** 未ログインには欄ごと出さず、
 * ログイン中でも押されるまで取りにいかない（ログイン済みのクローラーに
 * 一覧を舐めさせないため）。ここが崩れると、収集対策そのものが無くなる。
 */
const state: { data?: unknown; isPending: boolean; error?: unknown } = {
  data: undefined,
  isPending: false,
}

let viewerId: string | null = null
const emailState: { data?: { email: string | null }; isFetching: boolean } = { isFetching: false }
const emailEnabled: boolean[] = []

const listState: {
  events: { data?: unknown; isPending: boolean; error?: unknown }
  preEvents: { data?: unknown; isPending: boolean; error?: unknown }
} = {
  events: { isPending: false },
  preEvents: { isPending: false },
}
/** どちらのタブを取りにいったか。開いていない側は取りにいかない */
const listEnabled: { events: boolean[]; preEvents: boolean[] } = { events: [], preEvents: [] }
const requestedPages: number[] = []
const requestedScopes: string[] = []

vi.mock('@/lib/api/queries/users', () => ({
  useUserProfile: () => state,
  useUserEmail: (_handle: string, options: { enabled: boolean }) => {
    emailEnabled.push(options.enabled)
    return options.enabled ? emailState : { data: undefined, isFetching: false }
  },
  useUserEvents: (
    _handle: string,
    scope: string,
    page: number,
    options: { enabled: boolean }
  ) => {
    listEnabled.events.push(options.enabled)
    if (options.enabled) {
      requestedPages.push(page)
      requestedScopes.push(scope)
    }
    return listState.events
  },
  useUserPreEvents: (
    _handle: string,
    scope: string,
    page: number,
    options: { enabled: boolean }
  ) => {
    listEnabled.preEvents.push(options.enabled)
    if (options.enabled) {
      requestedPages.push(page)
      requestedScopes.push(scope)
    }
    return listState.preEvents
  },
}))
vi.mock('@/hooks/useViewer', () => ({
  useViewer: () => ({
    viewer: viewerId
      ? {
          id: viewerId,
          name: 'テスト',
          username: 'taro',
          server: 'example.social',
          platform: 'mastodon',
        }
      : null,
    status: viewerId ? 'authed' : 'anonymous',
  }),
}))

const PROFILE = {
  user: {
    id: 'user_1',
    username: 'taro',
    displayName: 'テスト太郎',
    avatar: null,
    server: 'example.social',
    platform: 'mastodon',
  },
  joinedAt: '2026-01-15T00:00:00.000Z',
  bio: null,
  socialAccounts: [] as { platform: string; username: string; server: string }[],
  homepageUrls: [] as string[],
  hasEmail: false,
  organizations: [] as { id: string; slug: string; name: string; role: string }[],
  stats: {
    all: { events: 12, preEvents: 3, people: 87 },
    personal: { events: 5, preEvents: 1, people: 20 },
  },
}

const ORG = { id: 'org_1', slug: 'my-group', name: 'わたしの会', role: 'staff' }

const emptyList = { items: [], meta: { total: 0, page: 1, perPage: 12, totalPages: 0 } }

/** 一覧カード（`toEventAttendable`）が読む最小限の形 */
function listOf(ids: string[], totalPages = 1) {
  return {
    items: ids.map((id) => ({
      id,
      title: `イベント${id}`,
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: null,
      hasStartTime: true,
      hasEndTime: false,
      location: null,
      hashtags: [],
      status: 'scheduled',
      maxParticipants: null,
      attendingCount: 0,
      attendees: [],
      registrationDeadline: null,
      creator: PROFILE.user,
      organization: null,
    })),
    meta: { total: ids.length, page: 1, perPage: 12, totalPages },
  }
}

beforeEach(() => {
  state.data = PROFILE
  state.isPending = false
  state.error = undefined
  viewerId = null
  emailState.data = undefined
  emailState.isFetching = false
  emailEnabled.length = 0
  listState.events = { data: emptyList, isPending: false, error: undefined }
  listState.preEvents = { data: emptyList, isPending: false, error: undefined }
  listEnabled.events.length = 0
  listEnabled.preEvents.length = 0
  requestedPages.length = 0
  requestedScopes.length = 0
})

const emailButton = () => screen.queryByRole('button', { name: /メールアドレスを表示/ })

/** ホームページとメールは同じ行に並べる。どちらも「この人に届く場所」 */
const contactRow = () => emailButton()?.closest('ul')

describe('ユーザーのページ', () => {
  /*
    **IDはSNSの一覧に1回だけ出す。** ヘッダーにも置くと、同じ文字列が
    2行続く（以前そうなっていた）。
  */
  it('名前を見出しに出し、IDはSNSの一覧にだけ出す', () => {
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByRole('heading', { name: 'テスト太郎' })).toBeTruthy()
    expect(screen.getAllByText('@taro@example.social')).toHaveLength(1)
  })

  it('登録した日を出す', () => {
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByText('2026/1/15に登録')).toBeTruthy()
  })

  it('規模を数字で出す', () => {
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('87')).toBeTruthy()
  })

  it('ログインに使っているアカウントを「メイン」として並べる', () => {
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByText('メイン')).toBeTruthy()
    const link = screen.getByRole('link', { name: /@taro@example\.social/ })
    expect(link.getAttribute('href')).toBe('https://example.social/@taro')
  })

  /*
    Discord はユーザー名から開けるプロフィールの URL が無い。
    押せるのにどこにも行かないものを作らない。
  */
  it('Discord のアカウントはリンクにしない', () => {
    state.data = {
      ...PROFILE,
      socialAccounts: [{ platform: 'discord', username: 'taro', server: 'discord.com' }],
    }
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.queryByRole('link', { name: /@taro$/ })).toBeNull()
    expect(screen.getByText('@taro')).toBeTruthy()
  })

  it('サーバーを持たないプラットフォームは @server を出さない', () => {
    state.data = {
      ...PROFILE,
      socialAccounts: [{ platform: 'twitter', username: 'bob', server: 'x.com' }],
    }
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByText('@bob')).toBeTruthy()
    expect(screen.queryByText('@bob@x.com')).toBeNull()
  })

  it('ホームページは中継ページを挟む', () => {
    state.data = { ...PROFILE, homepageUrls: ['https://example.test/a'] }
    render(<UserProfileScreen handle="taro@example.social" />)
    const link = screen.getByRole('link', { name: /example\.test/ })
    expect(link.getAttribute('href')).toBe(
      '/external-link?url=https%3A%2F%2Fexample.test%2Fa'
    )
  })

  describe('所属グループ', () => {
    const orgs = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `org_${i}`,
        slug: `group-${i}`,
        name: `会${i}`,
        role: i === 0 ? 'admin' : 'staff',
      }))

    it('グループのページへ張り、役割を出す', () => {
      state.data = {
        ...PROFILE,
        organizations: [{ id: 'org_1', slug: 'my-group', name: 'わたしの会', role: 'staff' }],
      }
      render(<UserProfileScreen handle="taro@example.social" />)
      const link = screen.getByRole('link', { name: /わたしの会/ })
      expect(link.getAttribute('href')).toBe('/orgs/my-group')
      expect(screen.getByText('スタッフ')).toBeTruthy()
    })

    it('3件までは畳まない', () => {
      state.data = { ...PROFILE, organizations: orgs(3) }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(screen.queryByRole('button', { name: /件のグループを表示/ })).toBeNull()
      expect(screen.getByRole('link', { name: /会2/ })).toBeTruthy()
    })

    /*
      掛け持ちしている人だと、ここが伸びてプロフィールの本文より先に
      場所を取る（参加者一覧と同じ「ほか●件を表示」の形）。
    */
    it('4件以上は3件だけ出して残りを畳む', () => {
      state.data = { ...PROFILE, organizations: orgs(5) }
      render(<UserProfileScreen handle="taro@example.social" />)

      expect(screen.getByRole('link', { name: /会2/ })).toBeTruthy()
      expect(screen.queryByRole('link', { name: /会3/ })).toBeNull()
      expect(screen.getByText('ほか2件を表示')).toBeTruthy()
    })

    it('押すと残りが出て、もう一度押すと畳む', () => {
      state.data = { ...PROFILE, organizations: orgs(5) }
      render(<UserProfileScreen handle="taro@example.social" />)

      fireEvent.click(screen.getByRole('button', { name: '残り2件のグループを表示' }))
      expect(screen.getByRole('link', { name: /会4/ })).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: '所属グループを閉じる' }))
      expect(screen.queryByRole('link', { name: /会4/ })).toBeNull()
    })
  })

  describe('メールアドレス', () => {
    it('未ログインには欄ごと出さない', () => {
      state.data = { ...PROFILE, hasEmail: true }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(emailButton()).toBeNull()
    })

    it('登録されていなければ、ログイン中でも出さない', () => {
      viewerId = 'user_2'
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(emailButton()).toBeNull()
    })

    it('ログイン中で登録があれば、押すボタンを出す', () => {
      viewerId = 'user_2'
      state.data = { ...PROFILE, hasEmail: true }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(emailButton()).toBeTruthy()
    })

    /** **押されるまで取りにいかない。** これが収集対策の実体 */
    it('開いただけでは取りにいかない', () => {
      viewerId = 'user_2'
      state.data = { ...PROFILE, hasEmail: true }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(emailEnabled.every((enabled) => enabled === false)).toBe(true)
    })

    it('押すと取りにいき、mailto で出す', () => {
      viewerId = 'user_2'
      state.data = { ...PROFILE, hasEmail: true }
      emailState.data = { email: 'taro@example.test' }
      render(<UserProfileScreen handle="taro@example.social" />)

      fireEvent.click(emailButton()!)

      expect(emailEnabled.at(-1)).toBe(true)
      const link = screen.getByRole('link', { name: /taro@example\.test/ })
      expect(link.getAttribute('href')).toBe('mailto:taro@example.test')
    })

    /*
      ホームページと同じ行に並べる。メールだけボタンにすると、
      同じ役のものが2つの姿で並ぶ。
    */
    it('ホームページと同じ並びに入る', () => {
      viewerId = 'user_2'
      state.data = { ...PROFILE, hasEmail: true, homepageUrls: ['https://example.test/a'] }
      render(<UserProfileScreen handle="taro@example.social" />)

      const row = contactRow()
      expect(row).toBeTruthy()
      expect(row!.querySelectorAll('li')).toHaveLength(2)
      expect(row!.textContent).toContain('https://example.test/a')
    })
  })

  describe('プロフィール設定への導線', () => {
    it('自分のページには出す', () => {
      viewerId = 'user_1'
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(
        screen.getByRole('link', { name: 'プロフィールを編集' }).getAttribute('href')
      ).toBe('/account')
    })

    it('他人のページには出さない', () => {
      viewerId = 'user_2'
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(screen.queryByRole('link', { name: 'プロフィールを編集' })).toBeNull()
    })
  })

  describe('連絡する', () => {
    const contactLink = () => screen.queryByRole('link', { name: '連絡する' })

    it('anypost.dev の投稿画面へ、その人あてのメンションを渡す', () => {
      viewerId = 'user_2'
      render(<UserProfileScreen handle="taro@example.social" />)

      const url = new URL(contactLink()!.getAttribute('href')!)
      expect(url.origin + url.pathname).toBe('https://anypost.dev/share')
      expect(url.searchParams.get('t')).toBe('@taro@example.social ')
    })

    it('未ログインでも出す。投稿元は anypost.dev に選ばせる', () => {
      render(<UserProfileScreen handle="taro@example.social" />)
      const url = new URL(contactLink()!.getAttribute('href')!)
      expect(url.searchParams.has('i')).toBe(false)
    })

    /** 自分宛のメンションを開いても誰にも届かない */
    it('自分のページには出さない', () => {
      viewerId = 'user_1'
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(contactLink()).toBeNull()
    })

    /** `@name@discord.com` は Fediverse でも X でも解決しない */
    it('Discord の人には出さない', () => {
      state.data = {
        ...PROFILE,
        user: { ...PROFILE.user, server: 'discord.com', platform: 'discord' },
      }
      render(<UserProfileScreen handle="taro@discord.com" />)
      expect(contactLink()).toBeNull()
    })
  })

  /*
    一覧へ送っても、この人のものだけを絞って出せない。押した先で
    探し直しになるので、案内そのものを置かない。
  */
  it('一覧への案内も、イベント作成のボタンも置かない', () => {
    viewerId = 'user_1'
    render(<UserProfileScreen handle="taro@example.social" />)

    expect(screen.queryByRole('link', { name: 'イベントを探す' })).toBeNull()
    expect(screen.queryByRole('link', { name: /イベントを作成/ })).toBeNull()
  })

  it('主催しているものが無ければ、その旨を出す', () => {
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByText('この人が主催しているイベントはまだありません。')).toBeTruthy()
  })

  describe('一覧', () => {
    it('主催しているものだと分かる見出しを付ける', () => {
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(screen.getByRole('heading', { name: '主催' })).toBeTruthy()
    })

    it('開いていないタブは取りにいかない', () => {
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(listEnabled.events.at(-1)).toBe(true)
      expect(listEnabled.preEvents.at(-1)).toBe(false)
    })

    it('タブを切り替えると、そちらを取りにいく', () => {
      render(<UserProfileScreen handle="taro@example.social" />)
      fireEvent.click(screen.getByRole('radio', { name: /日程調整/ }))

      expect(listEnabled.preEvents.at(-1)).toBe(true)
      expect(listEnabled.events.at(-1)).toBe(false)
    })

    /*
      **ページ送りで全部見られる。** 以前は先頭20件だけ出して
      イベント一覧へ送っていたが、送った先でこの人のものだけを
      絞れないので探し直しになっていた。
    */
    it('2ページ以上あればページ送りを出す', () => {
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(screen.getByRole('navigation', { name: 'ページ送り' })).toBeTruthy()
    })

    it('1ページに収まればページ送りを出さない', () => {
      listState.events = { data: listOf(['e1'], 1), isPending: false, error: undefined }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(screen.queryByRole('navigation', { name: 'ページ送り' })).toBeNull()
    })

    it('次のページを押すと、そのページを取りにいく', () => {
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<UserProfileScreen handle="taro@example.social" />)

      fireEvent.click(screen.getByRole('button', { name: '次のページ' }))
      expect(requestedPages.at(-1)).toBe(2)
    })

    /** 3ページ目のままタブを移ると、中身が無くて空に見える */
    it('タブを切り替えると先頭のページへ戻る', () => {
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<UserProfileScreen handle="taro@example.social" />)

      fireEvent.click(screen.getByRole('button', { name: '次のページ' }))
      expect(requestedPages.at(-1)).toBe(2)

      fireEvent.click(screen.getByRole('radio', { name: /日程調整/ }))
      expect(requestedPages.at(-1)).toBe(1)
    })
  })

  describe('グループ名義を除く', () => {
    const toggle = () => screen.queryByRole('switch', { name: 'グループ名義を除く' })

    it('所属グループが無ければ出さない', () => {
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(toggle()).toBeNull()
    })

    it('初めは所属グループのものも含めて取りにいく', () => {
      state.data = { ...PROFILE, organizations: [ORG] }
      render(<UserProfileScreen handle="taro@example.social" />)
      expect(toggle()?.getAttribute('aria-checked')).toBe('false')
      expect(requestedScopes.at(-1)).toBe('all')
      expect(screen.getByRole('radio', { name: 'イベント 12' })).toBeTruthy()
    })

    /** 見出しの数字も切り替えに従う。ずれると件数と中身が合わない */
    it('入れると個人のものだけを取りにいき、数字もそちらに合わせる', () => {
      state.data = { ...PROFILE, organizations: [ORG] }
      render(<UserProfileScreen handle="taro@example.social" />)
      fireEvent.click(toggle()!)

      expect(requestedScopes.at(-1)).toBe('personal')
      expect(screen.getByRole('radio', { name: 'イベント 5' })).toBeTruthy()
      expect(screen.getByRole('radio', { name: '日程調整 1' })).toBeTruthy()
    })

    it('切り替えると先頭のページへ戻る', () => {
      state.data = { ...PROFILE, organizations: [ORG] }
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<UserProfileScreen handle="taro@example.social" />)

      fireEvent.click(screen.getByRole('button', { name: '次のページ' }))
      expect(requestedPages.at(-1)).toBe(2)

      fireEvent.click(toggle()!)
      expect(requestedPages.at(-1)).toBe(1)
    })
  })

  it('読み込めなければ、その旨を出す', () => {
    state.data = undefined
    state.error = new Error('boom')
    render(<UserProfileScreen handle="taro@example.social" />)
    expect(screen.getByText('ユーザーを読み込めませんでした。')).toBeTruthy()
  })
})
