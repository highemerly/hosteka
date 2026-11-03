'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { Field } from '@/components/form/Field'
import { UnsavedChangesGuard } from '@/components/form/UnsavedChangesGuard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api/client'
import { useAdminReport, useUpdateReport } from '@/lib/api/queries/admin'
import { formatJstDateTime } from '@/lib/jst'
import { ADMIN_NOTE_MAX } from '@/schemas/report'
import type { ReportDetailDto } from '@/server/serializers/report'

import { KIND_LABEL } from './AdminReportsScreen'
import { BanUserDialog } from './BanUserDialog'
import { AdminFrame, LoadError, StatusBadge, TitleLink, UserLine } from './parts'
import { useToggleDisabled } from './useToggleDisabled'

const PATH_OF = { event: '/events', 'pre-event': '/pre-events' } as const

/** 項目名と値の1行。情報の並びは `.rule-y` で囲う（詳細ページと同じ） */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {children}
    </section>
  )
}

/**
 * 対応。メモと状態の切り替え。
 *
 * **ページの最後に置く。** 理由と対象を読んでから決めるもので、
 * 開いてすぐ押すものではない。
 *
 * メモは状態を切り替えるときに一緒に保存する。メモだけ直したいときの
 * ために「メモを保存」も出すが、**書き換えたときだけ**（押しても何も
 * 変わらないボタンを置かない）。
 */
