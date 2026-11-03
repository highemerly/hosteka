/**
 * 暗号化ユーティリティ。
 *
 * 守っているのは3つ。**どれも鍵は同じ**（同じプロセス・同じ信頼境界にある）:
 *
 * 1. `users.accessToken` — OAuth のアクセストークン（DB。永続）
 * 2. `oauth_apps.clientSecret` — 動的登録したアプリの秘密（DB。永続）
 * 3. `ht-oauth` Cookie — OAuth の往復のあいだだけ持つ情報（10分で消える）
 *
 * **このモジュールはサーバー専用。** 鍵の材料が環境変数にあるので、
 * クライアントから import できる場所に置くと露出する。
 */
import 'server-only'

import crypto from 'crypto'

import { getAuthSecret } from '@/server/auth/secret'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCMの推奨IV長
const TAG_LENGTH = 16 // 認証タグ長
const KEY_LENGTH = 32 // AES-256
const ENCODING = 'base64url'

/**
 * 鍵の版を暗号文の先頭に載せる。**前置きが無いものは v1。**
 *
 * 版を値の中に持たせないと、鍵を替えた日に「読めない古い行」と
 * 「鍵が違うだけの行」を区別できない。
 */
const KEY_VERSION_PREFIX = 'v2:'

/** HKDF の salt と info。**変えると v2 の暗号文が全部読めなくなる** */
const HKDF_SALT = 'hosteka/crypto/aes-256-gcm'
const HKDF_INFO = 'hosteka encryption key v2'

type KeyVersion = 'v1' | 'v2'

/**
 * 暗号鍵を導出する。
 *
 * **秘密は `getAuthSecret()` からだけ取る。** 以前はここが
 * `process.env.NEXTAUTH_SECRET` を直接読んでいて、鍵の出どころが
 * `src/server/auth/secret.ts` と2箇所に分かれていた。名前を `AUTH_SECRET` へ
 * 移した環境では、セッションは通るのに**トークンの復号だけが落ちる**。
 *
 * ## 版
 *
 * - `v2`（既定）… HKDF-SHA256。salt と info で用途を固定する
 * - `v1`（**復号のみ**）… `sha256(secret)` を1回かけただけのもの。
 *   **消せない** — この鍵で暗号化された `users.accessToken` と
 *   `oauth_apps.clientSecret` が DB に残っており、作り直すには
 *   全員の再ログインとアプリの再登録が要る
 */
function deriveKey(version: KeyVersion): Buffer {
  const secret = getAuthSecret()
  if (version === 'v1') {
    return crypto.createHash('sha256').update(secret).digest()
  }
  return Buffer.from(crypto.hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, KEY_LENGTH))
}

/**
 * データを暗号化する
 * @param data - 暗号化するデータ（オブジェクト）
 * @returns 暗号化された文字列（版 + IV + 暗号文 + タグ）
 */
export function encrypt<T extends object>(data: T): string {
  const key = deriveKey('v2')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const plaintext = JSON.stringify(data)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()

  // IV + 暗号文 + タグ を結合してエンコード
  const combined = Buffer.concat([iv, encrypted, tag])
  return `${KEY_VERSION_PREFIX}${combined.toString(ENCODING)}`
}

/**
 * 暗号化されたデータを復号する。
 *
 * 版は先頭の前置きで見分ける。**古い暗号文（前置き無し）も読む** —
 * 読めなくすると、DB に残っているアクセストークンとアプリの秘密が死ぬ。
 *
 * @param encryptedData - 暗号化された文字列
 * @returns 復号されたオブジェクト、または失敗時はnull
 */
