import { BadGatewayException, Injectable } from '@nestjs/common';

export type PosType = 'iiko_cloud' | 'r_keeper';

export interface PosCheckInput {
  posType: PosType;
  apiKey: string;
  url?: string;
}

export interface PosCheckResult {
  pingMs: number;
  itemsCount: number;
}

@Injectable()
export class PosClientService {
  async checkConnection(input: PosCheckInput): Promise<PosCheckResult> {
    const startedAt = Date.now();
    const endpoint = input.url ?? this.getDefaultUrl(input.posType);
    let response: Response;

    try {
      response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${input.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException('Не удалось подключиться к POS-системе');
    }

    if (!response.ok) {
      throw new BadGatewayException('POS-система отклонила проверку подключения');
    }

    const payload = (await response.json()) as { itemsCount?: unknown; products?: unknown[] };
    return {
      pingMs: Date.now() - startedAt,
      itemsCount: typeof payload.itemsCount === 'number' ? payload.itemsCount : payload.products?.length ?? 0,
    };
  }

  private getDefaultUrl(posType: PosType): string {
    if (posType === 'iiko_cloud') {
      return 'https://api-ru.iiko.services/api/1/nomenclature';
    }

    throw new BadGatewayException('Для r_keeper укажите URL API');
  }
}
