// 特定ユーザーの管理者権限を確認するスクリプト
// 使用方法: npx tsx scripts/check-admin.ts username server

import { prisma } from '../prisma/client'

async function checkAdmin() {
  const args = process.argv.slice(2)
  
  if (args.length < 2) {
    console.log('使用方法: npx tsx scripts/check-admin.ts <username> <server>')
    console.log('例: npx tsx scripts/check-admin.ts admin mastodon.social')
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
      console.log(`❌ ユーザー @${username}@${server} が見つかりません`)
      process.exit(1)
    }

    console.log('👤 ユーザー情報')
    console.log(`名前: ${user.displayName}`)
    console.log(`アカウント: @${user.username}@${user.server}`)
    console.log(`プラットフォーム: ${user.platform}`)
    console.log(`管理者権限: ${user.isAdmin ? '✅ あり' : '❌ なし'}`)
    console.log(`登録日: ${user.createdAt.toLocaleDateString('ja-JP')}`)
    console.log(`ID: ${user.id}`)

    if (user.isAdmin) {
      console.log('')
      console.log('🎯 管理者権限が付与されています')
      console.log('ログアウトして再ログインすると管理画面が表示されます')
    } else {
      console.log('')
      console.log('⚠️  管理者権限がありません')
      console.log('管理者権限を付与するには:')
      console.log(`npx tsx scripts/make-admin.ts ${username} ${server}`)
    }
    
  } catch (error) {
    console.error('エラーが発生しました:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

checkAdmin()