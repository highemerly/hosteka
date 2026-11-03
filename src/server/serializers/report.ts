import 'server-only'

import type { ReportDetailRow, ReportListRow } from '@/server/queries/admin-report'

import { serializeUser, type PublicUserDto } from './user'

export type ReportStatus = 'pending' | 'resolved'

export type ReportTargetDto = {
  kind: 'event' | 'pre-event'
  id: string
  title: string
  createdAt: string
  isPublic: boolean
  isDisabled: boolean
  creator: PublicUserDto
  organization: { slug: string; name: string } | null
}

/** 通報の一覧の1行 */
export type ReportDto = {
  id: string
  reason: string
  status: ReportStatus
  adminNote: string | null
  reportedAt: string
  resolvedAt: string | null
  reporter: PublicUserDto
  /** 対象。**null にはならない想定だが**、スキーマ上は両方 null の行を作れる */
  target: ReportTargetDto | null
}

/** 通報の詳細。対象の本文と、主催者が主催している件数を足す */
export type ReportDetailDto = Omit<ReportDto, 'target'> & {
  target:
    | (ReportTargetDto & {
        description: string | null
        /** 主催者を BAN すると、これらが無効化される（消えはしない） */
        creatorHosted: { events: number; preEvents: number }
      })
    | null
}

function status(value: string): ReportStatus {
  return value === 'resolved' ? 'resolved' : 'pending'
}

type TargetRow = NonNullable<ReportListRow['event']>

function serializeTarget(kind: ReportTargetDto['kind'], t: TargetRow): ReportTargetDto {
  return {
    kind,
    id: t.id,
    title: t.title,
    createdAt: t.createdAt.toISOString(),
    isPublic: t.isPublic,
    isDisabled: t.isDisabled,
    creator: serializeUser(t.creator),
    organization: t.organization,
  }
}

function base(report: ReportListRow | ReportDetailRow): Omit<ReportDto, 'target'> {
  return {
    id: report.id,
    reason: report.reason,
    status: status(report.status),
    adminNote: report.adminNote,
    reportedAt: report.reportedAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    reporter: serializeUser(report.reporter),
  }
}

/**
 * 通報のDTO。
 *
 * DB は event / preEvent の2列を持ち、片方が常に null という形。
 * 消費側で毎回どちらかを判定させると、追加時に漏れるので
 * kind 付きの単一の target に畳む。
 *
 * **旧管理画面はこの畳み方に追いついていなかった。** 画面が
 * `report.event` / `report.preEvent` を読み続けていたため、
 * 通報の一覧では対象が常に「対象なし」になり、詳細では対象の節が
 * 丸ごと出ていなかった（無効化も BAN もできない状態）。
 */
export function serializeReport(report: ReportListRow): ReportDto {
  return {
    ...base(report),
    target: report.event
      ? serializeTarget('event', report.event)
      : report.preEvent
        ? serializeTarget('pre-event', report.preEvent)
        : null,
  }
}

export function serializeReportDetail(report: ReportDetailRow): ReportDetailDto {
  const kind = report.event ? 'event' : report.preEvent ? 'pre-event' : null
  const t = report.event ?? report.preEvent

  return {
    ...base(report),
    target:
      kind && t
        ? {
            ...serializeTarget(kind, t),
            description: t.description,
            creatorHosted: {
              events: t.creator._count.events,
              preEvents: t.creator._count.preEvents,
            },
          }
        : null,
  }
}
