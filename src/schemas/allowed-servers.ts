import { z } from 'zod'

import { COUNT_LIMITS } from './limits'

/** ホスト名の長さの上限（RFC 1035） */
const HOSTNAME_MAX = 253

/**
 * 参加できる Fediverse のサーバー。空なら制限なし。
 * イベントと日程調整（フォームと保存時の形）で同じものを使う。
 */
export const allowedFediverseServersSchema = z
  .array(z.string().trim().min(1).max(HOSTNAME_MAX))
  .max(
    COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS,
    `サーバーは${COUNT_LIMITS.ALLOWED_FEDIVERSE_SERVERS}個まで指定できます`
  )
