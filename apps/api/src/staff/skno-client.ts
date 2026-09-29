import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export const SKNO_CLIENT = Symbol('SKNO_CLIENT');

export interface SknoCredentials {
  host: string;
  username: string;
  password: string;
  cashRegisterSerial: string;
}

export interface SknoShiftClient {
  open(credentials: SknoCredentials): Promise<{ zReportNumber: number }>;
  close(credentials: SknoCredentials): Promise<{ zReportNumber: number }>;
  reconcileClose(credentials: SknoCredentials, startZ: number): Promise<{ zReportNumber: number } | null>;
}

type CashState = { serial?: string; currZ?: number; err?: unknown };
type FiscalDay = { id?: number; [key: string]: unknown };
type CashReply = { err?: unknown } & Record<string, unknown>;

@Injectable()
export class TitanSknoClient implements SknoShiftClient {
  async open(credentials: SknoCredentials): Promise<{ zReportNumber: number }> {
    const state = await this.read<CashState>(credentials, '/cgi/state');
    this.assertNoErrors(state.err);
    if (state.serial !== credentials.cashRegisterSerial) {
      throw new BadGatewayException('Серийный номер кассы СКНО не совпадает с настройками');
    }
    if (!Number.isInteger(state.currZ)) {
      throw new BadGatewayException('Касса СКНО не вернула номер текущего Z-отчёта');
    }
    return { zReportNumber: state.currZ! };
  }

  async close(credentials: SknoCredentials): Promise<{ zReportNumber: number }> {
    const before = await this.readSnapshot(credentials);
    let result: CashReply;
    try {
      result = await this.request<CashReply>(credentials, '/cgi/proc/printreport?0');
    } catch {
      // A lost response does not mean the fiscal operation failed. Reconcile once;
      // never issue the non-idempotent Z-report command again automatically.
      const reconciled = await this.reconcile(credentials, before).catch(() => null);
      if (reconciled !== null) return { zReportNumber: reconciled };
      throw new ServiceUnavailableException('Не удалось подтвердить результат Z-отчёта; требуется сверка с кассой');
    }
    this.assertNoErrors(result.err);
    const after = await this.reconcile(credentials, before).catch(() => null);
    if (after === null) {
      throw new ServiceUnavailableException('Касса приняла Z-отчёт, но номер отчёта не удалось подтвердить');
    }
    return { zReportNumber: after };
  }

  async reconcileClose(credentials: SknoCredentials, startZ: number): Promise<{ zReportNumber: number } | null> {
    const [state, rows] = await Promise.all([
      this.read<CashState>(credentials, '/cgi/state'),
      this.read<FiscalDay[]>(credentials, '/cgi/tbl/FDay'),
    ]);
    this.assertNoErrors(state.err);
    if (state.serial !== credentials.cashRegisterSerial || !Array.isArray(rows)) return null;
    const report = rows
      .filter((row) => Number.isInteger(row.id) && row.id! > startZ)
      .sort((a, b) => b.id! - a.id!)[0];
    const zReportNumber = report?.id ?? (state.currZ !== undefined && state.currZ > startZ ? state.currZ : null);
    return zReportNumber === null ? null : { zReportNumber };
  }

  private async readSnapshot(credentials: SknoCredentials): Promise<{ currZ: number; ids: Set<number> }> {
    const state = await this.read<CashState>(credentials, '/cgi/state');
    this.assertNoErrors(state.err);
    if (state.serial !== credentials.cashRegisterSerial) {
      throw new BadGatewayException('Серийный номер кассы СКНО не совпадает с настройками');
    }
    const rows = await this.read<FiscalDay[]>(credentials, '/cgi/tbl/FDay');
    if (!Array.isArray(rows) || !Number.isInteger(state.currZ)) {
      throw new BadGatewayException('Касса СКНО вернула некорректное состояние фискальной памяти');
    }
    return { currZ: state.currZ!, ids: new Set(rows.map((row) => row.id).filter((id): id is number => Number.isInteger(id))) };
  }

  private async reconcile(credentials: SknoCredentials, before: { currZ: number; ids: Set<number> }): Promise<number | null> {
    const [state, rows] = await Promise.all([
      this.read<CashState>(credentials, '/cgi/state'),
      this.read<FiscalDay[]>(credentials, '/cgi/tbl/FDay'),
    ]);
    this.assertNoErrors(state.err);
    if (state.serial !== credentials.cashRegisterSerial || !Array.isArray(rows)) return null;
    const newDays = rows.filter((row) => Number.isInteger(row.id) && !before.ids.has(row.id!));
    const latestNewDay = newDays.sort((a, b) => b.id! - a.id!)[0];
    if (latestNewDay) return latestNewDay.id!;
    if (state.currZ !== undefined && state.currZ > before.currZ) return state.currZ;
    return null;
  }

  private async read<T>(credentials: SknoCredentials, path: string): Promise<T> {
    const value = await this.request<CashReply>(credentials, path);
    this.assertNoErrors(value?.err);
    return value as T;
  }

  private async request<T = unknown>(credentials: SknoCredentials, path: string): Promise<T> {
    const url = new URL(path, credentials.host);
    try {
      let response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status === 401) {
        const challenge = response.headers.get('www-authenticate');
        if (!challenge?.startsWith('Digest ')) throw new Error('Unsupported SKNO authentication challenge');
        const authorization = this.digestAuthorization(challenge, credentials, `${url.pathname}${url.search}`);
        response = await fetch(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000) });
      }
      if (!response.ok) throw new Error(`SKNO returned HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new ServiceUnavailableException('Касса СКНО недоступна или вернула некорректный ответ');
    }
  }

  private digestAuthorization(challenge: string, credentials: SknoCredentials, uri: string): string {
    const fields: Record<string, string> = {};
    for (const match of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) fields[match[1]] = match[2] ?? match[3];
    if (!fields.nonce || !fields.realm) throw new Error('Invalid digest challenge');
    const qop = fields.qop?.split(',').map((value) => value.trim()).includes('auth') ? 'auth' : undefined;
    const cnonce = randomBytes(12).toString('hex');
    const nc = '00000001';
    const hash = (value: string) => createHash('md5').update(value).digest('hex');
    const ha1 = hash(`${credentials.username}:${fields.realm}:${credentials.password}`);
    const ha2 = hash(`GET:${uri}`);
    const response = qop
      ? hash(`${ha1}:${fields.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : hash(`${ha1}:${fields.nonce}:${ha2}`);
    const params = [`username="${credentials.username}"`, `realm="${fields.realm}"`, `nonce="${fields.nonce}"`, `uri="${uri}"`, `response="${response}"`, 'algorithm=MD5'];
    if (fields.opaque) params.push(`opaque="${fields.opaque}"`);
    if (qop) params.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    return `Digest ${params.join(', ')}`;
  }

  private assertNoErrors(err: unknown): void {
    if (err !== undefined && err !== null && err !== false && !(Array.isArray(err) && err.length === 0)) {
      throw new BadGatewayException(`Ошибка кассы СКНО: ${JSON.stringify(err)}`);
    }
  }
}
