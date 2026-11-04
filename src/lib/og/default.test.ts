import { afterEach, describe, expect, it, vi } from 'vitest'

import { defaultOgImages, twitterCard } from './default'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('defaultOgImages', () => {
  it('公開URLがあれば、共通の画像を相対URLで載せる（metadataBase で絶対URLになる）', () => {
    vi.stubEnv('NEXTAUTH_URL', 'https://hosteka.test/')
    expect(defaultOgImages()).toEqual([{ url: '/og/default', width: 1200, height: 630, alt: 'Hosteka' }])
  })

  /*
    公開URLを渡さずにビルドすると、静的なページに localhost の URL が焼き付く。
    それを配るより、画像が無いほうがよい。
  */
  it('公開URLが無ければ載せない', () => {
    vi.stubEnv('NEXTAUTH_URL', '')
    expect(defaultOgImages()).toEqual([])
  })
})

describe('twitterCard', () => {
  it('画像があれば大きく、無ければ小さく', () => {
    expect(twitterCard([{}])).toBe('summary_large_image')
    expect(twitterCard([])).toBe('summary')
  })
})
