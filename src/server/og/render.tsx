import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

import type { EventCard } from '@/lib/og/event-card'
import type { PreEventCard, PreEventCardOption } from '@/lib/og/pre-event-card'
import { OG_SIZE } from '@/lib/og/size'

/**
 * リンクカードの画像（OG 画像）を描く。大きさは `lib/og/size.ts`。
 *
 * **色は `globals.css` のトークンを sRGB に直した値。** 画像を描く satori は CSS 変数も
 * `oklch()` も読めないので、ここにだけ直書きする（ライトのテーマの値）。
 */
const COLOR = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  muted: '#636363',
  border: '#e5e5e5',
  primary: '#2563eb',
  // 日めくりのバッジ（--calendar-accent / --calendar-paper）
  calendarAccent: '#df1e22',
  calendarPaper: '#fcfcfc',
  calendarPaperForeground: '#161616',
  destructive: '#e7000b',
} as const

/**
 * Noto Sans JP（OFL）。**日本語の字形を持つフォントを渡さないと豆腐になる**
 * （サイトの Geist は日本語を持たない）。可変フォントは satori が正しく描けないので、
 * 静的な Regular と Bold を置いている。standalone に入るよう next.config の
 * `outputFileTracingIncludes` で拾わせている。
 */
let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: 'normal' }[]> | null = null
function loadFonts() {
  fonts ??= Promise.all(
    (['Regular', 'Bold'] as const).map(async (w) => ({
      name: 'Noto Sans JP',
      data: await readFile(join(process.cwd(), 'src', 'assets', 'fonts', `NotoSansJP-${w}.otf`)),
      weight: w === 'Bold' ? (700 as const) : (400 as const),
      style: 'normal' as const,
    }))
  )
  return fonts
}

async function toPng(element: React.ReactElement): Promise<Buffer> {
  const response = new ImageResponse(element, { ...OG_SIZE, fonts: await loadFonts() })
  return Buffer.from(await response.arrayBuffer())
}

function Footer({ left }: { left: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: `2px solid ${COLOR.border}`,
        paddingTop: 28,
        fontSize: 30,
        color: COLOR.muted,
      }}
    >
      <div style={{ display: 'flex', maxWidth: 820 }}>{left}</div>
      <div style={{ display: 'flex', fontWeight: 700, fontSize: 40, color: COLOR.primary }}>Hosteka</div>
    </div>
  )
}

/** イベントのカード */
export function renderEventImage(card: EventCard): Promise<Buffer> {
  return toPng(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '64px 72px 56px',
        backgroundColor: COLOR.background,
        fontFamily: 'Noto Sans JP',
        color: COLOR.foreground,
        borderTop: `16px solid ${COLOR.primary}`,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', flex: 1, gap: 48 }}>
        {/* 日めくり。詳細ページの DateBadge と同じ形（赤い帯に月、白い紙に日と曜日） */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 168,
            height: 196,
            flexShrink: 0,
            borderRadius: 16,
            overflow: 'hidden',
            border: `2px solid ${COLOR.border}`,
            backgroundColor: COLOR.calendarPaper,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '8px 0',
              fontSize: 32,
              backgroundColor: COLOR.calendarAccent,
              color: COLOR.calendarPaper,
            }}
          >
            {`${card.badge.month}月`}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: COLOR.calendarPaperForeground,
            }}
          >
            <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1 }}>{String(card.badge.day)}</div>
            <div style={{ display: 'flex', fontSize: 28, marginTop: 8 }}>{`(${card.badge.weekday})`}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'block',
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.3,
              lineClamp: 2,
              overflow: 'hidden',
            }}
          >
            {card.title}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28, fontSize: 34, color: COLOR.muted }}>
            <div style={{ display: 'flex' }}>{card.schedule}</div>
            {card.location ? <div style={{ display: 'flex' }}>{card.location}</div> : null}
          </div>
        </div>
      </div>

      <Footer left={`主催: ${card.organizer}`} />

      {/*
        **中止は、ふつうのカードの上から大きく重ねる。** 中身（いつ・どこで）は同じに描くので、
        古いリンクを見た人も「どのイベントが中止になったか」が分かる。小さな札だと、
        カードを流し見したときに気づかれない。
      */}
      {card.cancelled ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
          }}
        >
          <div
            style={{
              display: 'flex',
              padding: '6px 52px',
              border: `10px solid ${COLOR.destructive}`,
              borderRadius: 28,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              color: COLOR.destructive,
              fontSize: 160,
              fontWeight: 700,
              lineHeight: 1.2,
              transform: 'rotate(-12deg)',
            }}
          >
            中止
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** 候補日の小さな日めくり。イベントのバッジと同じ形を縮めたもの */
function OptionBadge({ option }: { option: PreEventCardOption }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 176, gap: 8, flexShrink: 0 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 116,
          height: 128,
          borderRadius: 12,
          overflow: 'hidden',
          border: `2px solid ${COLOR.border}`,
          backgroundColor: COLOR.calendarPaper,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '4px 0',
            fontSize: 24,
            backgroundColor: COLOR.calendarAccent,
            color: COLOR.calendarPaper,
          }}
        >
          {`${option.month}月`}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            color: COLOR.calendarPaperForeground,
          }}
        >
          <div style={{ display: 'flex', fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{String(option.day)}</div>
          <div style={{ display: 'flex', fontSize: 22, marginTop: 8 }}>{`(${option.weekday})`}</div>
        </div>
      </div>
      {option.time ? (
        <div style={{ display: 'flex', fontSize: 24, color: COLOR.muted }}>{option.time}</div>
      ) : null}
    </div>
  )
}

