'use client'

import * as React from 'react'
import { Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleField } from '@/components/ui/toggle-switch'
import { COUNT_LIMITS } from '@/schemas/limits'

import { normalizeHost } from './normalize-host'

/**
 * 参加できるサーバーの限定。
 *
 * **Fediverse にしか掛からない。** Discord / X の利用者はこの一覧の
 * 対象外なので、両方を許可しているときはその旨を出す。
 * 詳細画面のバッジと同じ理屈（components/event/allowed-platforms.ts）。
 */
export function ServerRestrictionField({
  servers,
  onChange,
  affectsFediverseOnly,
}: {
  servers: string[]
  onChange: (next: string[]) => void
  /**
   * Fediverse だけを許可しているか。
   * Discord / X も許可しているときは、限定が一部にしか掛からないと伝える。
   */
  affectsFediverseOnly?: boolean
}) {
  const [enabled, setEnabled] = React.useState(servers.length > 0)
  const [draft, setDraft] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const add = () => {
    const host = normalizeHost(draft)
    if (!host) {
      setError('サーバー名の形式が正しくありません。例: example.social')
      return
    }
    if (servers.includes(host)) {
      setDraft('')
      return
    }
    if (servers.length >= COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS) {
      setError(`サーバーは${COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS}個まで指定できます`)
      return
    }
    onChange([...servers, host])
    setDraft('')
    setError(null)
  }

  const toggle = (next: boolean) => {
    setEnabled(next)
    // 切ったら一覧も空にする。残しておくと、切ったつもりで効いたままになる
    if (!next) onChange([])
  }

  return (
    <div className="space-y-3">
      <ToggleField
        label="サーバーを限定する"
        description="指定したサーバーのユーザーだけが参加登録できます"
        checked={enabled}
        onCheckedChange={toggle}
      />

      {enabled ? (
        <div className="space-y-2 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
                placeholder="example.social"
                aria-label="許可するサーバー名"
                aria-invalid={Boolean(error) || undefined}
              />
            </div>
            <Button type="button" variant="default" size="sm" onClick={add}>
              <Plus className="size-4" />
              追加
            </Button>
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          {servers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              1つも追加されない場合、サーバー限定は無効となります。
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {servers.map((host) => (
                <li key={host}>
                  <button
                    type="button"
                    onClick={() => onChange(servers.filter((s) => s !== host))}
                    aria-label={`${host} を外す`}
                    className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {host}
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {affectsFediverseOnly === false ? (
            <p className="border-t border-border pt-2 text-xs text-muted-foreground">
              サーバー限定は Fediverse だけが対象です。Discord・X の利用者はこの設定の影響を受けません。
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
