'use client'

import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HOMEPAGE_URL_MAX } from '@/schemas/user'
import type { RowErrors } from '@/screens/account/profile-field-errors'

/** ホームページのURLの編集。`SocialAccountsEditor` と同じ組み方 */
export function HomepageUrlsEditor({
  value,
  onChange,
  errors,
}: {
  value: string[]
  onChange: (next: string[]) => void
  errors?: RowErrors
}) {
  return (
    <div className="space-y-3">
      {value.map((url, i) => {
        const rowError = errors?.rows[i]

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-start gap-2">
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) =>
                  onChange(value.map((row, index) => (index === i ? e.target.value : row)))
                }
                placeholder="https://example.com"
                aria-label={`${i + 1}件目のホームページ`}
                aria-invalid={Boolean(rowError) || undefined}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`${i + 1}件目を削除`}
                className="mt-3 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(value.filter((_, index) => index !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {rowError ? <p className="text-xs text-destructive">{rowError}</p> : null}
          </div>
        )
      })}

      {/* 上限に達したら出さない（「2件までです」と断らない） */}
      {value.length < HOMEPAGE_URL_MAX ? (
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => onChange([...value, ''])}
        >
          <Plus className="size-4" />
          ホームページを追加
        </Button>
      ) : null}
    </div>
  )
}
