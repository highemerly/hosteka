/**
 * status-transition.ts のユニットテスト
 *
 * 参加ステータス遷移と、グループ管理者の役割変更のルールテスト
 */
import { describe, it, expect } from 'vitest'
import {
  ADMIN_ACTION_TARGET,
  allowedAdminActions,
  allowedUserTargets,
  canUserChangeStatus,
  canChangeOrgAdminRole,
  canRemoveOrgAdmin,
  type ParticipantStatus,
} from '@/lib/status-transition'

describe('status-transition.ts', () => {
  // ===================================
  // canUserChangeStatus - ユーザー自身によるステータス変更
  // ===================================
  describe('canUserChangeStatus', () => {
    describe('同じステータスへの変更', () => {
      it('同じステータスへの変更は常に許可', () => {
        const statuses: ParticipantStatus[] = ['attending', 'maybe', 'not_attending', 'cancelled', 'participation_request']

        for (const status of statuses) {
          const result = canUserChangeStatus(status, status)
          expect(result.allowed).toBe(true)
        }
      })
    })

    describe('一度出した回答は、取り下げるならキャンセル', () => {
      it('参加からはキャンセルにしか変えられない', () => {
        expect(canUserChangeStatus('attending', 'cancelled').allowed).toBe(true)
        for (const to of ['maybe', 'not_attending', 'participation_request'] as const) {
          const result = canUserChangeStatus('attending', to)
          expect(result.allowed, `attending → ${to}`).toBe(false)
          expect(result.reason).toContain('キャンセル')
        }
      })

      it('未定からは参加かキャンセルだけ', () => {
        expect(canUserChangeStatus('maybe', 'attending').allowed).toBe(true)
        expect(canUserChangeStatus('maybe', 'cancelled').allowed).toBe(true)
        expect(canUserChangeStatus('maybe', 'not_attending').allowed).toBe(false)
        expect(canUserChangeStatus('maybe', 'participation_request').allowed).toBe(false)
      })

      it('参加リクエストからはキャンセルだけ。参加への昇格は主催者の承認', () => {
        expect(canUserChangeStatus('participation_request', 'cancelled').allowed).toBe(true)
        expect(canUserChangeStatus('participation_request', 'attending').allowed).toBe(false)
        expect(canUserChangeStatus('participation_request', 'maybe').allowed).toBe(false)
      })

      /*
        **欠席からキャンセルへは移せない。** 既に参加していないので
        取り下げるものが無く、回答ごと消せると主催者から見て
        「答えた人」が数えられなくなる。
      */
      it('欠席からは参加・未定へ戻すだけ。キャンセルはできない', () => {
        expect(canUserChangeStatus('not_attending', 'attending').allowed).toBe(true)
        expect(canUserChangeStatus('not_attending', 'maybe').allowed).toBe(true)
        expect(canUserChangeStatus('not_attending', 'cancelled').allowed).toBe(false)
      })

      it('キャンセルからは出し直せる。ただし欠席には戻せない', () => {
        expect(canUserChangeStatus('cancelled', 'attending').allowed).toBe(true)
        expect(canUserChangeStatus('cancelled', 'maybe').allowed).toBe(true)
        expect(canUserChangeStatus('cancelled', 'participation_request').allowed).toBe(true)
        expect(canUserChangeStatus('cancelled', 'not_attending').allowed).toBe(false)
      })

      it('理由には移せる先が書いてある。行き止まりに見せない', () => {
        expect(canUserChangeStatus('attending', 'maybe').reason).toBe(
          '参加から変更できるのは キャンセル だけです'
        )
        expect(canUserChangeStatus('maybe', 'not_attending').reason).toBe(
          '未定から変更できるのは 参加・キャンセル だけです'
        )
      })
    })

    describe('allowedUserTargets', () => {
      it('自分自身を含む。内容の手直しは常にできる', () => {
        expect(allowedUserTargets('attending')).toEqual(['attending', 'cancelled'])
        expect(allowedUserTargets('maybe')).toEqual(['maybe', 'attending', 'cancelled'])
      })

      it('canUserChangeStatus と食い違わない', () => {
        const ALL: ParticipantStatus[] = [
          'attending',
          'maybe',
          'not_attending',
          'cancelled',
          'participation_request',
        ]
        for (const from of ALL) {
          for (const to of ALL) {
            expect(canUserChangeStatus(from, to).allowed, `${from} → ${to}`).toBe(
              allowedUserTargets(from).includes(to)
            )
          }
        }
      })
    })
  })

  // ===================================
  // canChangeOrgAdminRole - 組織管理者ロール変更
  // ===================================
  describe('canChangeOrgAdminRole', () => {
    const creatorId = 'creator-123'
    const adminUserId = 'admin-456'
    const targetUserId = 'target-789'

    describe('admin役割のユーザーのみが変更可能', () => {
      it('adminは他のユーザーのロールを変更可能', () => {
        const result = canChangeOrgAdminRole(
          targetUserId,
          adminUserId,
          creatorId,
          true // isCurrentUserAdmin
        )
        expect(result.allowed).toBe(true)
      })

      it('admin以外はロール変更不可', () => {
        const result = canChangeOrgAdminRole(
          targetUserId,
          adminUserId,
          creatorId,
          false // isCurrentUserAdmin
        )

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('Only admin')
      })
    })

    describe('自分自身のロール変更制限', () => {
      it('自分自身のロールは変更不可', () => {
        const result = canChangeOrgAdminRole(
          adminUserId, // targetUserId = currentUserId
          adminUserId,
          creatorId,
          true
        )

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('your own role')
      })
    })

    describe('組織作成者のロール変更制限', () => {
      it('組織作成者のロールは変更不可', () => {
        const result = canChangeOrgAdminRole(
          creatorId, // targetUserId = creatorId
          adminUserId,
          creatorId,
          true
        )

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('creator role')
      })
    })
  })

  // ===================================
  // canRemoveOrgAdmin - 組織管理者削除
  // ===================================
  describe('canRemoveOrgAdmin', () => {
    const creatorId = 'creator-123'
    const adminUserId = 'admin-456'
    const targetUserId = 'target-789'

    describe('admin役割のユーザーのみが削除可能', () => {
      it('adminは他のユーザーを削除可能', () => {
        const result = canRemoveOrgAdmin(
          targetUserId,
          adminUserId,
          creatorId,
          true // isCurrentUserAdmin
        )
        expect(result.allowed).toBe(true)
      })

      it('admin以外は削除不可', () => {
        const result = canRemoveOrgAdmin(
          targetUserId,
          adminUserId,
          creatorId,
          false // isCurrentUserAdmin
        )

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('Only admin')
      })
    })

    describe('自分自身の削除制限', () => {
      it('自分自身は削除不可', () => {
        const result = canRemoveOrgAdmin(
          adminUserId, // targetUserId = currentUserId
          adminUserId,
          creatorId,
          true
        )

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('Cannot remove yourself')
      })
    })

    describe('組織作成者の削除制限', () => {
      it('組織作成者は削除不可', () => {
        const result = canRemoveOrgAdmin(
          creatorId, // targetUserId = creatorId
          adminUserId,
          creatorId,
          true
        )

        expect(result.allowed).toBe(false)
        expect(result.reason).toContain('Cannot remove creator')
      })
    })
  })
})

