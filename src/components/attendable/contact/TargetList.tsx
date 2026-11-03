'use client'

import * as React from 'react'
import { ChevronDown } from 'lucide-react'

import { UserAvatar } from '@/components/event/EventInfoRow'
import { cn } from '@/lib/utils'

import type { ContactUser } from './mentions'

/** 畳んでいる間に名前を出す人数 */
const TARGET_PREVIEW = 8

/**
 * 届く相手の名前。多ければ先頭だけ出し、「他 ●人」から全員を開く。
 *
 * **畳んだままにしない。** 誰に届くのかを確かめられないまま送らせることになる。
 */
export function TargetList({ users }: { users: ContactUser[] }) {
  const [expanded, setExpanded] = React.useState(false)
  const rest = users.length - TARGET_PREVIEW
  const shown = expanded || rest <= 0 ? users : users.slice(0, TARGET_PREVIEW)

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {shown.map((user) => (
        <li
          key={user.id}
          className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1"
        >
          <UserAvatar name={user.displayName} src={user.avatar} size="xs" />
          <span className="text-sm text-foreground">{user.displayName}</span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="self-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {expanded ? '閉じる' : `他 ${rest}人`}
            <ChevronDown className={cn('size-3.5', expanded && 'rotate-180')} />
          </button>
        </li>
      ) : null}
    </ul>
  )
}
