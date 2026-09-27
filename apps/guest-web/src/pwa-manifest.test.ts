import { describe, expect, it } from 'vitest'
import { createGuestManifest } from './pwa-manifest'

describe('createGuestManifest', () => {
  it('uses the active restaurant brand color in the install manifest', () => {
    expect(JSON.parse(createGuestManifest('#245678'))).toMatchObject({
      theme_color: '#245678',
      display: 'standalone',
      icons: [{ src: '/pwa-icon.svg' }],
    })
  })
})
