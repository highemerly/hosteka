import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ContactUser } from './mentions'
import { TargetList } from './TargetList'

const users = Array.from(
  { length: 10 },
  (_, i) =>
    ({
      id: `u${i}`,
      displayName: `相手${i}`,
      avatar: null,
    }) as ContactUser
)

describe('届く相手の一覧', () => {
  it('多ければ「他 ●人」で畳み、押すと全員を出す', () => {
    render(<TargetList users={users} />)
    expect(screen.queryByText('相手9')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '他 2人' }))
    expect(screen.getByText('相手9')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByText('相手9')).toBeNull()
  })

  it('畳むほどいなければ操作を出さない', () => {
    render(<TargetList users={users.slice(0, 8)} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
