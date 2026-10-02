import { build } from 'vite'
import { describe, expect, it } from 'vitest'

describe('production bundle budget', () => {
  it('keeps every JavaScript chunk within 150 KB uncompressed', async () => {
    const output = await build({
      configFile: './vite.config.ts',
      logLevel: 'silent',
      mode: 'production',
      define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'import.meta.env.DEV': 'false',
        'import.meta.env.PROD': 'true',
        'import.meta.env.MODE': JSON.stringify('production'),
      },
    })
    const results = (Array.isArray(output) ? output : [output]).filter((result) => 'output' in result)
    const chunks = results
      .flatMap((result) => result.output)
      .filter((asset) => asset.type === 'chunk')

    expect(chunks.length).toBeGreaterThan(0)
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk.code), `${chunk.fileName} exceeds 150 KB`).toBeLessThanOrEqual(150 * 1024)
      expect(chunk.code).not.toMatch(/dev-table-[123]/)
    }
  })
})
