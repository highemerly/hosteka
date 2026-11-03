import { NextResponse } from 'next/server'

import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { requirePreEventOrganizer } from '@/server/http/guards'
import { preEventIdParam } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'
import { formatJstDateTime, jstParts, toJstDateInput, toJstIso } from '@/lib/jst'
import { getBaseUrl } from '@/lib/base-url'
import { cell, isoInterval, metadataRows } from '@/server/http/csv'

const STATUS_LABEL: Record<string, string> = {
  available: '参加可能',
  maybe: '未定',
  unavailable: '参加不可',
}

export const GET = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  guard: requirePreEventOrganizer('エクスポート'),
  handler: async ({ params }) => {
    const id = params.id
    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            server: true,
            platform: true,
          },
        },
        dateOptions: {
          orderBy: { displayOrder: 'asc' }
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                server: true,
                platform: true,
              },
            },
            dateOption: {
              select: {
                id: true,
                startDate: true,
                endDate: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }

    // 主催者または組織管理者のみCSVダウンロード可能

    // 参加者データを整理
    const participantData = new Map()
    
    // 各参加者の回答を整理
    preEvent.participants.forEach(participant => {
      const key = participant.userId
      if (!participantData.has(key)) {
        participantData.set(key, {
          user: participant.user,
          responses: new Map(),
          comment: participant.comment || '',
          autoRegister: participant.autoRegisterWhenPromoted,
          createdAt: participant.createdAt
        })
      }
      
      const userData = participantData.get(key)
      userData.responses.set(participant.dateOptionId, participant.status)
    })

    // CSVヘッダー作成
    const headers = [
      '日程調整ID',
      '登録日時',
      'ユーザー名',
      'ユーザーID',
      '自動登録',
      'ユーザーコメント',
    ]
    
    /*
      候補日を列に。**時刻が 00:00 の候補は日付だけ**、終了が 23:59 のものは
      「その日の終わりまで」なので終了を書かない（どちらも時刻を指定していない印）。
    */
    preEvent.dateOptions.forEach(option => {
      const start = jstParts(option.startDate)
      if (start.hour === 0 && start.minute === 0) {
        headers.push(toJstDateInput(option.startDate))
        return
      }
      const end = option.endDate ? jstParts(option.endDate) : null
      const hasEnd = end !== null && !(end.hour === 23 && end.minute === 59)
      headers.push(
        isoInterval(toJstIso(option.startDate), hasEnd ? toJstIso(option.endDate!) : null)
      )
    })

    const now = new Date()
    const csvRows = [
      ...metadataRows(
        [
          ['日程調整名', preEvent.title],
          ['日程調整ID', preEvent.id],
          ['開催場所', preEvent.location ?? ''],
          ['参加費', preEvent.fee ?? ''],
          ['日程調整URL', `${getBaseUrl()}/pre-events/${preEvent.id}`],
        ],
        now
      ),
      headers.map(cell).join(','),
    ]

    // データ行
    participantData.forEach((userData, _userId) => {
      const row = [
        cell(preEvent.id),
        cell(toJstIso(userData.createdAt)),
        cell(userData.user.displayName),
        // 頭に `@` を付けない。表計算ソフトは `@` で始まる値を式として読む
        cell(`${userData.user.username}@${userData.user.server}`),
        cell(userData.autoRegister ? 'はい' : 'いいえ'),
        cell(userData.comment),
      ]

      // 各日程オプションの回答を追加
      preEvent.dateOptions.forEach(option => {
        /*
          **答えていない候補日を「参加不可」にしない。**
          回答は候補日ごとに1行なので、行が無い＝まだ答えていない。
          以前は無回答を unavailable に倒しており、あとから足された候補日が
          全員「参加不可」で出ていた（主催者から見ると全員が×を付けたのと
          区別がつかない）。
        */
        const status = userData.responses.get(option.id)
        row.push(cell(status ? (STATUS_LABEL[status] ?? status) : '未回答'))
      })

      csvRows.push(row.join(','))
    })

    // CSV文字列作成（BOM付きUTF-8）
    const csvContent = '\uFEFF' + csvRows.join('\n')
    
    // ファイル名にダウンロード日時を含める
    const dateTimeStr = formatJstDateTime(now, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/[\/:]/g, '-').replace(/\s/g, '_')
    const fileName = `${preEvent.title}_responses_${dateTimeStr}.csv`

    /*
      **`NextResponse` で返す。** `defineRoute` は素の `Response` も
      通すようになったが、CSV・ICS を返す他のルートと形を揃えておく。
    */
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    })
  },
})