export function decrypt<T = Record<string, unknown>>(encryptedData: string): T | null {
  const hasVersion = encryptedData.startsWith(KEY_VERSION_PREFIX)
  const version: KeyVersion = hasVersion ? 'v2' : 'v1'
  const payload = hasVersion ? encryptedData.slice(KEY_VERSION_PREFIX.length) : encryptedData

  try {
    const key = deriveKey(version)
    const combined = Buffer.from(payload, ENCODING)

    // IV、暗号文、タグを分離
    const iv = combined.subarray(0, IV_LENGTH)
    const tag = combined.subarray(combined.length - TAG_LENGTH)
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])

    return JSON.parse(decrypted.toString('utf8')) as T
  } catch (error) {
    console.error('Decryption failed:', error)
    return null
  }
}

/**
 * OAuth の往復のあいだ `ht-oauth` Cookie に入れておくもの。
 *
 * **クライアントシークレットは入れない。** アプリは DB に置いて使い回す
 * （`src/server/auth/oauth-app.ts`）。ここにはどのアプリで始めたかだけを持つ。
 */
export interface OAuthSessionData {
  /** `oauth_apps` の行の ID */
  appId: string
  server: string
  /** 認可のときに求めた権限。アプリに登録した権限の部分集合 */
  scopes: string
  /** state の csrf と同じ値。このブラウザで始めたログインかを確かめる */
  csrf: string
  platform: 'mastodon' | 'pleroma'
  createdAt: number
}

/**
 * Discord / X（ホスト名を要らないほう）のログインのあいだ
 * `ht-oauth` Cookie に入れておくもの。
 *
 * **`state` だけでは「このブラウザで始めたログインか」を確かめられない。**
 * `state` は署名も保存もされていない只の base64 で、攻撃者が自分の認可コードと
 * 自作の state を並べたリンクを踏ませれば、踏んだ人を攻撃者のアカウントで
 * ログインさせられる。Cookie はこのブラウザで始めたログインにしか無い。
 */
export interface HostedOAuthSessionData {
  platform: 'discord' | 'twitter'
  /** state の csrf と同じ値 */
  csrf: string
  /**
   * X の PKCE 検証子。
   *
   * **`state` に載せない。** 載せると、challenge と verifier の両方を
   * 攻撃者が決められることになり、PKCE が何も縛らなくなる。
   */
  codeVerifier?: string
  createdAt: number
}

/**
 * Misskey（MiAuth）のログインのあいだ `ht-oauth` Cookie に入れておくもの。
 *
 * **このブラウザで始めたログインかを確かめるためにある。** コールバック URL は
 * 署名してあるが、URL ごと他人に踏ませることはできる。Cookie が無いと、
 * 自分のアカウントで承認したコールバック URL を踏ませて、相手を自分の
 * アカウントでログインさせられる。
 */
export interface MiAuthSessionData {
  platform: 'misskey'
  server: string
  /** MiAuth のセッション ID。コールバック URL のものと一致しなければ通さない */
  session: string
  createdAt: number
}

/**
 * アクセストークン暗号化のプレフィックス。
 *
 * **鍵の版とは別物。** どの鍵かは中身の先頭（`v2:`）が持つ。
 */
const ENCRYPTED_TOKEN_PREFIX = 'enc:v1:'

/**
 * アクセストークンを暗号化する
 * @param token - 平文のアクセストークン
 * @returns 暗号化されたトークン（プレフィックス付き）
 */
export function encryptAccessToken(token: string): string {
  const encrypted = encrypt({ token })
  return `${ENCRYPTED_TOKEN_PREFIX}${encrypted}`
}

/**
 * アクセストークンを復号する。
 *
 * **プレフィックスの無い値は読まない**（null）。どの行も暗号化して保存して
 * あり、平文の行は本番に残っていないことを確かめたうえで、平文をそのまま
 * 返す分岐を外した。
 *
 * @returns 復号されたトークン。無い・読めないときは null
 */
export function decryptAccessToken(encryptedToken: string | null | undefined): string | null {
  if (!encryptedToken?.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
    return null
  }

  // プレフィックスを除去して復号
  const encrypted = encryptedToken.slice(ENCRYPTED_TOKEN_PREFIX.length)
  const decrypted = decrypt<{ token: string }>(encrypted)

  return decrypted?.token ?? null
}

