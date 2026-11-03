'use client'

import * as React from 'react'
import Link from 'next/link'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Pagination } from '@/components/common/Pagination'
import { AnnouncementTypeIcon } from '@/components/content/AnnouncementTypeIcon'
import { Field, fieldAria } from '@/components/form/Field'
import { MarkdownEditor } from '@/components/form/MarkdownEditor'
import { MarkdownHint } from '@/components/form/MarkdownHint'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { ApiClientError } from '@/lib/api/client'
import {
  useAdminAnnouncements,
  useDeleteAnnouncement,
  useSaveAnnouncement,
} from '@/lib/api/queries/announcements'
import { isPinnedNow, isPublished } from '@/lib/announcements'
import { formatJstDateTime } from '@/lib/jst'
import {
  ANNOUNCEMENT_TITLE_MAX,
  ANNOUNCEMENT_TYPE_LABELS,
  ANNOUNCEMENT_TYPES,
  announcementBody,
  type AnnouncementType,
} from '@/schemas/announcement'
import type { AnnouncementDto } from '@/server/serializers/announcement'

import {
  emptyAnnouncementForm,
  toAnnouncementFormValues,
  type AnnouncementFormValues,
} from './announcement-form-values'
import { AdminFrame, Row, RowList, StatusBadge } from './parts'

const PER_PAGE = 20

/**
 * お知らせの管理。
 *
 * **一覧と編集を同じ画面に置く。** 年に数件しか増えないものに、
 * 一覧・新規・編集の3ページを作ると、どれも中身が1つしかない画面になる。
 */
