import 'server-only'

import dns from 'dns/promises'
import net from 'net'

/**
 * 利用者が入力したホスト名へ接続していいかを確かめる。
 *
 * ログインの入口（Mastodon / Misskey / Pleroma の `register`）や
 * コールバックは**未認証で叩ける**うえ、本文に書かれたホスト名へこちらから接続する。
 * 何も見ないと、クラスタの中だけに見えるものを外から叩かせられる
 * （blind SSRF）。応答の本文は返さないが、HTTP ステータスが
 * 「Invalid ～ server」と「Could not connect」に割れるので、
 * **内部のホストとポートの存在を確かめる真偽オラクル**になる。
 *
 * 入力の正規表現（`schemas/auth.ts` の `serverHost`）は末尾を英字に
 * 強制するので IP リテラルは入ってこない。**残るのは名前で届く経路** —
 * `metadata.google.internal`、`redis.hosteka.svc.cluster.local`、
 * ワイルドカード DNS の `10-42-0-7.nip.io` など。名前を解決して
 * 当たり先を見るまで判断できない。
 *
 * **直接呼ばず、`server/remote-fetch.ts` の `remoteFetch` を通すこと。**
 * 接続のたびにここで確かめ、リダイレクトを追わない（追うと、ここの判定を
 * 通ったあとで宛先が変わる）。
 */

/** ホスト名だけで断れるもの */
const BLOCKED_HOSTNAMES = new Set(['localhost'])

/** 内部向けに使われる名前の末尾。引くまでもなく断る */
const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.private',
  '.corp',
  '.home',
  '.lan',
  '.svc',
  '.cluster.local',
  '.home.arpa',
  '.in-addr.arpa',
  '.ip6.arpa',
]

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (BLOCKED_HOSTNAMES.has(host)) return true
  return BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b, c] = parts

  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // プライベート
  if (a === 127) return true // ループバック
  if (a === 169 && b === 254) return true // リンクローカル（クラウドのメタデータ）
  if (a === 172 && b >= 16 && b <= 31) return true // プライベート
  if (a === 192 && b === 168) return true // プライベート
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  /*
    **3つ目の数字（/24）まで見る。** 予約されているのは /24 だけで、2つ目の数字までで
    切ると、隣の実在する公開アドレスに載っているサーバーの人がログインできなくなる。

    **文書用（TEST-NET: 192.0.2.0/24・198.51.100.0/24・203.0.113.0/24）は断らない。**
    断る理由は「クラスタの内部へ届く」ことで、文書用はどこの内部でも使われていない。
    E2E の偽 Fediverse サーバーはここ（198.51.100.0/24）に置く。
  */
  if (a === 192 && b === 0 && c === 0) return true // IETF 用（NAT64 の検出などを含む）
  if (a === 198 && (b === 18 || b === 19)) return true // ベンチマーク（検証網で実際に使われる）
  if (a >= 224) return true // マルチキャスト・予約・ブロードキャスト

  return false
}

function isPrivateIPv6(ip: string): boolean {
  const host = ip.toLowerCase().split('%')[0] // ゾーンIDを落とす

  // IPv4 射影（::ffff:10.0.0.1 / ::ffff:0a00:0001）
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIPv4(mapped[1])

  if (host === '::' || host === '::1') return true
  if (host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) {
    return true // fe80::/10 リンクローカル
  }
  if (/^f[cd]/.test(host)) return true // fc00::/7 ユニークローカル
  if (host.startsWith('ff')) return true // マルチキャスト
  if (host.startsWith('64:ff9b')) return true // NAT64
  if (host.startsWith('100:')) return true // 破棄用プレフィックス
  if (host.startsWith('2001:db8')) return true // 文書用
  if (host.startsWith('::ffff:')) return true // 判定できない射影は通さない

  // 先頭の16ビットで決まる範囲。文字列の前方一致だと `fec:`（0x0fec）なども当たるので数で見る
  const first = parseInt(host.split(':')[0] || '0', 16)
  if ((first & 0xffc0) === 0xfec0) return true // fec0::/10 サイトローカル（廃止済み。内部で使われうる）
  /*
    2002::/16 は 6to4。**中に IPv4 アドレスを埋め込む**（`2002:0a00:0001::` は 10.0.0.1）。
    中身を読んで判定する手もあるが、6to4 は廃止済みで、ここに載る Fediverse の
    サーバーは無いので、範囲ごと断る。
  */
  if (first === 0x2002) return true

  return false
}

export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  // IP として読めないものは通さない
  return true
}

/**
 * 接続してよいホスト名か。
 *
 * **1つでも内部アドレスに当たれば断る。** 複数返るとき、どれに繋ぐかは
 * こちらで決められない。
 *
 * @returns 断る理由（接続してよければ null）
 */
export async function checkOutboundHost(
  hostname: string
): Promise<'blocked-name' | 'private-address' | 'unresolvable' | null> {
  if (isBlockedHostname(hostname)) return 'blocked-name'

  let addresses: { address: string }[]
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    return 'unresolvable'
  }

  if (addresses.length === 0) return 'unresolvable'
  if (addresses.some(({ address }) => isPrivateAddress(address))) return 'private-address'

  return null
}
