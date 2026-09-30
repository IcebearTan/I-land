export class ApiError extends Error {
  status: number
  /** 完整错误体（如记忆保存 409 时带服务器最新版本） */
  payload: unknown

  constructor(message: string, status: number, payload: unknown = null) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

/** 同源 fetch 封装：自动带 cookie、JSON 序列化、错误抛 ApiError */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, { credentials: 'include', ...init, headers })
  if (!res.ok) throw await toApiError(res)
  const ct = res.headers.get('content-type') ?? ''
  return (ct.includes('json') ? await res.json() : ((await res.text()) as unknown)) as T
}

async function toApiError(res: Response): Promise<ApiError> {
  let msg = `HTTP ${res.status}`
  let payload: unknown = null
  try {
    const data = await res.json()
    payload = data
    const detail = (data as { detail?: unknown })?.detail
    if (typeof detail === 'string') msg = detail
    else if (detail && typeof detail === 'object' && 'message' in detail) {
      const nested = detail as { message?: unknown }
      if (typeof nested.message === 'string') msg = nested.message
    }
  } catch {
    /* 非 JSON 错误体 */
  }
  return new ApiError(msg, res.status, payload)
}

export interface UploadHandle<T> {
  promise: Promise<T>
  abort: () => void
}

/**
 * multipart 图片上传（XMLHttpRequest：fetch 拿不到上传进度）。
 * 成功 resolve 响应 JSON；失败/取消 reject ApiError。
 */
export function uploadImage<T = unknown>(
  path: string,
  file: File,
  onProgress?: (fraction: number) => void,
): UploadHandle<T> {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<T>((resolve, reject) => {
    xhr.open('POST', path)
    xhr.withCredentials = true
    xhr.responseType = 'json'
    if (onProgress) {
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(event.loaded / event.total)
      }
    }
    xhr.onerror = () => reject(new ApiError('网络好像断了，这张没传上去', 0))
    xhr.ontimeout = () => reject(new ApiError('上传超时了，再试一次这张', 0))
    xhr.onabort = () => reject(new ApiError('已取消', 0))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T)
        return
      }
      const body = xhr.response as { detail?: unknown } | null
      const detail = body?.detail
      const msg = typeof detail === 'string' ? detail : `上传失败（HTTP ${xhr.status}）`
      reject(new ApiError(msg, xhr.status, body))
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
  return { promise, abort: () => xhr.abort() }
}