/*
  参加者の編集画面のボタンとサーバーの判定は、どちらもここから作る。
*/
describe('allowedAdminActions', () => {
  const CREATOR = { isCreator: true }
  const ORGANIZER = { isCreator: false }
  const person = (status: ParticipantStatus, isOrganizer = false) => ({
    status,
    isOrganizer,
    isCreator: false,
  })

  it('参加リクエストは承認か拒否だけ', () => {
    expect(allowedAdminActions(person('participation_request'), CREATOR)).toEqual([
      'approve',
      'reject',
    ])
  })

  it.each(['attending', 'maybe'] as const)(
    '%s はキャンセルにするか、幹事にする',
    (status) => {
      expect(allowedAdminActions(person(status), CREATOR)).toEqual(['cancel', 'assign_organizer'])
    }
  )

  it('幹事は解除だけ。キャンセルにするなら、先に解除する', () => {
    expect(allowedAdminActions(person('attending', true), CREATOR)).toEqual(['unassign_organizer'])
  })

  it('幹事の指定は作成者だけ。幹事が見ているときはキャンセルだけ', () => {
    expect(allowedAdminActions(person('attending'), ORGANIZER)).toEqual(['cancel'])
  })

  /*
    キャンセルにすると幹事も外れる。作成者でない幹事がほかの幹事をキャンセルにできると、
    作成者にしかできない「幹事を外す」ができてしまう。
  */
  it.each(['attending', 'maybe'] as const)('作成者でない幹事は、ほかの幹事（%s）に何もできない', (status) => {
    expect(allowedAdminActions(person(status, true), ORGANIZER)).toEqual([])
  })

  it.each([CREATOR, ORGANIZER])('作成者の行には、誰が見ていても何も出さない', (viewer) => {
    expect(
      allowedAdminActions({ status: 'attending', isOrganizer: false, isCreator: true }, viewer)
    ).toEqual([])
  })

  it.each(['not_attending', 'cancelled'] as const)('%s は削除だけ', (status) => {
    expect(allowedAdminActions(person(status), CREATOR)).toEqual(['delete'])
  })

  /*
    **参加へ引き上げられるのは承認だけ。** 欠席・キャンセルから引き上げると
    規約に同意していない参加者ができる。
  */
  it('参加へ移す操作は、参加リクエストにしか出さない', () => {
    const ALL: ParticipantStatus[] = [
      'attending',
      'maybe',
      'not_attending',
      'cancelled',
      'participation_request',
    ]
    for (const status of ALL) {
      const toAttending = allowedAdminActions(person(status), CREATOR).filter(
        (a) => ADMIN_ACTION_TARGET[a] === 'attending'
      )
      expect(toAttending.length > 0, status).toBe(status === 'participation_request')
    }
  })
})
