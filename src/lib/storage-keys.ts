/**
 * localStorage / sessionStorage のキー。
 *
 * 命名は Cookie（`cookie-names.ts`）と同じ `ht-<項目>`。
 * **どれもサーバーへは送られない。** サーバーが読まないものは Cookie に置かない
 * （全リクエストに載るうえ、画面側で書いた Cookie は Safari が7日に切り詰める）。
 *
 * 名前を変えたら `src/components/legal/PrivacyDocument.tsx` の一覧も直す。
 */

// ==================== localStorage ====================

/** テーマの設定（light / dark / system） */
export const STORAGE_THEME = 'ht-theme'

/** 前回ログインに使ったサーバーのホスト名。プラットフォームごと */
export const STORAGE_SERVER = 'ht-server'

// ==================== sessionStorage ====================

/** 読み直しを越えて1回だけ出す知らせ */
export const STORAGE_FLASH = 'ht-flash'

/** 権限の取り直しに出るあいだ預けておく、イベントの連絡文の下書き */
export const STORAGE_EVENT_CONTACT_DRAFT = 'ht-event-contact-draft'

/** 同じく、日程調整の連絡文の下書き */
export const STORAGE_PRE_EVENT_CONTACT_DRAFT = 'ht-pre-event-contact-draft'
