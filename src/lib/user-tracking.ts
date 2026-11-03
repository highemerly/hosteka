import { prisma } from './prisma'
import { NextRequest } from 'next/server'
import { normalizeUsername, normalizeServer } from './normalize'

/**
 * ヘッダからクライアントIPを取り出す。
 * Server Component / route handler では next/headers の headers() を、
 * middleware 等では request.headers をそのまま渡せるよう Headers を受ける。
 */
export function getClientIPFromHeaders(headers: Headers): string {
  // Cloudflareやproxy経由の場合のIP取得
  const forwardedFor = headers.get('x-forwarded-for')
  const realIP = headers.get('x-real-ip')
  const cfConnectingIP = headers.get('cf-connecting-ip')

  if (cfConnectingIP) return cfConnectingIP
  if (realIP) return realIP
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  // fallback to unknown if no IP found
  return 'unknown'
}

export function getClientIP(request: NextRequest): string {
  return getClientIPFromHeaders(request.headers)
}

/** アカウントに紐づけて控えるIPの数。これを超えた古いものは持たない */
export const MAX_STORED_IPS = 5

export function updateIPAddressList(currentIPs: string[], newIP: string): string[] {
  const ipList = currentIPs || []
  
  // 既にIPが存在する場合は何もしない
  if (ipList.includes(newIP)) {
    return ipList
  }
  
  // 新しいIPを先頭に追加
  const updatedList = [newIP, ...ipList]
  
  // 最大 MAX_STORED_IPS 個まで保持、古いものから削除
  return updatedList.slice(0, MAX_STORED_IPS)
}

export async function updateUserLoginInfo(userId: string, request: NextRequest): Promise<void> {
  const clientIP = getClientIP(request)
  const now = new Date()
  
  // 現在のユーザー情報を取得
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ipAddresses: true }
  })
  
  if (!user) return
  
  // 現在のIPアドレスリストを解析
  let currentIPs: string[] = []
  if (user.ipAddresses) {
    try {
      currentIPs = JSON.parse(user.ipAddresses)
    } catch (error) {
      console.error('Failed to parse IP addresses:', error)
      currentIPs = []
    }
  }
  
  // IPアドレスリストを更新
  const updatedIPs = updateIPAddressList(currentIPs, clientIP)
  
  // ユーザー情報を更新
  await prisma.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: now,
      ipAddresses: JSON.stringify(updatedIPs),
      updatedAt: now
    }
  })
}

export async function checkBannedUser(username: string, server: string): Promise<boolean> {
  const bannedUser = await prisma.bannedUser.findUnique({
    where: {
      username_server: {
        username: normalizeUsername(username),
        server: normalizeServer(server)
      }
    }
  })

  return !!bannedUser
}