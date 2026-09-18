import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { TableTentPdfRenderer } from './table-tent-pdf.service';

const BONAPP_LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64"><text x="0" y="48" font-family="Arial" font-size="44" font-weight="bold" fill="#e0533c">bonapp</text></svg>',
)}`;

@Injectable()
export class PuppeteerTableTentPdfRenderer implements TableTentPdfRenderer {
  async render(input: {
    tenantName: string;
    logoUrl: string | null;
    tables: Array<{ number: string; qrUrl: string }>;
  }): Promise<Buffer> {
    const cards = await Promise.all(
      input.tables.map(async (table) => ({
        ...table,
        qrDataUrl: await QRCode.toDataURL(table.qrUrl, {
          margin: 1,
          width: 260,
        }),
      })),
    );
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        this.html(input.tenantName, input.logoUrl ?? BONAPP_LOGO, cards),
        {
          waitUntil: 'load',
        },
      );
      return Buffer.from(
        await page.pdf({ format: 'A4', printBackground: true }),
      );
    } finally {
      await browser.close();
    }
  }

  private html(
    tenantName: string,
    logoUrl: string,
    cards: Array<{ number: string; qrDataUrl: string }>,
  ): string {
    const escape = (value: string) =>
      value.replace(
        /[&<>"']/g,
        (char) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[char] ?? char,
      );
    const pages = Array.from(
      { length: Math.ceil(cards.length / 4) },
      (_, pageIndex) => cards.slice(pageIndex * 4, pageIndex * 4 + 4),
    );
    const card = (table: { number: string; qrDataUrl: string }) => `
      <section class="tent">
        <img class="logo" src="${logoUrl}" alt="${escape(tenantName)}" />
        <h1>${escape(tenantName)}</h1>
        <div class="table">Стол ${escape(table.number)}</div>
        <img class="qr" src="${table.qrDataUrl}" alt="QR-код стола ${escape(table.number)}" />
        <div class="fold">СГИБ</div>
      </section>`;
    const page = (
      tables: Array<{ number: string; qrDataUrl: string }>,
      back: boolean,
    ) => `
      <article class="sheet ${back ? 'back' : ''}">${tables.map(card).join('')}</article>`;

    return `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><style>
      @page { size: A4; margin: 10mm; } * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, sans-serif; color: #292524; }
      .instruction { font-size: 9pt; margin: 0 0 5mm; }
      .sheet { min-height: 267mm; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; page-break-after: always; }
      .tent { border: 1px dashed #777; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; padding: 8mm; text-align: center; }
      .tent::before { content: ''; position: absolute; left: 6mm; right: 6mm; top: 50%; border-top: 1px dashed #aaa; }
      .logo { max-width: 45mm; max-height: 16mm; object-fit: contain; } h1 { font-size: 14pt; margin: 4mm 0; } .table { font-size: 25pt; font-weight: bold; } .qr { width: 36mm; height: 36mm; margin-top: 3mm; } .fold { position: absolute; top: calc(50% - 3mm); font-size: 7pt; color: #777; background: white; padding: 0 2mm; }
    </style></head><body><p class="instruction">Печать: с двух сторон, переворот по короткой стороне. Разрежьте по пунктиру и согните по линии «СГИБ».</p>${pages.map((tables) => `${page(tables, false)}${page([...tables].reverse(), true)}`).join('')}</body></html>`;
  }
}
