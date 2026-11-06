/** 同页跨场景进场代数只驻留内存；旧 join 不能越过新场景意图。 */
let pageId: string | undefined
let sequence = 0
const uuid = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128
  const h = Array.from(b, n => n.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export function roomEntryFetch(fetcher: typeof fetch = (...args) => globalThis.fetch(...args)): typeof fetch {
  pageId ??= uuid()
  const page = pageId
  let generation = ++sequence
  let client: string | undefined
  return (url, init) => {
    if (String(url).endsWith('/join') && typeof init?.body === 'string') {
      const body = JSON.parse(init.body) as Record<string, unknown>
      if (typeof body.client_id === 'string') {
        if (client !== undefined && client !== body.client_id) generation = ++sequence // 显式重新加入
        client = body.client_id
      }
      return fetcher(url, { ...init, body: JSON.stringify({ ...body, page_id: page, entry_generation: generation }) })
    }
    return fetcher(url, init)
  }
}
