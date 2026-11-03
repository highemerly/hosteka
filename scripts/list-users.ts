// 登録ユーザー一覧を表示するスクリプト
// 使用方法: npx tsx scripts/list-users.ts

import { prisma } from '../prisma/client'

async function listUsers() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        server: true,
        displayName: true,
        platform: true,
        isAdmin: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })

    console.log('📋 登録ユーザー一覧')
    console.log('='.repeat(50))
    
    if (users.length === 0) {
      console.log('登録ユーザーはいません')
      return
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.displayName} (@${user.username}@${user.server})`)
      console.log(`   プラットフォーム: ${user.platform}`)
      console.log(`   管理者: ${user.isAdmin ? '✅ Yes' : '❌ No'}`)
      console.log(`   登録日: ${user.createdAt.toLocaleDateString('ja-JP')}`)
      console.log(`   ID: ${user.id}`)
      console.log('')
    })

    console.log(`合計: ${users.length} ユーザー`)
    console.log(`管理者: ${users.filter(u => u.isAdmin).length} ユーザー`)
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

listUsers()