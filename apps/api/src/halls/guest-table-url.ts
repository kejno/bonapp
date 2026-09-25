export function createGuestTableUrl(menuBaseUrl: string, qrToken: string): string {
  const url = new URL(menuBaseUrl);
  url.searchParams.set('qr_token', qrToken);
  return url.toString();
}
