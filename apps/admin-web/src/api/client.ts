const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path))
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${path}`)
  }
  return response.json() as Promise<T>
}
