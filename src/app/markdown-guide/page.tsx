import type { Metadata } from 'next'

import { Notice } from '@/components/common/Notice'
import { ContentPage } from '@/components/content/ContentPage'
import SafeMarkdown from '@/components/SafeMarkdown'

export const metadata: Metadata = {
  title: 'Markdown記法ガイド - Hosteka',
  description:
    'Hosteka の説明文・規約などで使える Markdown 記法の一覧です。Hosteka 独自の記法も含みます。',
}

export default function MarkdownGuidePage() {
  const examples = [
    {
      title: '見出し',
      description: '### や #### を使って見出しを作成します。',
      markdown: `### 大見出し
×××

#### 中見出し
×××
×××

#### 中見出し
×××
×××`,
      note: '「#」と見出しの間には半角スペースが必要です。なお、# と ## は非推奨です（自動的にh3レベルに調整されます）。'
    },
    {
      title: 'テキスト装飾',
      description: '文字を強調したり、取り消し線を付けることができます',
      note: '期待どおり装飾できない場合、スペースが不足している可能性があります。サンプルを参考に前後の文字との間に半角スペースを加えてください。',
      markdown: `あああ **太字のテキスト** あああ
いいい *斜体のテキスト* いいい
ううう ~~取り消し線~~ ううう
えええ \`インラインコード\` えええ`,
    },
    {
      title: '色文字',
      description: '{色名}テキスト{/色名} で文字に色を付けることができます',
      markdown: `{red}赤い文字{/red}
{blue}青い文字{/blue}
{green}緑の文字{/green}
{orange}オレンジの文字{/orange}
{purple}紫の文字{/purple}
{pink}ピンクの文字{/pink}
{gray}グレーの文字{/gray}

**{red}太字と組み合わせ{/red}** も可能です`,
      note: '使用できる色は red, blue, green, orange, purple, pink, gray の7色です。見出しやリスト内でもインラインで使用できます。'
    },
    {
      title: '箇条書きリスト',
      description: '- または * を使って箇条書きを作成できます',
      markdown: `- 項目1
- 項目2
  - サブ項目1
  - サブ項目2
- 項目3`,
    },
    {
      title: '番号付きリスト',
      description: '数字とピリオドで番号付きリストを作成できます',
      markdown: `1. 最初の項目
2. 二番目の項目
   1. サブ項目1
   2. サブ項目2
3. 三番目の項目`,
    },
    {
      title: 'タスクリスト',
      description: 'チェックボックス付きのタスクリストを作成できます',
      markdown: `- [ ] 未完了のタスク
- [x] 完了済みのタスク
- [ ] もう一つの未完了タスク`,
    },
    {
      title: 'リンク',
      description: 'リンクを作成できます（外部リンクは安全確認ページを経由します）',
      markdown: `[内部リンク](/)
[外部リンク](https://example.com)
https://example.com （自動リンク）`,
      note: '外部リンクは安全確認ページを経由して開かれます'
    },
    {
      title: '折りたたみ',
      description: ':::details を使って、クリックで展開できる折りたたみセクションを作成できます',
      markdown: `:::details クリックして詳細を表示
ここに折りたたまれた内容を書きます。

- リスト項目も使えます
- **太字**や*斜体*も使えます

複数の段落も入れられます。
:::`,
      note: '長い補足説明や、オプション情報を折りたたんでおくのに便利です'
    },
    {
      title: '引用',
      description: '> を使って引用ブロックを作成できます',
      markdown: `> これは引用文です。
> 複数行にわたって
> 引用することもできます。`,
    },
    {
      title: 'コードブロック',
      description: '``` で囲んでコードブロックを作成できます',
      markdown: `\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`

\`\`\`
言語を指定しないコードブロック
\`\`\``,
    },
    {
      title: 'テーブル',
      description: '| を使ってテーブルを作成できます',
      markdown: `| 項目 | 説明 | 価格 |
|------|------|------|
| 商品A | 説明A | 1000円 |
| 商品B | 説明B | 2000円 |
| 商品C | 説明C | 3000円 |`,
    }
  ]

  const restrictedFeatures = [
    '画像の埋め込み（![alt](url)）',
    '水平線（--- や ***）',
    'HTMLタグの直接記述',
    'インラインHTML',
    'JavaScriptやその他のスクリプト'
  ]

  return (
    <ContentPage
      title="Markdown記法ガイド"
      lead="説明文・規約などで使える記法です。一部は Hosteka 独自の仕様になっています。"
    >
      <div className="space-y-6">
        {examples.map((example) => (
          <section key={example.title} className="overflow-hidden rounded-xl border border-border">
            <header className="border-b border-border bg-muted px-5 py-4">
              <h2 className="text-base font-bold text-foreground">{example.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{example.description}</p>
              {example.note ? (
                <p className="mt-2 text-sm text-foreground">💡 {example.note}</p>
              ) : null}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2">
              <div className="bg-muted/50 p-5">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">書き方</h3>
                {/*
                  合字を切る。`->` や `!=` が矢印や記号に合成されると、
                  **打つべき文字と見えている文字が食い違う。**
                */}
                <pre
                  className="overflow-x-auto font-mono text-sm text-foreground"
                  style={{ fontVariantLigatures: 'none' }}
                >
                  <code>{example.markdown}</code>
                </pre>
              </div>

              <div className="border-t border-border p-5 lg:border-t-0 lg:border-l">
                <h3 className="mb-3 text-sm font-medium text-muted-foreground">表示結果</h3>
                <SafeMarkdown>{example.markdown}</SafeMarkdown>
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-bold text-foreground">使えない記法</h2>
        <Notice
          tone="danger"
          title="セキュリティ上の理由から、次の記法は使えません"
          className="mt-3"
        >
          <ul className="space-y-1">
            {restrictedFeatures.map((feature) => (
              <li key={feature}>・{feature}</li>
            ))}
          </ul>
        </Notice>
      </section>
    </ContentPage>
  )
}