export default function AdminAnnouncementsScreen() {
  const [page, setPage] = React.useState(1)
  const { data, isPending, error } = useAdminAnnouncements({ page, perPage: PER_PAGE })
  const [editing, setEditing] = React.useState<{ id: number | null } | null>(null)
  const [form, setForm] = React.useState<AnnouncementFormValues>(emptyAnnouncementForm)

  const save = useSaveAnnouncement()
  const remove = useDeleteAnnouncement()
  const confirm = useConfirm()

  // 掲載中かどうかの判定に使う時刻。開いたときの1回で足りる（秒単位では動かない）
  const [now] = React.useState(() => Date.now())

  const openNew = () => {
    setForm(emptyAnnouncementForm())
    setEditing({ id: null })
  }

  const openEdit = (announcement: AnnouncementDto) => {
    setForm(toAnnouncementFormValues(announcement))
    setEditing({ id: announcement.id })
  }

  const onDelete = async (announcement: AnnouncementDto) => {
    const ok = await confirm({
      title: 'このお知らせを削除しますか',
      description: announcement.title,
      destructive: true,
    })
    if (!ok) return

    try {
      await remove.mutateAsync(announcement.id)
      toast.success('削除しました')
      if (editing?.id === announcement.id) setEditing(null)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : '削除できませんでした')
    }
  }

  return (
    <AdminFrame
      title="お知らせ"
      error={error}
      actions={
        editing ? null : (
          <Button variant="primary" onClick={openNew}>
            <Plus className="size-4" />
            新規作成
          </Button>
        )
      }
    >
      {editing ? (
        <AnnouncementForm
          key={editing.id ?? 'new'}
          values={form}
          onChange={setForm}
          isNew={editing.id === null}
          pending={save.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            const parsed = announcementBody.safeParse(values)
            if (!parsed.success) {
              toast.error(parsed.error.issues[0]?.message ?? '入力を確かめてください')
              return
            }
            try {
              await save.mutateAsync({ id: editing.id, body: parsed.data })
              toast.success(editing.id ? '保存しました' : '作成しました')
              setEditing(null)
            } catch (e) {
              toast.error(e instanceof ApiClientError ? e.message : '保存できませんでした')
            }
          }}
        />
      ) : null}

      <RowList isPending={isPending} error={error} empty={data?.items.length === 0}>
        {data?.items.map((announcement) => (
          <Row
            key={announcement.id}
            title={
              <span className="inline-flex items-center gap-2">
                <AnnouncementTypeIcon type={announcement.type} />
                {announcement.body ? (
                  <Link
                    href={`/announcements/${announcement.id}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {announcement.title}
                  </Link>
                ) : (
                  announcement.title
                )}
              </span>
            }
            badges={<StatusBadges announcement={announcement} now={now} />}
            action={
              <>
                <Button variant="default" size="sm" onClick={() => openEdit(announcement)}>
                  <Pencil className="size-4" />
                  編集
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void onDelete(announcement)}
                >
                  <Trash2 className="size-4" />
                  削除
                </Button>
              </>
            }
          >
            <p>
              公開 {formatJstDateTime(announcement.publishedAt)}
              {announcement.pinnedUntil
                ? ` ・ バナー終了 ${formatJstDateTime(announcement.pinnedUntil)}`
                : ''}
            </p>
          </Row>
        ))}
      </RowList>

      <Pagination
        page={page}
        totalPages={data?.meta.totalPages ?? 1}
        onPageChange={setPage}
      />
    </AdminFrame>
  )
}

/**
 * 掲載の状況。**普段の状態には札を付けない**（DESIGN_GUIDELINES「状態の札」）。
 * 公開済みで掲載も終わったもの、が普通の姿。
 */
function StatusBadges({ announcement, now }: { announcement: AnnouncementDto; now: number }) {
  if (!isPublished(announcement, now)) {
    return <StatusBadge tone="emphasis">予約</StatusBadge>
  }
  if (isPinnedNow(announcement, now)) {
    return <StatusBadge tone="emphasis">バナー掲載中</StatusBadge>
  }
  return null
}

const TYPE_OPTIONS = ANNOUNCEMENT_TYPES.map((type) => ({
  value: type,
  label: ANNOUNCEMENT_TYPE_LABELS[type],
}))

function AnnouncementForm({
  values,
  onChange,
  isNew,
  pending,
  onCancel,
  onSubmit,
}: {
  values: AnnouncementFormValues
  onChange: (values: AnnouncementFormValues) => void
  isNew: boolean
  pending: boolean
  onCancel: () => void
  onSubmit: (values: AnnouncementFormValues) => void
}) {
  const set = <K extends keyof AnnouncementFormValues>(
    key: K,
    value: AnnouncementFormValues[K]
  ) => onChange({ ...values, [key]: value })

  return (
    <form
      className="mt-6 space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(values)
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">
        {isNew ? 'お知らせを作る' : 'お知らせを直す'}
      </h2>

      <Field
        label="重要度"
        htmlFor="announcement-type"
        required
        description="「軽微」はヘッダー下のバナーに出さず、一覧にだけ載せます。"
      >
        <SegmentedControl<AnnouncementType>
          aria-label="重要度"
          value={values.type}
          /*
            「軽微」に変えても入力中の値は消さない。**戻せるようにしておく** —
            掲載を終える日時を実際に落とすのは保存のとき
            （`announcementColumnsFromBody`）で、ここで消すと戻したときに
            打ち直しになる。
          */
          onValueChange={(next) => set('type', next)}
          options={TYPE_OPTIONS}
        />
      </Field>

      <Field
        label="題名"
        htmlFor="announcement-title"
        required
        hint={`${values.title.length} / ${ANNOUNCEMENT_TITLE_MAX}`}
      >
        <Input
          {...fieldAria('announcement-title')}
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={ANNOUNCEMENT_TITLE_MAX}
        />
      </Field>

      <Field
        label="本文"
        htmlFor="announcement-body"
        aside={<MarkdownHint />}
        description="空のままにすると、一覧に題名だけが並びます（詳細ページを作りません）。"
      >
        <MarkdownEditor
          id="announcement-body"
          value={values.body}
          onChange={(body) => set('body', body)}
        />
      </Field>

      <Field label="公開日時" htmlFor="announcement-published-date" required>
        <div className="flex flex-wrap gap-2">
          <Input
            {...fieldAria('announcement-published-date')}
            type="date"
            className="w-44"
            value={values.publishedDate}
            onChange={(e) => set('publishedDate', e.target.value)}
          />
          <Input
            aria-label="公開時刻"
            type="time"
            className="w-32"
            value={values.publishedTime}
            onChange={(e) => set('publishedTime', e.target.value)}
          />
        </div>
      </Field>

      {values.type === 'low' ? null : (
        <Field
          label="バナーを降ろす日時"
          htmlFor="announcement-pinned-date"
          description="空のままなら公開から7日で降ろします。降ろしたあとも一覧には残ります。"
        >
          <div className="flex flex-wrap gap-2">
            <Input
              {...fieldAria('announcement-pinned-date')}
              type="date"
              className="w-44"
              value={values.pinnedUntilDate}
              onChange={(e) => set('pinnedUntilDate', e.target.value)}
            />
            <Input
              aria-label="バナーを降ろす時刻"
              type="time"
              className="w-32"
              value={values.pinnedUntilTime}
              onChange={(e) => set('pinnedUntilTime', e.target.value)}
            />
          </div>
        </Field>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="default" onClick={onCancel} disabled={pending}>
          やめる
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {isNew ? '作成する' : '保存する'}
        </Button>
      </div>
    </form>
  )
}
