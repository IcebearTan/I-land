import { ICONS, type IconId } from './design'
const paths: Record<IconId, string> = {
  heart: 'M12 20 3.8 12C-1 6 7 1 12 7c5-6 13-1 8.2 5Z',
  cake: 'M3 12h18v9H3ZM3 16c3 3 3-3 6 0s3-3 6 0 3-3 6 0M7 12V8m5 4V8m5 4V8M7 5V3m5 2V2m5 3V3',
  flower: 'M12 8c-8-10-12 2-5 4-7 5 2 12 5 4 5 8 12 0 5-4 7-5-3-12-5-4ZM10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  star: 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  moon: 'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z',
  gift: 'M3 8h18v4H3Zm2 4v9h14v-9M12 8v13M12 8C0 8 6-2 12 8Zm0 0c12 0 6-10 0 0Z',
  plane: 'm3 11 7-1 4-7h3l-2 7 6 1v3l-6 1 1 6-3-1-3-5-7-1Z',
  camera: 'M3 7h5l2-3h5l2 3h4v14H3ZM8 14a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  home: 'm2 11 10-8 10 8M5 9v12h14V9M10 21v-7h4v7',
  ring: 'm8 5 2-3h4l2 3-4 4ZM8 8a7 7 0 1 0 8 0',
  coffee: 'M3 8h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5Zm14 1h2a3 3 0 0 1 0 6h-2M6 4V2m4 2V1m4 3V2M2 23h17',
  music: 'M9 17V5l11-3v13M9 8l11-3M3 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0m11-2a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  sun: 'M7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2',
  book: 'M12 5C7 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-5-2-10 1Zm0 0v16',
  sparkles: 'm9 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2Zm10 12 1 3 3 1-3 1-1 3-1-3-3-1 3-1ZM19 2v5m-2-2h5',
  flag: 'M5 22V3m0 1c6-4 8 4 15 0v11c-7 4-9-4-15 0',
  leaf: 'M4 20C-1 7 8 2 21 3c0 12-5 21-17 17ZM3 22 16 9',
  letter: 'M2 5h20v15H2Zm0 0 10 8L22 5M2 20l7-8m6 0 7 8',
}
export function HolidayIcon({ icon, size = 24 }: { icon: string; size?: number }) {
  const key = icon in ICONS ? icon as IconId : 'heart'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[key]} /></svg>
}
