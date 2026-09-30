import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { TitanSknoClient } from './skno-client';

describe('TitanSknoClient', () => {
  let server: Server;
  let host: string;
  let client: TitanSknoClient;
  let fiscalDays: { id: number }[];
  let state: { serial: string; currZ: number; chkId: number; err?: unknown };
  let checkTape: Array<Record<string, unknown>>;
  let unavailable: boolean;
  let dropReportResponse: boolean;
  let reportCalls: number;
  let reportError: boolean;
  let receiptRequest: { method?: string; body: string } | undefined;

  beforeEach(async () => {
    fiscalDays = [{ id: 10 }];
    state = { serial: 'SERIAL-1', currZ: 10, chkId: 0 };
    checkTape = [];
    unavailable = false;
    dropReportResponse = false;
    reportCalls = 0;
    reportError = false;
    receiptRequest = undefined;
    server = createServer((request, response) => {
      if (unavailable) { response.destroy(); return; }
      if (!request.headers.authorization) {
        response.writeHead(401, { 'WWW-Authenticate': 'Digest realm="HTROM", nonce="test-nonce", qop="auth", algorithm=MD5' }).end();
        return;
      }
      if (!request.url?.startsWith('/cgi/')) { response.writeHead(404).end(); return; }
      if (request.url === '/cgi/chk') {
        if (request.method === 'GET') {
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(checkTape));
          return;
        }
        let body = '';
        request.setEncoding('utf8');
        request.on('data', (chunk: string) => { body += chunk; });
        request.on('end', () => {
          receiptRequest = { method: request.method, body };
          const receipt = JSON.parse(body) as { F: unknown[] };
          checkTape = [...checkTape, { id: 1, no: 17, F: receipt.F }];
          response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ err: [] }));
        });
        return;
      }
      if (request.url === '/cgi/proc/printreport?0') {
        reportCalls += 1;
        if (reportError) { response.end(JSON.stringify({ err: [{ e: 'x25' }] })); return; }
        fiscalDays = [...fiscalDays, { id: 11 }];
        state.currZ = 11;
        if (dropReportResponse) { response.destroy(); return; }
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(request.url === '/cgi/state' ? state : request.url === '/cgi/tbl/FDay' ? fiscalDays : { err: [] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    client = new TitanSknoClient();
  });

  afterEach(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const credentials = () => ({ host, username: 'service', password: 'secret', cashRegisterSerial: 'SERIAL-1' });

  it('uses Digest and confirms the Z-report from FDay after close', async () => {
    await expect(client.open(credentials())).resolves.toEqual({ zReportNumber: 10 });
    await expect(client.close(credentials())).resolves.toEqual({ zReportNumber: 11 });
  });

  it('posts a JSON fiscal receipt and returns its number', async () => {
    await expect(client.issueReceipt({ ...credentials(), unp: '123456789' }, {
      paymentId: 'payment-1', amount: 15, items: [{ name: 'Tea', quantity: 2, price: 7.5 }],
    })).resolves.toBe('17');
    expect(receiptRequest?.method).toBe('POST');
    expect(JSON.parse(receiptRequest!.body)).toEqual({ F: [
      { C: { cm: 'BonApp payment:payment-1; УНП 123456789' } },
      { S: { name: 'Tea', qty: 2, price: 7.5 } },
      { P: { sum: 15 } },
    ] });
  });

  it('rejects a cash register error and a serial number mismatch', async () => {
    state.err = [{ e: 'x25' }];
    await expect(client.open(credentials())).rejects.toThrow('Ошибка кассы СКНО');
    state.err = undefined;
    state.serial = 'OTHER';
    await expect(client.open(credentials())).rejects.toThrow('Серийный номер кассы');
  });

  it('returns a clear error when the cash register is unavailable', async () => {
    unavailable = true;
    await expect(client.open(credentials())).rejects.toThrow('Касса СКНО недоступна');
  });

  it('reconciles a lost response from FDay without repeating the Z-report', async () => {
    dropReportResponse = true;
    await expect(client.close(credentials())).resolves.toEqual({ zReportNumber: 11 });
    expect(reportCalls).toBe(1);
  });

  it('rejects a Z-report error response without accepting a changed fiscal memory', async () => {
    reportError = true;
    await expect(client.close(credentials())).rejects.toThrow('Ошибка кассы СКНО');
    expect(reportCalls).toBe(1);
  });

  it('leaves the result unconfirmed when the response is lost and state did not change', async () => {
    dropReportResponse = true;
    fiscalDays = [{ id: 10 }];
    // Simulate a network failure before the device records the report.
    server.removeAllListeners('request');
    server.on('request', (request, response) => {
      if (!request.headers.authorization) {
        response.writeHead(401, { 'WWW-Authenticate': 'Digest realm="HTROM", nonce="test-nonce", qop="auth", algorithm=MD5' }).end();
        return;
      }
      if (request.url === '/cgi/proc/printreport?0') { reportCalls += 1; response.destroy(); return; }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(request.url === '/cgi/state' ? state : fiscalDays));
    });
    await expect(client.close(credentials())).rejects.toThrow('Не удалось подтвердить результат Z-отчёта');
    expect(reportCalls).toBe(1);
  });

  it('recovers a previously started close from fiscal memory without issuing another Z-report', async () => {
    fiscalDays = [{ id: 10 }, { id: 11 }];
    state.currZ = 11;
    await expect(client.reconcileClose(credentials(), 10)).resolves.toEqual({ zReportNumber: 11 });
    expect(reportCalls).toBe(0);
  });

  it('does not guess which report belongs to a pending close when multiple reports appeared', async () => {
    fiscalDays = [{ id: 10 }, { id: 11 }, { id: 12 }];
    state.currZ = 12;
    await expect(client.reconcileClose(credentials(), 10)).resolves.toBeNull();
  });

  it('rejects a fiscal-memory entry that conflicts with the current state', async () => {
    fiscalDays = [{ id: 10 }, { id: 11 }];
    state.currZ = 12;
    await expect(client.reconcileClose(credentials(), 10)).resolves.toBeNull();
  });
});
