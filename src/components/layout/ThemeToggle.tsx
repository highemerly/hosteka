'use client'

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/hooks/useTheme'
import type { ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: 'light', label: 'ライト', Icon: SunIcon },
  { value: 'dark', label: 'ダーク', Icon: MoonIcon },
  { value: 'system', label: 'システム設定に従う', Icon: MonitorIcon },
]

export default function ThemeToggle() {
  const { preference, resolved, setPreference, mounted } = useTheme()

  // マウント前は localStorage を読めないため、どのアイコンを出すかを確定できない。
  // 推測して描画するとハイドレーション不一致になるので、場所だけ確保しておく。
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-hidden tabIndex={-1} className="pointer-events-none">
        <SunIcon className="size-4 opacity-0" />
      </Button>
    )
  }

  const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2]
  const TriggerIcon = resolved === 'dark' ? MoonIcon : SunIcon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`テーマ: ${current.label}`}>
          <TriggerIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setPreference(value)}
            aria-current={preference === value}
            className={preference === value ? 'bg-accent text-accent-foreground' : undefined}
          >
            <Icon className="size-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
