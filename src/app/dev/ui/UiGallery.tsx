'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import ThemeToggle from '@/components/layout/ThemeToggle'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
      <Separator />
    </section>
  )
}

/** アプリ固有トークン。ライト/ダーク両方で見え方を確認するための一覧 */
const APP_TOKENS = [
  { name: 'brand-event', label: 'イベント' },
  { name: 'brand-pre-event', label: '日程調整' },
  { name: 'status-attending', label: '参加' },
  { name: 'status-maybe', label: '未定' },
  { name: 'status-not-attending', label: '不参加' },
  { name: 'status-cancelled', label: 'キャンセル' },
  { name: 'status-request', label: '参加リクエスト' },
] as const

export default function UiGallery() {
  const confirm = useConfirm()
  const [switchOn, setSwitchOn] = useState(true)

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">UI ギャラリー</h1>
          <p className="text-muted-foreground text-sm">
            全プリミティブの一覧。ライト/ダーク両方で確認すること。
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Section title="Button">
        {/* primary と state は同じ青の強弱。**必ず並べて確認する**（別の色に見えたら失敗） */}
        {(
          ['primary', 'state', 'default', 'destructive', 'ghost', 'link'] as const
        ).map((v) => (
          <Button key={v} variant={v}>
            {v}
          </Button>
        ))}
        <Button disabled>disabled</Button>
        <Button size="sm">small</Button>
        <Button>large</Button>
      </Section>

      <Section title="アプリ固有トークン">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {APP_TOKENS.map((t) => (
            <div key={t.name} className="space-y-1">
              <div
                className="flex h-14 items-center justify-center rounded-md text-xs font-medium"
                style={{
                  backgroundColor: `var(--${t.name})`,
                  color: `var(--${t.name}-foreground)`,
                }}
              >
                {t.label}
              </div>
              <p className="text-muted-foreground font-mono text-[11px]">--{t.name}</p>
            </div>
          ))}
          <div className="space-y-1">
            <div className="bg-surface-subtle text-foreground flex h-14 items-center justify-center rounded-md border text-xs">
              surface
            </div>
            <p className="text-muted-foreground font-mono text-[11px]">--surface-subtle</p>
          </div>
        </div>
      </Section>

      <Section title="フォーム">
        <div className="w-full max-w-sm space-y-4">
          <div className="space-y-2">
            <Label htmlFor="g-input">テキスト</Label>
            <Input id="g-input" placeholder="イベント名を入力" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-input-invalid">エラー状態</Label>
            <Input id="g-input-invalid" aria-invalid defaultValue="不正な値" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-textarea">複数行</Label>
            <Textarea id="g-textarea" placeholder="説明" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-select">セレクト</Label>
            <Select>
              <SelectTrigger id="g-select">
                <SelectValue placeholder="選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attending">参加</SelectItem>
                <SelectItem value="maybe">未定</SelectItem>
                <SelectItem value="not_attending">不参加</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="g-check" defaultChecked />
            <Label htmlFor="g-check">公開する</Label>
          </div>
          <RadioGroup defaultValue="a" className="space-y-2">
            {[
              ['a', '選択肢A'],
              ['b', '選択肢B'],
            ].map(([v, label]) => (
              <div key={v} className="flex items-center gap-2">
                <RadioGroupItem value={v} id={`g-radio-${v}`} />
                <Label htmlFor={`g-radio-${v}`}>{label}</Label>
              </div>
            ))}
          </RadioGroup>
          <div className="flex items-center gap-2">
            <Switch id="g-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
            <Label htmlFor="g-switch">「未定」を許可する</Label>
          </div>
        </div>
      </Section>

      <Section title="Badge">
        {(['default', 'secondary', 'destructive', 'outline'] as const).map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
        {APP_TOKENS.slice(2).map((t) => (
          <span
            key={t.name}
            className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
            style={{ backgroundColor: `var(--${t.name})`, color: `var(--${t.name}-foreground)` }}
          >
            {t.label}
          </span>
        ))}
      </Section>

      <Section title="Card / Alert / Avatar / Skeleton">
        <Card className="w-72">
          <CardHeader>
            <CardTitle>イベントタイトル</CardTitle>
            <CardDescription>2026年9月1日 19:00</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            カードの本文。日本語フォントの確認も兼ねる。
          </CardContent>
        </Card>
        <div className="w-72 space-y-3">
          <Alert>
            <AlertTitle>お知らせ</AlertTitle>
            <AlertDescription>通常の通知です。</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>エラー</AlertTitle>
            <AlertDescription>処理に失敗しました。</AlertDescription>
          </Alert>
        </div>
        <div className="space-y-3">
          <Avatar>
            <AvatarFallback>HT</AvatarFallback>
          </Avatar>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </Section>

      <Section title="Tabs / Table / Tooltip">
        <Tabs defaultValue="events" className="w-full max-w-md">
          <TabsList>
            <TabsTrigger value="events">イベント</TabsTrigger>
            <TabsTrigger value="pre-events">日程調整</TabsTrigger>
          </TabsList>
          <TabsContent value="events" className="text-muted-foreground text-sm">
            イベントの一覧
          </TabsContent>
          <TabsContent value="pre-events" className="text-muted-foreground text-sm">
            日程調整の一覧
          </TabsContent>
        </Tabs>

        <Table className="max-w-md">
          <TableHeader>
            <TableRow>
              <TableHead>参加者</TableHead>
              <TableHead>状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>alice@example.social</TableCell>
              <TableCell>参加</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>bob@example.social</TableCell>
              <TableCell>未定</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button>ホバーしてみる</Button>
          </TooltipTrigger>
          <TooltipContent>ツールチップの中身</TooltipContent>
        </Tooltip>
      </Section>

      <Section title="ダイアログ / トースト">
        <Button
          onClick={async () => {
            const ok = await confirm({
              title: 'この操作を実行しますか？',
              description: '通常の確認ダイアログです。',
            })
            toast(ok ? '実行しました' : 'キャンセルしました')
          }}
        >
          confirm（通常）
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: 'イベントを削除しますか？',
              description: 'この操作は取り消せません。参加者の情報もすべて削除されます。',
              destructive: true,
            })
            if (ok) toast.error('削除しました')
          }}
        >
          confirm（破壊的）
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            const ok = await confirm({
              title: 'アカウントを削除しますか？',
              description: '取り消せません。すべてのデータが失われます。',
              destructive: true,
              confirmationPhrase: 'delete',
            })
            if (ok) toast.error('アカウントを削除しました')
          }}
        >
          confirm（入力確認あり）
        </Button>
        <Separator orientation="vertical" className="h-8" />
        <Button variant="ghost" onClick={() => toast.success('保存しました')}>
          toast.success
        </Button>
        <Button variant="ghost" onClick={() => toast.error('保存に失敗しました')}>
          toast.error
        </Button>
        <Button variant="ghost" onClick={() => toast.warning('期限が近づいています')}>
          toast.warning
        </Button>
        <Button variant="ghost" onClick={() => toast.info('3人が参加しました')}>
          toast.info
        </Button>
      </Section>

      <Section title="Markdown（prose）">
        <div className="markdown-content prose max-w-none">
          <h1>見出し1</h1>
          <p>
            本文。<strong>強調</strong>と<em>斜体</em>と<code>inline code</code>、
            <a href="#">リンク</a>を含む。
          </p>
          <h2>見出し2</h2>
          <ul>
            <li>箇条書き</li>
            <li>箇条書き</li>
          </ul>
          <blockquote>引用文</blockquote>
          <pre>
            <code>const a = 1</code>
          </pre>
          <p>
            <span className="text-color-red">赤</span> <span className="text-color-blue">青</span>{' '}
            <span className="text-color-green">緑</span>{' '}
            <span className="text-color-orange">橙</span>{' '}
            <span className="text-color-purple">紫</span>{' '}
            <span className="text-color-pink">桃</span>{' '}
            <span className="text-color-gray">灰</span>
          </p>
          <details>
            <summary>折りたたみ</summary>
            <p>:::details 記法で生成される部分。</p>
          </details>
        </div>
      </Section>
    </div>
  )
}
