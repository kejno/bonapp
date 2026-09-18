import { Injectable, Logger } from '@nestjs/common';
import {
  FiscalizePaymentParams,
  ISknoApiService,
  ZReport,
} from './skno-api.interface';

@Injectable()
export class SknoApiService implements ISknoApiService {
  private readonly logger = new Logger(SknoApiService.name);

  async fiscalizePayment(params: FiscalizePaymentParams): Promise<string> {
    const { sknoApiUrl } = await this.getApiUrl(params.sknoSerial);
    const response = await fetch(`${sknoApiUrl}/fiscal/receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serial: params.sknoSerial,
        unp: params.sknoUnp,
        orderId: params.orderId,
        amount: params.amount,
      }),
    });
    if (!response.ok) {
      throw new Error(`SKNO fiscalize failed: ${response.status} ${await response.text()}`);
    }
    const data = (await response.json()) as { receiptNumber: string };
    return data.receiptNumber;
  }

  async openShift(sknoSerial: string, sknoUnp: string): Promise<void> {
    const { sknoApiUrl } = await this.getApiUrl(sknoSerial);
    const response = await fetch(`${sknoApiUrl}/shift/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: sknoSerial, unp: sknoUnp }),
    });
    if (!response.ok) {
      throw new Error(`SKNO open shift failed: ${response.status} ${await response.text()}`);
    }
  }

  async closeShift(sknoSerial: string, sknoUnp: string): Promise<ZReport> {
    const { sknoApiUrl } = await this.getApiUrl(sknoSerial);
    const response = await fetch(`${sknoApiUrl}/shift/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: sknoSerial, unp: sknoUnp }),
    });
    if (!response.ok) {
      throw new Error(`SKNO close shift failed: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<ZReport>;
  }

  // In a real impl the URL would come from TenantSettings via PrismaService
  // Here it is a placeholder so SknoApiService stays independent of Prisma
  private async getApiUrl(_sknoSerial: string): Promise<{ sknoApiUrl: string }> {
    const sknoApiUrl = process.env.SKNO_API_URL ?? 'http://localhost:9090';
    return { sknoApiUrl };
  }
}
