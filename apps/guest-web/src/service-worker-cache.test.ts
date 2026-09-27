import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

describe('guest service worker activation', () => {
  it('preserves Cache Storage entries owned by other apps on the origin', async () => {
    type ActivationEvent = { waitUntil: (promise: Promise<unknown>) => void }
    const listeners = new Map<string, (event: ActivationEvent) => void>()
    const deleted: string[] = []
    const source = await readFile(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    runInNewContext(source, {
      self: {
        addEventListener: (name: string, listener: (event: ActivationEvent) => void) => listeners.set(name, listener),
        clients: { claim: () => Promise.resolve() },
        skipWaiting: () => undefined,
      },
      caches: {
        keys: async () => ['bonapp-guest-shell-v1', 'bonapp-guest-shell-v0', 'other-app-cache'],
        delete: async (key: string) => { deleted.push(key); return true },
      },
    })

    let activation: Promise<unknown> | undefined
    listeners.get('activate')?.({ waitUntil: (promise) => { activation = promise } })
    await activation

    expect(deleted).toEqual(['bonapp-guest-shell-v0'])
  })
})
