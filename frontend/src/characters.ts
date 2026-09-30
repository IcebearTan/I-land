/** 两层共享的纯数据：React 画头像、Phaser 建纹理，互不访问对方渲染器。 */
export type CharacterId = 'bear' | 'her'
export type Direction = 'front' | 'back' | 'side'
export interface Character {
  title: string
  description: string
  palette: Record<string, string>
  frames: Record<Direction, string[]>
  steps: Record<Direction, string[]>
}
export function characterId(sprite: string, name = ''): CharacterId {
  return sprite === 'her' || (sprite !== 'bear' && name === 'her') ? 'her' : 'bear'
}
const bearRows = [
    '...sss....sss...', '...swwsssswws...', '..swwwwwwwwwws..', '.swwWWWWWWWWwws.',
    '.swWWWWWWWWWWws.', '.swWWdWWWWdWWws.', '.swWWWWWnWWWWws.', '..swWWrWWrWWws..',
    '...ssssssssss...', '...srrrrrrrrs...', '..swwrrrrrrwws..', '..swwwwwwwwwws..',
    '...swwwwwwwws...', '...swws..swws...', '...sss....sss...', '................',
  ]
const bearPalette = { s: '#aa987c', w: '#eadfca', W: '#fff5e1', d: '#4a3b55', n: '#795747', r: '#e8637c' }
const backRows = bearRows.map((row, index) => index < 9 ? row.replace(/[dnr]/g, 'W') : row)
const sideRows = [
    '.....sss.sss....', '....swwwswwws...', '...swwwwwwwwws..', '...swWWWWWWWWws.',
    '...swWWWWWWWWws.', '...swWWWWWdWWws.', '...swWWWWWWWWns.', '....swWWWWrWws..',
    '.....ssssssss...', '.....srrrrrrs...', '....swwrrrrwws..', '....swwwwwwwws..',
    '.....swwwwwws...', '.....sww.swws...', '.....sss.sss....', '................',
  ]

const girlFront = [
  '.....hhhhhh.....', '....hHHHHHHh....', '...hHHHHHHrrh...', '...hHHHHHrrrr...',
  '...hHkkkHHrrh...', '...hkdkkdkHHh...', '...hkkkkkkHHh...', '...hhkppkhHhh...',
  '...hHhkkhHHhh...', '....hwwwwwwh....', '...kwwrwrwwwk...', '...kwwwwwwwwk...',
  '....wwwwwwww....', '...wwwwwwwwww...', '.....kk..kk.....', '.....ss..ss.....',
]
const girlBack = [
  '.....hhhhhh.....', '....hHHHHHHh....', '...hHHHHHHHHh...', '...hHHHHHHHHh...',
  '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hHHHHHHHHh...', '...hHHHHHHHHh...',
  '...hHHHHHHHHh...', '....hhHHHHhh....', '...kwwhwwhwwk...', '...kwwwwwwwwk...',
  '....wwwwwwww....', '...wwwwwwwwww...', '.....kk..kk.....', '.....ss..ss.....',
]
const girlSide = [
  '.....hhhhhh.....', '....hHHHHHHh....', '....hHHHHHrrh...', '....hHHHHrrrr...',
  '....hHHHkkrrh...', '....hHHHkdkhh...', '....hHHHkkkk....', '....hHHHkkp.....',
  '....hHHHhkh.....', '.....hhwwww.....', '.....wwwwwkk....', '.....wwwwwkk....',
  '.....wwwwww.....', '....wwwwwwww....', '......kk.kk.....', '......ss.ss.....',
]
function steps(frames: Record<Direction, string[]>, girl: boolean): Record<Direction, string[]> {
  return Object.fromEntries(Object.entries(frames).map(([direction, rows]) => [direction,
    girl ? [...rows.slice(0, 14), '.....kk..ss.....', '.....ss.........']
      : [...rows.slice(0, 13), '....swws.sss....', '....sss.........', '................'],
  ])) as Record<Direction, string[]>
}
const bearFrames = { front: bearRows, back: backRows, side: sideRows }
const girlFrames = { front: girlFront, back: girlBack, side: girlSide }
export const CHARACTERS: Record<CharacterId, Character> = {
  bear: { title: '小熊', description: '奶油白毛 · 玫瑰围巾', palette: bearPalette, frames: bearFrames, steps: steps(bearFrames, false) },
  her: { title: '女孩', description: '栗色长发 · 奶油裙', palette: { h: '#684938', H: '#a97853', k: '#f0c6a0', d: '#4a3b55', p: '#df997f', r: '#e8637c', w: '#fdf6e9', s: '#8a5a38' }, frames: girlFrames, steps: steps(girlFrames, true) },
}
