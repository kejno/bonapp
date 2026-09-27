export function createGuestManifest(brandColor: string): string {
  return JSON.stringify({
    name: 'Bonapp — гостевой клиент',
    short_name: 'Bonapp',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: brandColor,
    background_color: '#fff8f5',
    icons: [{ src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
  })
}