function Handling({ report }: { report: ReportDetailDto }) {
  const confirm = useConfirm()
  const update = useUpdateReport(report.id)
  const saved = report.adminNote ?? ''
  const [note, setNote] = React.useState(saved)

  /*
    保存し直した値が返ってきたら、それを新しい基準にする。
    **描画中に合わせる** — effect で `setNote` すると、保存直後に
    古いメモを一度描いてから差し替わる（`react-hooks/set-state-in-effect`）。
  */
  const [lastSaved, setLastSaved] = React.useState(saved)
  if (saved !== lastSaved) {
    setLastSaved(saved)
    setNote(saved)
  }

  const dirty = note.trim() !== saved.trim()
  const tooLong = note.length > ADMIN_NOTE_MAX

  const send = (status?: 'pending' | 'resolved') => {
    update.mutate(
      { ...(status ? { status } : {}), adminNote: note },
      {
        onSuccess: () =>
          toast.success(
            status === 'resolved'
              ? '解決済みにしました'
              : status === 'pending'
                ? '未処理に戻しました'
                : 'メモを保存しました'
          ),
        onError: (e) => toast.error(e instanceof ApiClientError ? e.message : '保存できませんでした'),
      }
    )
  }

  const reopen = async () => {
    const ok = await confirm({
      title: 'この通報を未処理に戻しますか？',
      confirmLabel: '未処理に戻す',
    })
    if (ok) send('pending')
  }

  return (
    <Section title="対応">
      <UnsavedChangesGuard when={dirty && !update.isPending} />
      <div className="mt-3 space-y-4">
        {report.status === 'resolved' && report.resolvedAt ? (
          <p className="text-sm text-muted-foreground">
            {formatJstDateTime(report.resolvedAt)} に解決済みにしました
          </p>
        ) : null}

        <Field
          label="対応メモ"
          htmlFor="admin-note"
          error={tooLong ? `${ADMIN_NOTE_MAX}文字以内で入力してください` : undefined}
          hint={`${note.length}/${ADMIN_NOTE_MAX}`}
        >
          <Textarea
            id="admin-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            aria-invalid={tooLong || undefined}
          />
        </Field>

        <div className="flex flex-wrap gap-3">
          {report.status === 'pending' ? (
            <Button variant="primary" disabled={update.isPending || tooLong} onClick={() => send('resolved')}>
              解決済みにする
            </Button>
          ) : (
            <Button variant="default" disabled={update.isPending || tooLong} onClick={() => void reopen()}>
              未処理に戻す
            </Button>
          )}
          {dirty ? (
            <Button variant="default" disabled={update.isPending || tooLong} onClick={() => send()}>
              メモを保存
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  )
}

/**
 * 通報の詳細。上から「何が言われたか」→「何についてか」→「どうしたか」。
 *
 * **旧画面は対象の節が丸ごと出ていなかった。** DTO が `target` に
 * 畳まれたのに `report.event` / `report.preEvent` を読んでいたため、
 * この画面から無効化も BAN もできなかった。
 * また BAN は `prompt()` で理由を聞くだけで、確認なしに実行されていた。
 */
export default function AdminReportDetailScreen({ id }: { id: string }) {
  const { data: report, isPending, error, refetch } = useAdminReport(id)
  const { toggle, pendingId } = useToggleDisabled()
  const [banOpen, setBanOpen] = React.useState(false)

  const notFound = error instanceof ApiClientError && error.code === 'NOT_FOUND'
  const target = report?.target ?? null

  return (
    <AdminFrame
      back={{ href: '/admin/reports', label: '通報' }}
      title="通報の詳細"
      actions={
        report ? (
          report.status === 'pending' ? (
            <StatusBadge tone="emphasis">未処理</StatusBadge>
          ) : (
            <StatusBadge>解決済み</StatusBadge>
          )
        ) : null
      }
      error={error}
    >
      {notFound ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-8 text-center text-sm text-foreground">
          この通報は見つかりません。対象と一緒に削除された可能性があります。
        </p>
      ) : error ? (
        <div className="mt-6">
          <LoadError />
        </div>
      ) : isPending || !report ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <>
          <Section title="通報の内容">
            <dl className="rule-y mt-3">
              <Item label="理由">
                <p className="break-words whitespace-pre-wrap">{report.reason}</p>
              </Item>
              <Item label="通報した人">
                <UserLine user={report.reporter} />
              </Item>
              <Item label="日時">{formatJstDateTime(report.reportedAt)}</Item>
            </dl>
          </Section>

          {target ? (
            <Section title={`対象の${KIND_LABEL[target.kind]}`}>
              <dl className="rule-y mt-3">
                <Item label="題名">
                  <span className="flex flex-wrap items-center gap-2">
                    <TitleLink href={`${PATH_OF[target.kind]}/${target.id}`}>
                      <span className="font-medium">{target.title}</span>
                    </TitleLink>
                    {target.isDisabled ? <StatusBadge tone="emphasis">無効化</StatusBadge> : null}
                    {!target.isPublic ? <StatusBadge>非公開</StatusBadge> : null}
                  </span>
                </Item>
                <Item label="主催">
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <UserLine user={target.creator} />
                    {target.organization ? (
                      <TitleLink href={`/orgs/${target.organization.slug}`}>
                        {target.organization.name}
                      </TitleLink>
                    ) : null}
                  </span>
                </Item>
                <Item label="作成">{formatJstDateTime(target.createdAt)}</Item>
                {target.description ? (
                  <Item label="説明">
                    {/*
                      **書かれたままの文字で見せる。** Markdown として描くと、
                      リンクの行き先や隠した文字（:::details）が見えなくなる。
                      判断に要るのは見た目ではなく、何が書いてあるか。
                    */}
                    <p className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 break-words whitespace-pre-wrap">
                      {target.description}
                    </p>
                  </Item>
                ) : null}
              </dl>

              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  variant={target.isDisabled ? 'default' : 'destructive'}
                  disabled={pendingId === target.id}
                  onClick={() => void toggle(target)}
                >
                  {target.isDisabled ? '有効化する' : '無効化する'}
                </Button>
                <Button variant="destructive" onClick={() => setBanOpen(true)}>
                  主催者をBANする
                </Button>
              </div>

              <BanUserDialog
                open={banOpen}
                onOpenChange={setBanOpen}
                /*
                  **BAN しても、この通報はここに残る。** BAN は停止であって
                  削除ではなくなったため。以前は主催者ごと対象が消えて
                  この通報も消えたので、一覧へ飛ばしていた。いまは取り直して
                  （対象に「無効化」の札が付く）、そのまま解決済みにできる。
                */
                onBanned={() => void refetch()}
                target={{
                  id: target.creator.id,
                  displayName: target.creator.displayName,
                  username: target.creator.username,
                  server: target.creator.server,
                  hosted: target.creatorHosted,
                }}
              />
            </Section>
          ) : null}

          <Handling report={report} />
        </>
      )}
    </AdminFrame>
  )
}
