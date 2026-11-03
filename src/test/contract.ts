import { expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * API契約スナップショットの補助。
 *
 * 実DBは使わない（CIにサービスコンテナを置かない方針）。Prisma をフィクスチャで
 * モックし、実 NextRequest を組み立てて route.ts の export を直接呼ぶ。
 *
 * ここで守りたいのは「レスポンスの形」であって、クエリの正しさではない。
 * クエリの正しさはサービス層のユニットテストが Prisma の呼び出し引数を
 * アサートして担保する。
 */

const BASE = 'https://hosteka.test'

export function makeRequest(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): NextRequest {
  const { method = 'GET', body, headers = {} } = init ?? {}
  return new NextRequest(new URL(path, BASE), {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

/** ルート実行結果のうち、契約として固定したい部分だけを取り出す */
export async function snapshotResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  let body: unknown
  if (contentType.includes('application/json')) {
    body = await response.json()
  } else {
    const text = await response.text()
    body = text.length > 500 ? `${text.slice(0, 500)}…(truncated)` : text
  }

  // requestId は毎回変わるためマスクする（存在することだけを固定する）
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: Record<string, unknown> }).error
    if (err && typeof err.requestId === 'string') err.requestId = '<uuid>'
  }

  return {
    status: response.status,
    contentType: contentType.split(';')[0] || null,
    // Location はリダイレクト先の契約なので含める
    ...(response.headers.get('location')
      ? { location: response.headers.get('location') }
      : {}),
    body,
  }
}

export async function expectContract(response: Response) {
  expect(await snapshotResponse(response)).toMatchSnapshot()
}

/**
 * getSession のモック。認証状態ごとの分岐を固定するために使う。
 * 呼び出し側で vi.mock('@/server/auth/session') を宣言しておくこと。
 */
export const PERSONAS = {
  anonymous: null,
  user: {
    sessionId: 'sess_user',
    user: {
      id: 'user_1',
      platform: 'mastodon',
      username: 'taro',
      server: 'example.social',
      isAdmin: false,
    },
  },
  admin: {
    sessionId: 'sess_admin',
    user: {
      id: 'admin_1',
      platform: 'mastodon',
      username: 'admin',
      server: 'example.social',
      isAdmin: true,
    },
  },
} as const

/** Prisma のモック本体を作る。必要なモデル/メソッドだけ足していく */
function buildPrismaMock() {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
  })
  return {
    user: model(),
    event: model(),
    eventParticipant: model(),
    participantGroupSelection: model(),
    participantGroupOption: model(),
    eventOptionGroup: model(),
    eventOption: model(),
    preEvent: model(),
    preEventParticipant: model(),
    preEventDateOption: model(),
    organization: model(),
    organizationAdmin: model(),
    report: model(),
    session: model(),
    bannedUser: model(),
    eventAttendance: model(),
    oauthApp: model(),
    notification: model(),
    announcement: model(),
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  }
}

/**
 * 共有の Prisma モック。
 *
 * vi.mock のファクトリは巻き上げられてトップレベル変数を参照できないため、
 * テスト側では非同期ファクトリから動的 import して受け取る:
 *
 *   vi.mock('@/lib/prisma', async () => ({
 *     prisma: (await import('@/test/contract')).prismaMock,
 *   }))
 */
export const prismaMock = buildPrismaMock()

/** 各テスト間でモックの呼び出し履歴と戻り値をリセットする */
export function resetPrismaMock(): void {
  for (const value of Object.values(prismaMock)) {
    if (typeof value === 'function') {
      ;(value as ReturnType<typeof vi.fn>).mockReset()
      continue
    }
    for (const fn of Object.values(value)) {
      ;(fn as ReturnType<typeof vi.fn>).mockReset()
    }
  }
}
