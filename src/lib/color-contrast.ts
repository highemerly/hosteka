/**
 * oklch のトークンからコントラスト比を出す。
 *
 * デザイントークンは目で決めると必ず甘くなる。実際、補助テキストは
 * 白地では 4.73:1 あったのに、タグの淡い面の上では 4.34:1 で
 * 基準を割っていた（面が変わることを見落としていた）。
 * 数値で確かめられるようにしておく。
 */

export type Oklch = { l: number; c: number; h: number }

/** `oklch(0.5 0.13 155)` / `oklch(1 0 0)` を読む。alpha 付きは非対応 */
export function parseOklch(value: string): Oklch | null {
  const match = value.match(
    /oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)\s*\)/
  )
  if (!match) return null
  const l = match[1].endsWith('%') ? Number(match[1].slice(0, -1)) / 100 : Number(match[1])
  return { l, c: Number(match[2]), h: Number(match[3]) }
}

/** oklch → sRGB（0..1、ガンマ適用済み）。範囲外はクリップする */
export function oklchToSrgb({ l: L, c: C, h: H }: Oklch): [number, number, number] {
  const hr = (H * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)

  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]

  return linear.map((u) => {
    const v = Math.min(Math.max(u, 0), 1)
    return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  }) as [number, number, number]
}

/** WCAG の相対輝度 */
export function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG のコントラスト比（1〜21）。順序は問わない */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(oklchToSrgb(a))
  const lb = relativeLuminance(oklchToSrgb(b))
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
