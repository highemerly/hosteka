/**
 * 入力の上限。**スキーマと画面の両方が同じ値を見る。**
 *
 * 以前は `src/lib/validation.ts`（手書きの検証、465行）が持っていた。
 * あのファイルは Zod へ寄せて撤去したが、**定数だけは残す価値がある** —
 * 画面が文字数カウンタを出すのに必要で、スキーマの外にも要るため。
 *
 * 値を変えるときは DB の列定義（`prisma/schema.prisma`）も一緒に見ること。
 */
export const VALIDATION_LIMITS = {
  EVENT_TITLE: 100,
  LOCATION: 200,
  FEE: 200,
  URL: 200,
  TERMS: 10000,
  DESCRIPTION: 20000,
  OPTION_GROUP_TITLE: 100,
  OPTION_NAME: 50,
  /** 自由入力の回答。DBは participant_group_selections.textAnswer VARCHAR(100) */
  OPTION_TEXT_ANSWER: 100,
  PARTICIPANT_COMMENT: 300,
  ORG_NAME: 100,
  ORG_SLUG_MIN: 4,
  ORG_SLUG_MAX: 50,
  ORG_DESCRIPTION: 20000,
  ORG_RELATED_URL: 500,
  /** 自己紹介（Markdown）。DBは users.bio TEXT */
  USER_BIO: 2000,
  /** DBは users.email VARCHAR(254)。254 は RFC 5321 のアドレス長上限 */
  USER_EMAIL: 254,
  USER_HOMEPAGE_URL: 500,
  USER_SOCIAL_USERNAME: 100,
  USER_SOCIAL_SERVER: 255,
} as const

export const NUMBER_LIMITS = {
  MAX_PARTICIPANTS: {
    MIN: 1,
    MAX: 130000000,
  },
} as const

export const COUNT_LIMITS = {
  /**
   * 参加できるサーバーの数。保存のたびに、1つずつ外部（anypost.dev）へ
   * 種別を問い合わせるので、上限が無いと1回の保存で何万件も飛ばせる。
   */
  ALLOWED_FEDIVERSE_SERVERS: 20,
} as const
