// E2E 用の偽 Fediverse サーバー（Mastodon / Misskey）。
// hosteka がログインと投稿で呼ぶエンドポイントだけを、Host ヘッダーで振り分けて返す。
// 受けたリクエストは記録し、テストは管理用の HTTP（:8080）から取り出して中身を確かめる。
//
// hosteka はサーバーを https:// 固定・ポートなしで呼ぶので、443 で TLS を張る
// （証明書は gen-certs.sh が作り、アプリ側は NODE_EXTRA_CA_CERTS で CA を信頼する）。
// 依存を増やさないため Node 標準だけで書く。
import { createServer as createHttpsServer } from 'node:https'
import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'

const MASTODON = 'mastodon.test'
const MISSKEY = 'misskey.test'
const CERTS = process.env.CERTS_DIR ?? '/certs'

/** 受けたリクエスト（管理用の HTTP から取り出す） */
let received = []
/** 発行したトークン → ユーザー名 */
let tokens = new Map()
/** 予約投稿（Mastodon） */
let scheduled = []
/** 管理用の HTTP から差し込む応答（`${host} ${method} ${path}` → status） */
let overrides = new Map()
/** Misskey で次に承認するユーザー名 */
let misskeyNextUser = 'mika'
let seq = 0

function reset() {
  received = []
  tokens = new Map()
  scheduled = []
  overrides = new Map()
  misskeyNextUser = 'mika'
  seq = 0
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text }
  }
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload ?? {}))
}

function issueToken(prefix, username) {
  const token = `${prefix}-${++seq}`
  tokens.set(token, username)
  return token
}

function bearer(req) {
  return (req.headers.authorization ?? '').replace(/^Bearer /, '') || null
}

function mastodon(method, path, query, body, req) {
  if (method === 'GET' && path === '/api/v1/instance') return [200, { uri: MASTODON, version: '4.4.0' }]
  if (method === 'POST' && path === '/api/v1/apps') {
    const n = ++seq
    return [200, { id: String(n), name: body.client_name, client_id: `client-${n}`, client_secret: `secret-${n}` }]
  }
  if (method === 'POST' && path === '/oauth/token') {
    // アプリの確認（client_credentials）は、ユーザーに紐づかないトークンを返す
    if (body.grant_type === 'client_credentials') {
      return [200, { access_token: `app-token-${++seq}`, token_type: 'Bearer', scope: body.scope }]
    }
    // テストは認可画面を通さず、code に `e2e-<ユーザー名>` を入れてコールバックを開く
    const username = String(body.code ?? '').replace(/^e2e-/, '')
    if (!username) return [400, { error: 'invalid_grant' }]
    return [200, { access_token: issueToken('mastodon-token', username), token_type: 'Bearer', scope: body.scope ?? 'read' }]
  }
  if (method === 'POST' && path === '/oauth/revoke') return [200, {}]
  if (method === 'GET' && path === '/api/v1/accounts/verify_credentials') {
    const username = tokens.get(bearer(req))
    if (!username) return [401, { error: 'The access token is invalid' }]
    return [200, { id: username, username, acct: username, display_name: `${username} (E2E)`, avatar: `https://${MASTODON}/avatars/${username}.png` }]
  }
  if (method === 'POST' && path === '/api/v1/statuses') {
    if (!tokens.get(bearer(req))) return [401, { error: 'The access token is invalid' }]
    const id = `status-${++seq}`
    if (body.scheduled_at) {
      const item = { id, scheduled_at: body.scheduled_at, params: { text: body.status, visibility: body.visibility }, media_attachments: [], token: bearer(req) }
      scheduled.push(item)
      return [200, item]
    }
    return [200, { id, content: body.status, visibility: body.visibility }]
  }
  if (method === 'GET' && path === '/api/v1/scheduled_statuses') {
    return [200, scheduled.filter((s) => s.token === bearer(req)).map(({ token: _token, ...s }) => s)]
  }
  const cancel = path.match(/^\/api\/v1\/scheduled_statuses\/([^/]+)$/)
  if (method === 'DELETE' && cancel) {
    scheduled = scheduled.filter((s) => s.id !== cancel[1])
    return [200, {}]
  }
  return null
}

function misskey(method, path, query, body) {
  if (method === 'POST' && path === '/api/meta') return [200, { name: 'Fake Misskey', version: '2026.9.0' }]
  // MiAuth の承認済みセッションを確かめる。テストは承認画面を通さず、コールバックを直接開く
  if (method === 'POST' && /^\/api\/miauth\/[^/]+\/check$/.test(path)) {
    const username = misskeyNextUser
    return [200, { ok: true, token: issueToken('misskey-token', username), user: { id: username, username } }]
  }
  if (method === 'POST' && path === '/api/i') {
    const username = tokens.get(body.i)
    if (!username) return [401, { error: { code: 'CREDENTIAL_REQUIRED' } }]
    return [200, { id: username, username, name: `${username} (E2E)`, avatarUrl: `https://${MISSKEY}/avatars/${username}.png` }]
  }
  if (method === 'POST' && path === '/api/users/show') return [200, { username: body.username }]
  if (method === 'POST' && path === '/api/i/revoke-token') {
    tokens.delete(body.token)
    return [200, {}]
  }
  if (method === 'POST' && path === '/api/notes/create') {
    if (!tokens.get(body.i)) return [401, { error: { code: 'CREDENTIAL_REQUIRED' } }]
    return [200, { createdNote: { id: `note-${++seq}`, text: body.text, visibility: body.visibility } }]
  }
  return null
}

const fediverse = createHttpsServer(
  { key: readFileSync(`${CERTS}/server-key.pem`), cert: readFileSync(`${CERTS}/server.pem`) },
  async (req, res) => {
    const url = new URL(req.url ?? '/', 'https://local')
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    const method = req.method ?? 'GET'
    const body = method === 'GET' || method === 'DELETE' ? {} : await readJson(req)
    const query = Object.fromEntries(url.searchParams)
    received.push({ host, method, path: url.pathname, query, authorization: req.headers.authorization ?? null, json: body })

    // WebFinger（ログイン後の監査ログ用）は両方で返す
    if (method === 'GET' && url.pathname === '/.well-known/webfinger') {
      return send(res, 200, { subject: query.resource, links: [] })
    }

    const forced = overrides.get(`${host} ${method} ${url.pathname}`)
    if (forced) return send(res, forced, { error: 'forced by e2e' })

    const result =
      host === MASTODON ? mastodon(method, url.pathname, query, body, req) : host === MISSKEY ? misskey(method, url.pathname, query, body) : null
    if (!result) return send(res, 404, { error: `fakeverse: ${host} ${method} ${url.pathname}` })
    send(res, result[0], result[1])
  }
)

// 管理用（テストから叩く）。記録の取り出し・消去と、応答の差し込み
const admin = createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  if (req.method === 'GET' && url.pathname === '/received') return send(res, 200, received)
  if (req.method === 'POST' && url.pathname === '/reset') {
    reset()
    return send(res, 200, {})
  }
  if (req.method === 'POST' && url.pathname === '/override') {
    const { host, method, path, status } = await readJson(req)
    if (status) overrides.set(`${host} ${method} ${path}`, status)
    else overrides.delete(`${host} ${method} ${path}`)
    return send(res, 200, {})
  }
  if (req.method === 'POST' && url.pathname === '/misskey-next-user') {
    misskeyNextUser = (await readJson(req)).username
    return send(res, 200, {})
  }
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, {})
  send(res, 404, {})
})

fediverse.listen(443, () => console.log('[fakeverse] https on 443'))
admin.listen(8080, () => console.log('[fakeverse] admin on 8080'))
