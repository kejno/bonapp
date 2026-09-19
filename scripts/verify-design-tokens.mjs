import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const themePath = join(root, 'packages/design-tokens/theme.css')
const requiredTokens = [
  '--color-status-pending',
  '--color-surface-card',
  '--radius-xl',
  '--spacing-space-xl',
]

if (!existsSync(themePath)) {
  throw new Error('Shared design-token theme is missing')
}

const theme = readFileSync(themePath, 'utf8')

if (!theme.includes('@theme static')) {
  throw new Error('Design tokens must use @theme static')
}

for (const app of ['admin-web', 'guest-web']) {
  const distDir = join(root, 'apps', app, 'dist', 'assets')
  const cssFilename = readdirSync(distDir).find((filename) => filename.endsWith('.css'))

  if (!cssFilename) {
    throw new Error(`${app} production CSS was not generated`)
  }

  const cssFile = readFileSync(join(distDir, cssFilename), 'utf8')

  for (const token of requiredTokens) {
    if (!cssFile.includes(token)) {
      throw new Error(`${app} production CSS is missing ${token}`)
    }
  }
}
