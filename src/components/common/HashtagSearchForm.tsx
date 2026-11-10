'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Hash, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { hashtagPath } from '@/lib/hashtags'
import type { HashtagScope } from '@/schemas/hashtag'

/**
 * 一覧の上の「ハッシュタグで探す」。タグのページ（`/hashtags/[tag]`）へ送る。
 *
 * `scope` は開く切り替え。日程調整の一覧から探した人は日程調整を
 * 探しているので、そのタブで開く。
 */
export function HashtagSearchForm({ scope }: { scope?: HashtagScope }) {
  const router = useRouter()
  const [hashtag, setHashtag] = React.useState('')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const tag = hashtag.trim().replace(/^#/, '')
    if (tag) router.push(hashtagPath(tag, scope))
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2 sm:max-w-md">
      <div className="relative min-w-0 flex-1">
        <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={hashtag}
          onChange={(e) => setHashtag(e.target.value)}
          placeholder="ハッシュタグで探す"
          aria-label="ハッシュタグで探す"
          className="h-12 pl-9 text-base"
        />
      </div>
      <Button type="submit" variant="default" size="icon" aria-label="検索">
        <Search className="size-4" />
      </Button>
    </form>
  )
}
