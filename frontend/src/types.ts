export interface User {
  id: number
  account: string // 不变的身份键；name 是与显示名字同步的登录账号
  name: string
  display: string
  sprite: string
}

export interface Letter {
  id: number
  date: string
  title: string
  excerpt: string
  body: string
  author: string
  theme: string
  pages: string[]
  read_at: string | null
  unread: boolean
  created_at: string
}

export interface Meta {
  site_title: string
  start_date: string
}
