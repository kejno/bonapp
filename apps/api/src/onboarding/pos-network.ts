import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';

export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const octets = address.split('.').map(Number);
  const [a, b, c] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99) || (b === 168 && c === 0))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function selectPublicIpv4(addresses: Array<{ address: string; family: number }>): string {
  const ipv4Addresses = addresses.filter((entry) => entry.family === 4);
  if (ipv4Addresses.some((entry) => !isPublicIpv4(entry.address))) {
    throw new Error('Хост POS разрешается в недопустимый IP-адрес');
  }
  const destination = ipv4Addresses[0];
  if (!destination) throw new Error('Хост POS не разрешается в публичный IPv4-адрес');
  return destination.address;
}

export function isAllowedPosHost(host: string, configuredHosts: string): boolean {
  const allowed = configuredHosts.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(host.toLowerCase());
}

export async function requestPosMenu(url: URL, apiKey: string, allowedHosts: string, timeoutMs: number): Promise<unknown> {
  if (!isAllowedPosHost(url.hostname, allowedHosts)) throw new Error('Хост POS отсутствует в списке разрешённых POS_ALLOWED_HOSTS');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Недопустимый адрес POS');

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  const destinationAddress = selectPublicIpv4(addresses);
  const destination = { address: destinationAddress };
  const client = url.protocol === 'https:' ? https : http;
  const target = new URL('/api/v1/menu', url);

  return new Promise((resolve, reject) => {
    const request = client.request(target, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: timeoutMs,
      lookup: (_hostname, _options, callback) => callback(null, destination.address, 4),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          reject(new Error('Перенаправления POS не поддерживаются'));
          return;
        }
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`POS вернул HTTP ${response.statusCode ?? 'неизвестный статус'}`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
        catch { reject(new Error('POS вернул некорректный ответ')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Превышено время ожидания POS')));
    request.on('error', reject);
    request.end();
  });
}
