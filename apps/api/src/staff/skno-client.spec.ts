import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { TitanSknoClient } from './skno-client';

describe('TitanSknoClient', () => {
  let server: Server;
  let host: string;
  let client: TitanSknoClient;
  let fiscalDays: { id: number }[];
  let state: { serial: string; currZ: number; err?: unknown };
  let unavailable: boolean;
  let dropReportResponse: boolean;
  let reportCalls: number;
  let reportError: boolean;

  beforeEach(async () => {
    fiscalDays = [{ id: 10 }];
    state = { serial: 'SERIAL-1', currZ: 10 };
    unavailable = false;
    dropReportResponse = false;
    reportCalls = 0;
    reportError = false;
    server = createServer((request, response) => {
      if (unavailable) { response.destroy(); return; }
      if (!request.headers.authorization) {
        response.writeHead(401, { 'WWW-Authenticate': 'Digest realm="HTROM", nonce="test-nonce", qop="auth", algorithm=MD5' }).end();
        return;
      }
      if (!request.url?.startsWith('/cgi/')) { response.writeHead(404).end(); return; }
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
});
