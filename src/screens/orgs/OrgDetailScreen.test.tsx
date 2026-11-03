import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OrgDetailScreen from './OrgDetailScreen'

/**
 * グループのページ。
 *
 * **編集できるのは作成者と管理責任者（admin）だけ。** スタッフ（staff）は
 * グループのイベントは触れるが、グループそのものは編集できない
 * （`requireOrgAdminRole`）。画面がここを間違えると「押せるのに 403」に
 * なる — 画面とサーバーで規則を書き分けたときの典型。
 */
const state: { data?: unknown; isPending: boolean; error?: unknown } = {
  data: undefined,
  isPending: false,
}

let viewerId: string | null = null

const listState: {
  events: { data?: unknown; isPending: boolean; error?: unknown }
  preEvents: { data?: unknown; isPending: boolean; error?: unknown }
} = { events: { isPending: false }, preEvents: { isPending: false } }
const listEnabled: { events: boolean[]; preEvents: boolean[] } = { events: [], preEvents: [] }
const requestedPages: number[] = []

vi.mock('@/lib/api/queries/orgs', () => ({
  useOrg: () => state,
  useOrgEvents: (_slug: string, page: number, options: { enabled: boolean }) => {
    listEnabled.events.push(options.enabled)
    if (options.enabled) requestedPages.push(page)
    return listState.events
  },
  useOrgPreEvents: (_slug: string, page: number, options: { enabled: boolean }) => {
    listEnabled.preEvents.push(options.enabled)
    if (options.enabled) requestedPages.push(page)
    return listState.preEvents
  },
}))
vi.mock('@/hooks/useViewer', () => ({
  useViewer: () => ({
    viewer: viewerId
      ? { id: viewerId, name: 'テスト', server: 'handon.club', platform: 'mastodon' }
      : null,
    status: viewerId ? 'authed' : 'anonymous',
  }),
}))

function user(id: string, role = 'staff') {
  return {
    id: `oa_${id}`,
    role,
    user: {
      id,
      username: id,
      displayName: id,
      avatar: null,
      server: 'handon.club',
      platform: 'mastodon',
    },
  }
}

const ORG = {
  id: 'org_1',
  slug: 'my-group',
  name: 'テストグループ',
  description: null,
  relatedUrl: null,
  creatorId: 'u_owner',
  createdAt: '2026-01-15T00:00:00.000Z',
  admins: [user('u_owner', 'admin'), user('u_staff', 'staff')],
  creator: null,
  eventCount: 12,
  preEventCount: 3,
  participantCount: 87,
}

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
      creator: user('u_owner', 'admin').user,
      organization: null,
    })),
    meta: { total: ids.length, page: 1, perPage: 12, totalPages },
  }
}

beforeEach(() => {
  state.data = ORG
  state.isPending = false
  state.error = undefined
  viewerId = null
  listState.events = { data: emptyList, isPending: false, error: undefined }
  listState.preEvents = { data: emptyList, isPending: false, error: undefined }
  listEnabled.events.length = 0
  listEnabled.preEvents.length = 0
  requestedPages.length = 0
})

const editButton = () => screen.queryByRole('link', { name: /グループを編集/ })

describe('グループのページ', () => {
  it('規模を数字で出す', () => {
    render(<OrgDetailScreen slug="my-group" />)

    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('87')).toBeTruthy()
  })

  it('未ログインには編集の導線を出さない', () => {
    render(<OrgDetailScreen slug="my-group" />)
    expect(editButton()).toBeNull()
  })

  it('作成者には編集の導線を出す', () => {
    viewerId = 'u_owner'
    render(<OrgDetailScreen slug="my-group" />)
    expect(editButton()).toBeTruthy()
  })

  /** **これが本題。** staff に出すと「押せるのに 403」になる */
  it('スタッフには編集の導線を出さない', () => {
    viewerId = 'u_staff'
    render(<OrgDetailScreen slug="my-group" />)
    expect(editButton()).toBeNull()
  })

  it('管理責任者には編集の導線を出す', () => {
    state.data = { ...ORG, admins: [user('u_owner', 'admin'), user('u_admin', 'admin')] }
    viewerId = 'u_admin'
    render(<OrgDetailScreen slug="my-group" />)
    expect(editButton()).toBeTruthy()
  })

  /**
   * 管理責任者とスタッフではできることが違う。名前だけ並べると
   * 誰に頼めばいいのかが分からない。作成者は「外せない」点が違うので別に出す。
   */
  it('管理者の役割を出す', () => {
    render(<OrgDetailScreen slug="my-group" />)

    expect(screen.getByText('作成者')).toBeTruthy()
    expect(screen.getByText('スタッフ')).toBeTruthy()
  })

  it('作成者でない管理責任者は「管理責任者」と出す', () => {
    state.data = { ...ORG, admins: [user('u_owner', 'admin'), user('u_admin', 'admin')] }
    render(<OrgDetailScreen slug="my-group" />)

    expect(screen.getByText('作成者')).toBeTruthy()
    expect(screen.getByText('管理責任者')).toBeTruthy()
  })

  /*
    以前は `https://<server>/@<username>` を直に組んでいて、X と Discord の
    管理者では開けない URL を作っていた（`https://x.com/@alice` は
    Fediverse の書き方、`https://discord.com/@bob` はページが無い）。
  */
  it('管理者は Hosteka の中のその人のページへ張る', () => {
    render(<OrgDetailScreen slug="my-group" />)

    const link = screen.getByRole('link', { name: /u_staff/ })
    expect(link.getAttribute('href')).toBe('/users/u_staff@handon.club')
  })

  it('X や Discord の管理者でも、飛び先は Hosteka の中', () => {
    state.data = {
      ...ORG,
      admins: [
        {
          id: 'oa_x',
          role: 'staff',
          user: {
            id: 'u_x',
            username: 'xuser',
            displayName: 'Xの人',
            avatar: null,
            server: 'x.com',
            platform: 'twitter',
          },
        },
      ],
    }
    render(<OrgDetailScreen slug="my-group" />)

    const link = screen.getByRole('link', { name: /xuser/ })
    expect(link.getAttribute('href')).toBe('/users/xuser@x.com')
  })

  it('イベントも日程調整も無ければ、その旨を出す', () => {
    render(<OrgDetailScreen slug="my-group" />)
    expect(screen.getByText('このグループのイベントはまだありません。')).toBeTruthy()
  })

  describe('一覧', () => {
    it('開いていないタブは取りにいかない', () => {
      render(<OrgDetailScreen slug="my-group" />)
      expect(listEnabled.events.at(-1)).toBe(true)
      expect(listEnabled.preEvents.at(-1)).toBe(false)
    })

    /*
      **ページ送りで全部見られる。** 以前は先頭20件だけ出して
      イベント一覧へ送っていたが、送った先でこのグループのものだけを
      絞れないので探し直しになっていた。
    */
    it('2ページ以上あればページ送りを出す', () => {
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<OrgDetailScreen slug="my-group" />)
      expect(screen.getByRole('navigation', { name: 'ページ送り' })).toBeTruthy()
    })

    it('次のページを押すと、そのページを取りにいく', () => {
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<OrgDetailScreen slug="my-group" />)

      fireEvent.click(screen.getByRole('button', { name: '次のページ' }))
      expect(requestedPages.at(-1)).toBe(2)
    })

    it('一覧へ送る案内は置かない', () => {
      listState.events = { data: listOf(['e1', 'e2'], 3), isPending: false, error: undefined }
      render(<OrgDetailScreen slug="my-group" />)
      expect(screen.queryByRole('link', { name: 'イベントを探す' })).toBeNull()
    })
  })
})
