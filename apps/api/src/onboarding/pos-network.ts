import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as http from 'node:http';
import * as https from 'node:https';

export class PosOrderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PosOrderRejectedError';
  }
}

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
  return requestPos(url, apiKey, allowedHosts, timeoutMs, 'GET', '/api/v1/menu');
}

export async function requestPosOrder(url: URL, apiKey: string, allowedHosts: string, timeoutMs: number, payload: unknown, path = '/api/v1/orders', idField = 'id'): Promise<string> {
  const response = await requestPos(url, apiKey, allowedHosts, timeoutMs, 'POST', path, payload);
  return extractPosOrderId(response, idField);
}

export interface IikoCredentials { apiKey: string; appId: string; clientSecret: string }

export type PosJsonRequester = (
  url: URL,
  allowedHosts: string,
  timeoutMs: number,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  accessToken?: string,
) => Promise<unknown>;

export async function requestIikoAccessToken(
  url: URL,
  credentials: IikoCredentials,
  allowedHosts: string,
  timeoutMs: number,
  requestJson: PosJsonRequester = requestPosJson,
): Promise<string> {
  const tokenResponse = await requestJson(url, allowedHosts, timeoutMs, 'POST', '/api/v2/access_token', {
    apiKey: credentials.apiKey,
    appId: credentials.appId,
    clientSecret: credentials.clientSecret,
  });
  const token = tokenResponse && typeof tokenResponse === 'object'
    ? (tokenResponse as { token?: unknown }).token
    : undefined;
  if (typeof token !== 'string' || !token) throw new Error('iiko не вернул маркер доступа');
  return token;
}

export async function requestIikoOrder(
  url: URL,
  credentials: IikoCredentials,
  allowedHosts: string,
  timeoutMs: number,
  payload: unknown,
  requestJson: PosJsonRequester = requestPosJson,
): Promise<string> {
  let token: string;
  try {
    token = await requestIikoAccessToken(url, credentials, allowedHosts, timeoutMs, requestJson);
  } catch (error) {
    // The order endpoint has not been called yet, so retrying cannot duplicate an order.
    throw new PosOrderRejectedError(error instanceof Error ? error.message : 'Не удалось получить маркер доступа iiko');
  }
  const response = await requestJson(url, allowedHosts, timeoutMs, 'POST', '/api/1/order/create', payload, token);
  return extractPosOrderId(response, 'orderInfo.id');
}

function extractPosOrderId(response: unknown, idField: string): string {
  if (!response || typeof response !== 'object') throw new Error('POS вернул некорректный идентификатор заказа');
  const id = idField.split('.').reduce<unknown>((value, key) =>
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, response);
  if (typeof id !== 'string' || !id) throw new Error('POS вернул некорректный идентификатор заказа');
  return id;
}

async function requestPos(
  url: URL,
  apiKey: string,
  allowedHosts: string,
  timeoutMs: number,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
): Promise<unknown> {
  return requestPosJson(url, allowedHosts, timeoutMs, method, path, payload, apiKey);
}

async function requestPosJson(
  url: URL,
  allowedHosts: string,
  timeoutMs: number,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  accessToken?: string,
): Promise<unknown> {
  if (!isAllowedPosHost(url.hostname, allowedHosts)) throw new Error('Хост POS отсутствует в списке разрешённых POS_ALLOWED_HOSTS');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Недопустимый адрес POS');

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  const destinationAddress = selectPublicIpv4(addresses);
  const destination = { address: destinationAddress };
  const client = url.protocol === 'https:' ? https : http;
  const target = new URL(path, url);
  const body = payload === undefined ? undefined : JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = client.request(target, {
      method,
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
      },
      timeout: timeoutMs,
      lookup: (_hostname, _options, callback) => callback(null, destination.address, 4),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => {
        const statusCode = response.statusCode;
        if (statusCode && statusCode >= 300 && statusCode < 400) {
          reject(new Error('Перенаправления POS не поддерживаются'));
          return;
        }
        if (!statusCode || statusCode < 200 || statusCode >= 300) {
          const message = `POS вернул HTTP ${statusCode ?? 'неизвестный статус'}`;
          reject(statusCode !== undefined && statusCode >= 400 && statusCode < 500
            ? new PosOrderRejectedError(message)
            : new Error(message));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); }
        catch { reject(new Error('POS вернул некорректный ответ')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Превышено время ожидания POS')));
    request.on('error', reject);
    request.end(body);
  });
}
