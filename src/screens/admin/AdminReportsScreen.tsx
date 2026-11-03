'use client'

import { Pagination } from '@/components/common/Pagination'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { useAdminReports } from '@/lib/api/queries/admin'
import { formatJstDateTime } from '@/lib/jst'

import { ADMIN_PER_PAGE, REPORTS_SPEC } from './admin-list-params'
import { AdminFrame, Row, RowList, StatusBadge, TitleLink, Toolbar } from './parts'
import { useListState } from './useListState'

export const KIND_LABEL = { event: 'イベント', 'pre-event': '日程調整' } as const

/**
 * 通報の一覧。**開いたときは未処理だけ**を出す（API の既定と同じ）。
 *
 * 行の題名は**通報の詳細へ**行く。対象のページではない — ここで
 * やりたいのは対応で、対象を読むのはその途中。
 *
 * **旧画面は対象が常に「対象なし」だった。** DTO が `target` に畳まれたのに
 * 画面が `report.event` / `report.preEvent` を読み続けていた。
 */
export default function AdminReportsScreen() {
  const [state, navigate] = useListState(REPORTS_SPEC)
  const { data, isPending, error } = useAdminReports({
    status: state.status,
    page: state.page,
    perPage: ADMIN_PER_PAGE,
  })

  // 「未処理」「解決済み」で絞っているときは、行に同じ札を並べない
  const showStatus = state.status === 'all'

  return (
    <AdminFrame title="通報" error={error}>
      <Toolbar total={data?.meta.total}>
        <SegmentedControl
          aria-label="対応の状態"
          value={state.status}
          onValueChange={(status) => navigate({ status })}
          options={[...(REPORTS_SPEC.status.options ?? [])]}
        />
      </Toolbar>

      <RowList isPending={isPending} error={error} empty={(data?.items.length ?? 0) === 0}>
        {data?.items.map((report) => (
          <Row
            key={report.id}
            title={
              <TitleLink href={`/admin/reports/${report.id}`}>
                {report.target?.title ?? '対象なし'}
              </TitleLink>
            }
            badges={
              <>
                {report.target ? <StatusBadge>{KIND_LABEL[report.target.kind]}</StatusBadge> : null}
                {showStatus && report.status === 'pending' ? (
                  <StatusBadge tone="emphasis">未処理</StatusBadge>
                ) : null}
                {showStatus && report.status === 'resolved' ? <StatusBadge>解決済み</StatusBadge> : null}
                {report.target?.isDisabled ? <StatusBadge>無効化済み</StatusBadge> : null}
              </>
            }
          >
            {/* 理由は2行で切る。全文は詳細で読む */}
            <p className="line-clamp-2 break-words whitespace-pre-wrap text-foreground">{report.reason}</p>
            <p>
              {report.reporter.displayName}（@{report.reporter.username}@{report.reporter.server}）・{' '}
              {formatJstDateTime(report.reportedAt)}
            </p>
          </Row>
        ))}
      </RowList>

      {data ? (
        <Pagination
          page={state.page}
          totalPages={data.meta.totalPages}
          onPageChange={(page) => navigate({ page })}
        />
      ) : null}
    </AdminFrame>
  )
}
