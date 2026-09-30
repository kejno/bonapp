import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export const SKNO_CLIENT = Symbol('SKNO_CLIENT');
export const SKNO_FISCAL_CLIENT = Symbol('SKNO_FISCAL_CLIENT');

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

export interface SknoFiscalClient {
  issueReceipt(credentials: SknoCredentials & { unp?: string }, input: {
    paymentId: string;
    amount: number;
    items: Array<{ name: string; quantity: number; price: number }>;
  }): Promise<string>;
}

type CashState = { serial?: string; currZ?: number; chkId?: number; err?: unknown };
type FiscalDay = { id?: number; [key: string]: unknown };
type CheckTapeRow = { id?: number; no?: number | string; [key: string]: unknown };
type CashReply = { err?: unknown } & Record<string, unknown>;

@Injectable()
export class TitanSknoClient implements SknoShiftClient, SknoFiscalClient {
  async issueReceipt(credentials: SknoCredentials & { unp?: string }, input: {
    paymentId: string;
    amount: number;
    items: Array<{ name: string; quantity: number; price: number }>;
  }): Promise<string> {
    const marker = `BonApp payment:${input.paymentId}`;
    const state = await this.read<CashState>(credentials, '/cgi/state');
    if (state.serial !== credentials.cashRegisterSerial || !Number.isInteger(state.chkId)) {
      throw new BadGatewayException('Касса СКНО вернула некорректное состояние чековой ленты');
    }
    const existing = this.findReceipt(await this.read<CheckTapeRow[]>(credentials, '/cgi/chk'), marker);
    if (existing) return existing;
    const lines = [
      { C: { cm: `${marker}${credentials.unp ? `; УНП ${credentials.unp}` : ''}` } },
      ...input.items.map((item) => ({ S: { name: item.name, qty: item.quantity, price: item.price } })),
      { P: { sum: input.amount } },
    ];
    let response: CashReply & { no?: string | number; id?: string | number; receiptNumber?: string | number; fiscal_receipt_number?: string | number };
    try {
      response = await this.request(credentials, '/cgi/chk', 'POST', JSON.stringify({ F: lines }));
      this.assertNoErrors(response.err);
    } catch (error) {
      const reconciled = await this.findReceiptByMarker(credentials, marker).catch(() => undefined);
      if (reconciled) return reconciled;
      throw error;
    }
    const number = response.fiscal_receipt_number ?? response.receiptNumber ?? response.no;
    if (typeof number === 'string' || typeof number === 'number') return String(number);
    const reconciled = await this.findReceiptByMarker(credentials, marker);
    if (reconciled) return reconciled;
    throw new ServiceUnavailableException('Касса СКНО не вернула номер фискального чека');
  }

  private async findReceiptByMarker(credentials: SknoCredentials, marker: string): Promise<string | undefined> {
    return this.findReceipt(await this.read<CheckTapeRow[]>(credentials, '/cgi/chk'), marker);
  }

  private findReceipt(rows: CheckTapeRow[], marker: string): string | undefined {
    if (!Array.isArray(rows)) return undefined;
    const row = rows.find((entry) => JSON.stringify(entry).includes(marker));
    const number = row?.no ?? row?.id;
    return typeof number === 'number' || typeof number === 'string' ? String(number) : undefined;
  }

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
    const newDays = rows.filter((row) => Number.isInteger(row.id) && row.id! > startZ);
    if (newDays.length > 1) return null;
    const reportNumber = newDays[0]?.id;
    if (reportNumber !== undefined) {
      return state.currZ === reportNumber ? { zReportNumber: reportNumber } : null;
    }
    // State alone is sufficient only for one unambiguous sequential increment.
    return state.currZ === startZ + 1 ? { zReportNumber: state.currZ } : null;
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
    if (newDays.length > 1) return null;
    if (newDays.length === 1) {
      const reportNumber = newDays[0].id!;
      return state.currZ === reportNumber ? reportNumber : null;
    }
    if (state.currZ === before.currZ + 1) return state.currZ;
    return null;
  }

  private async read<T>(credentials: SknoCredentials, path: string): Promise<T> {
    const value = await this.request<CashReply>(credentials, path);
    this.assertNoErrors(value?.err);
    return value as T;
  }

  private async request<T = unknown>(credentials: SknoCredentials, path: string, method = 'GET', body?: string): Promise<T> {
    const url = new URL(path, credentials.host);
    try {
      const init: RequestInit = { method, signal: AbortSignal.timeout(5000), ...(body === undefined ? {} : { body, headers: { 'Content-Type': 'application/json; charset=utf-8' } }) };
      let response = await fetch(url, init);
      if (response.status === 401) {
        const challenge = response.headers.get('www-authenticate');
        if (!challenge?.startsWith('Digest ')) throw new Error('Unsupported SKNO authentication challenge');
        const authorization = this.digestAuthorization(challenge, credentials, `${url.pathname}${url.search}`, method);
        response = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: authorization } });
      }
      if (!response.ok) throw new Error(`SKNO returned HTTP ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new ServiceUnavailableException('Касса СКНО недоступна или вернула некорректный ответ');
    }
  }

  private digestAuthorization(challenge: string, credentials: SknoCredentials, uri: string, method: string): string {
    const fields: Record<string, string> = {};
    for (const match of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) fields[match[1]] = match[2] ?? match[3];
    if (!fields.nonce || !fields.realm) throw new Error('Invalid digest challenge');
    const qop = fields.qop?.split(',').map((value) => value.trim()).includes('auth') ? 'auth' : undefined;
    const cnonce = randomBytes(12).toString('hex');
    const nc = '00000001';
    const hash = (value: string) => createHash('md5').update(value).digest('hex');
    const ha1 = hash(`${credentials.username}:${fields.realm}:${credentials.password}`);
    const ha2 = hash(`${method}:${uri}`);
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
