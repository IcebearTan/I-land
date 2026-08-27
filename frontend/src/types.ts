export interface User {
  id: number
  name: string
  display: string
  sprite: string
}

export interface Letter {
  id: number
  date: string
  title: string
  excerpt: string
  author: string
  theme: string
  pages: string[]
  created_at: string
}

export interface Meta {
  site_title: string
  start_date: string
}
