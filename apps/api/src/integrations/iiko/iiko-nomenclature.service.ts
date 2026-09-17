import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IikoNomenclatureResponse } from './iiko.types';

@Injectable()
export class IikoNomenclatureService {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('IIKO_API_BASE_URL', 'https://api-ru.iiko.services');
  }

  async fetchNomenclature(conceptId: string, token: string): Promise<IikoNomenclatureResponse> {
    const url = `${this.baseUrl}/api/0/nomenclature/${conceptId}?access_token=${token}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`iiko nomenclature fetch failed with status ${response.status}`);
    }

    return (await response.json()) as IikoNomenclatureResponse;
  }
}
