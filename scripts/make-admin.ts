// 管理者を作成するためのスクリプト。最初の管理者を作る画面は無いので、ここから作る
// 使用方法: npx tsx scripts/make-admin.ts username server

import { prisma } from '../prisma/client'

async function makeAdmin() {
  const args = process.argv.slice(2)
  
  if (args.length < 2) {
    console.log('使用方法: npx tsx scripts/make-admin.ts <username> <server>')
    console.log('例: npx tsx scripts/make-admin.ts admin mastodon.social')
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
      console.log('まず該当ユーザーでログインしてアカウントを作成してください')
      process.exit(1)
    }

    // 管理者権限を付与
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true }
    })

    console.log(`✅ @${username}@${server} (${user.displayName}) を管理者に設定しました`)
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

makeAdmin()