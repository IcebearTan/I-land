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
export function characterId(sprite: string, account = ''): CharacterId {
  return sprite === 'her' || (sprite !== 'bear' && account === 'her') ? 'her' : 'bear'
}

// 16×16 手绘像素：Ice Bear 的白毛、圆耳、长身体和淡定表情，不戴围巾。
const bearFront = [
  '....ss....ss....',
  '...sWWssssWWs...',
  '..sWWWWWWWWWWs..',
  '..sWWWWWWWWWWs..',
  '..sWWdWWWdWWWs..',
  '..sWWWWnWWWWWs..',
  '..sWWWWmmWWWWs..',
  '..swWWWWWWWWws..',
  '..swWWWWWWWWws..',
  '..swwWWWWWWwws..',
  '..swWWWWWWWWws..',
  '...swWWWWWWws...',
  '...swwWWWWwws...',
  '...swwwsswwws...',
  '...swws..swws...',
  '....ss....ss....',
]
const bearBack = bearFront.map(row => row.replace(/[dnm]/g, 'W'))
const bearSide = [
  '......ss.ss.....',
  '.....sWWsWWs....',
  '....sWWWWWWWs...',
  '....sWWWWWWWWs..',
  '....sWWWWdWWWs..',
  '....sWWWWWWWns..',
  '....sWWWWWmWWs..',
  '....swWWWWWWws..',
  '....swWWWWWWws..',
  '....swwWWWWWws..',
  '....swWWWWWWws..',
  '.....swWWWWws...',
  '.....swwWWwws...',
  '.....swwswws....',
  '.....swwswws....',
  '......ss.ss.....',
]
const bearPalette = {
  s: '#8c999a', w: '#e6e8e3', W: '#fffaf2',
  d: '#252334', n: '#252334', m: '#8c999a',
}

// 黑长发、青绿色短袖、黑裤子。胸前 5×4 的罗小黑猫头：尖耳 + 浅色双眼。
const girlFront = [
  '.....hhhhhh.....',
  '....hHHHHHHh....',
  '...hHHHHHHHHh...',
  '...hHHHkkHHHh...',
  '...hHkkkkkkHh...',
  '...hHkdkkdkHh...',
  '...hHkkkkkkHh...',
  '...hhHkrrkHhh...',
  '...hTctttcTTh...',
  '...ttcccccTTt...',
  '...ktcwcwctTk...',
  '...kTtccctTTk...',
  '....pppppppp....',
  '....pPp..pPp....',
  '.....pp..pp.....',
  '.....ss..ss.....',
]
const girlBack = [
  '.....hhhhhh.....',
  '....hHHHHHHh....',
  '...hHHHHHHHHh...',
  '...hHHHHHHHHh...',
  '...hHHHHHHHHh...',
  '...hHHHHHHHHh...',
  '...hHHHHHHHHh...',
  '...hHHHHHHHHh...',
  '...hHHHHHHHHh...',
  '...ttHHHHHhTt...',
  '...kTthhhtTTk...',
  '...kTtttttTTk...',
  '....pppppppp....',
  '....pPp..pPp....',
  '.....pp..pp.....',
  '.....ss..ss.....',
]
const girlSide = [
  '.....hhhhhh.....',
  '....hHHHHHHh....',
  '....hHHHHHHHh...',
  '....hHHHHkkkh...',
  '....hHHHkkkkh...',
  '....hHHHkdkhh...',
  '....hHHHkkkk....',
  '....hHHHkkr.....',
  '....hHHHtTt.....',
  '.....hhTtTtt....',
  '.....tTktTtk....',
  '.....tTktTtk....',
  '.....pppppp.....',
  '.....pPp.pPp....',
  '......pp.pp.....',
  '......ss.ss.....',
]
function steps(frames: Record<Direction, string[]>, bear: boolean): Record<Direction, string[]> {
  return Object.fromEntries(Object.entries(frames).map(([direction, rows]) => [direction,
    bear ? [...rows.slice(0, 13), direction === 'side' ? '.....swwssws....' : '...swwwsswws....',
      direction === 'side' ? '......ss.sws....' : '....sss..sws....',
      '.........ss.....']
      : [...rows.slice(0, 14), direction === 'side' ? '......pp.ss.....' : '.....pp..ss.....',
        direction === 'side' ? '......ss........' : '.....ss.........'],
  ])) as Record<Direction, string[]>
}
const bearFrames = { front: bearFront, back: bearBack, side: bearSide }
const girlFrames = { front: girlFront, back: girlBack, side: girlSide }
export const CHARACTERS: Record<CharacterId, Character> = {
  bear: {
    title: '白熊', description: 'Ice Bear · 白毛圆耳', palette: bearPalette,
    frames: bearFrames, steps: steps(bearFrames, true),
  },
  her: {
    title: '黑发岛民', description: '黑发 · 罗小黑青绿短袖 · 黑裤',
    palette: { h: '#20222e', H: '#393946', k: '#f0c6a0', d: '#252334', r: '#df997f',
      t: '#3f887f', T: '#62b2a2', c: '#161b26', w: '#f5eee2', p: '#242333', P: '#393946', s: '#4a3b55' },
    frames: girlFrames, steps: steps(girlFrames, false),
  },
}
