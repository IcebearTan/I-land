export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** 同源 fetch 封装：自动带 cookie、JSON 序列化、错误抛 ApiError */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { credentials: 'include', ...init, headers })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') msg = data.detail
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new ApiError(msg, res.status)
  }
  const ct = res.headers.get('content-type') ?? ''
  return (ct.includes('json') ? await res.json() : ((await res.text()) as unknown)) as T
}
