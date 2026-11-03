/**
 * グループ（主催の名義）を変えられない人に見せる、読むだけの欄。
 *
 * 変えられるのは作成者だけ（`canChangeOrganization`）。幹事やスタッフに
 * 触れるトグルを出すと、送ったときに断られる。
 */
export function LockedOrganizationField({
  organization,
}: {
  organization: { name: string } | null
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-[var(--surface-subtle)] p-3">
        <span className="shrink-0 px-1 text-sm font-medium text-foreground">主催の名義</span>
        <span className="min-w-0 truncate text-sm text-foreground">
          {organization ? organization.name : '作成者'}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">変えられるのは作成者だけです</p>
    </div>
  )
}
