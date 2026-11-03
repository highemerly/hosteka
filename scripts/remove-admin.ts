// 管理者権限を削除するためのスクリプト
// 使用方法: npx tsx scripts/remove-admin.ts username server

import { prisma } from '../prisma/client'

async function removeAdmin() {
  const args = process.argv.slice(2)
  
  if (args.length < 2) {
    console.log('使用方法: npx tsx scripts/remove-admin.ts <username> <server>')
    console.log('例: npx tsx scripts/remove-admin.ts admin mastodon.social')
    process.exit(1)
  }

  const [username, server] = args

  try {
    // ユーザーを検索
    const user = await prisma.user.findUnique({
      where: {
        username_server: {
          username: username,
          server: server
        }
      }
    })

    if (!user) {
      console.log(`ユーザー @${username}@${server} が見つかりません`)
      process.exit(1)
    }

    if (!user.isAdmin) {
      console.log(`@${username}@${server} は管理者ではありません`)
      process.exit(1)
    }

    // 管理者権限を削除
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: false }
    })

    console.log(`❌ @${username}@${server} (${user.displayName}) の管理者権限を削除しました`)
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

removeAdmin()