/**
 * 日程調整のカード。**日付が1つに決まっていない**ので、イベントの大きな日めくりの代わりに、
 * 候補日を小さな日めくりで並べる。題名の上に「日程調整」と書き、決まったイベントと見分ける。
 */
export function renderPreEventImage(card: PreEventCard): Promise<Buffer> {
  const sub = [card.location, card.deadline ? `回答締切 ${card.deadline}` : null].filter(Boolean).join('　/　')
  return toPng(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '40px 72px 48px',
        backgroundColor: COLOR.background,
        fontFamily: 'Noto Sans JP',
        color: COLOR.foreground,
        borderTop: `16px solid ${COLOR.primary}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div style={{ display: 'flex' }}>
          <div
            style={{
              display: 'flex',
              padding: '2px 18px',
              border: `2px solid ${COLOR.primary}`,
              borderRadius: 999,
              fontSize: 26,
              fontWeight: 700,
              color: COLOR.primary,
            }}
          >
            日程調整
          </div>
        </div>
        <div
          style={{
            display: 'block',
            marginTop: 12,
            fontSize: 50,
            flexShrink: 0,
            fontWeight: 700,
            lineHeight: 1.3,
            lineClamp: 2,
            overflow: 'hidden',
          }}
        >
          {card.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 20, flexShrink: 0 }}>
          {card.options.map((option, i) => (
            <OptionBadge key={i} option={option} />
          ))}
          {card.more > 0 ? (
            <div style={{ display: 'flex', alignSelf: 'center', marginLeft: 16, fontSize: 30, color: COLOR.muted }}>
              {`他 ${card.more} 件`}
            </div>
          ) : null}
        </div>
        {sub ? <div style={{ display: 'flex', marginTop: 16, fontSize: 28, color: COLOR.muted, flexShrink: 0 }}>{sub}</div> : null}
      </div>

      <Footer left={`主催: ${card.organizer}`} />
    </div>
  )
}

/**
 * 中身を見せないときの共通の画像（非公開・無効化・存在しないイベント）。
 * **題名などを一切含まない。**
 */
export function renderGenericImage(): Promise<Buffer> {
  return toPng(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '64px 72px 56px',
        backgroundColor: COLOR.background,
        fontFamily: 'Noto Sans JP',
        borderTop: `16px solid ${COLOR.primary}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
        <div style={{ display: 'flex', fontSize: 96, fontWeight: 700, color: COLOR.primary }}>Hosteka</div>
        <div style={{ display: 'flex', fontSize: 40, marginTop: 16, color: COLOR.foreground }}>
          SNSコミュニティのためのイベントプラットフォーム
        </div>
      </div>
    </div>
  )
}
