// メッセージ分割ユーティリティ

export type SplitPost = {
  mentions: string[]
  body: string
  fullText: string
  characterCount: number
}

export type SplitResult = {
  posts: SplitPost[]
  totalMentions: number
  needsSplit: boolean
}

const DEFAULT_maxLength = 500

/**
 * メンションと本文を含むメッセージを指定文字数以内に分割する
 * @param mentions メンション配列（例: ["@user1@server.com", "@user2"]）
 * @param body 本文
 * @param maxLength 文字数上限（デフォルト: 500、Misskey: 3000）
 * @returns 分割結果
 */
export function splitMessage(mentions: string[], body: string, maxLength: number = DEFAULT_maxLength): SplitResult {
  const totalMentions = mentions.length

  // メンションがない場合は本文のみ
  if (mentions.length === 0) {
    return {
      posts: [{
        mentions: [],
        body,
        fullText: body,
        characterCount: body.length
      }],
      totalMentions: 0,
      needsSplit: body.length > maxLength
    }
  }

  // 全メンションを結合した場合の文字数をチェック
  const allMentionsText = mentions.join(' ')
  const fullMessage = `${allMentionsText}\n\n${body}`

  if (fullMessage.length <= maxLength) {
    return {
      posts: [{
        mentions,
        body,
        fullText: fullMessage,
        characterCount: fullMessage.length
      }],
      totalMentions,
      needsSplit: false
    }
  }

  // 分割が必要
  const posts: SplitPost[] = []
  let remainingMentions = [...mentions]

  while (remainingMentions.length > 0) {
    const postMentions: string[] = []
    let currentLength = body.length + 2 // 本文 + "\n\n"

    // メンションを1つずつ追加していく
    for (let i = 0; i < remainingMentions.length; i++) {
      const mention = remainingMentions[i]
      const mentionLength = mention.length + (postMentions.length > 0 ? 1 : 0) // スペース分

      if (currentLength + mentionLength <= maxLength) {
        postMentions.push(mention)
        currentLength += mentionLength
      } else {
        break
      }
    }

    // 1つもメンションが入らない場合（本文だけで超過）
    if (postMentions.length === 0 && remainingMentions.length > 0) {
      // 最低1つは入れる
      postMentions.push(remainingMentions[0])
    }

    // 使用したメンションを削除
    remainingMentions = remainingMentions.slice(postMentions.length)

    const mentionsText = postMentions.join(' ')
    const fullText = `${mentionsText}\n\n${body}`

    posts.push({
      mentions: postMentions,
      body,
      fullText,
      characterCount: fullText.length
    })
  }

  return {
    posts,
    totalMentions,
    needsSplit: posts.length > 1
  }
}
