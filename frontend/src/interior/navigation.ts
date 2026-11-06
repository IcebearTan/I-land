/** 小屋以角色脚底为坐标；寻路和键盘走动使用同一占地判断。 */
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface HomeGeometry { walkable: Rect; walls: readonly Rect[]; furniture: readonly Rect[] }

export function homeWalkable(room: HomeGeometry, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  const area = room.walkable
  if (x - 4 < area.x || x + 4 > area.x + area.w || y - 4 < area.y || y > area.y + area.h) return false
  return ![...room.walls, ...room.furniture].some(r => x + 4 > r.x && x - 4 < r.x + r.w && y > r.y && y - 4 < r.y + r.h)
}

export function homeSegmentClear(room: HomeGeometry, a: Point, b: Point): boolean {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return false
  if (!homeWalkable(room, a.x, a.y) || !homeWalkable(room, b.x, b.y)) return false
  // 连续相交判断。逐像素采样会漏掉浮点位移中很短的穿角段。
  return ![...room.walls, ...room.furniture].some(rect => {
    let enter = 0, leave = 1
    const intervals = [[a.x, b.x - a.x, rect.x - 4, rect.x + rect.w + 4], [a.y, b.y - a.y, rect.y, rect.y + rect.h + 4]]
    for (const [origin, direction, lower, upper] of intervals) {
      if (!direction) { if (origin <= lower || origin >= upper) return false; continue }
      const first = (lower - origin) / direction, last = (upper - origin) / direction
      enter = Math.max(enter, Math.min(first, last)); leave = Math.min(leave, Math.max(first, last))
      if (enter >= leave) return false
    }
    return enter < leave
  })
}

/** 4px 网格 A*，检查每条边的完整脚底，不从家具角落斜穿过去。 */
export function homeRoute(room: HomeGeometry, start: Point, target: Point): Point[] | null {
  if (!homeWalkable(room, start.x, start.y) || !homeWalkable(room, target.x, target.y)) return null
  if (homeSegmentClear(room, start, target)) return [{ ...target }]
  const cell = 4, columns = Math.ceil(room.walkable.w / cell), rows = Math.ceil(room.walkable.h / cell)
  const point = (key: number): Point => ({ x: room.walkable.x + (key % columns) * cell + cell / 2, y: room.walkable.y + Math.floor(key / columns) * cell + cell / 2 })
  const inside = (x: number, y: number) => x >= 0 && x < columns && y >= 0 && y < rows
  const nearest = (p: Point): number | null => {
    const cx = Math.floor((p.x - room.walkable.x) / cell), cy = Math.floor((p.y - room.walkable.y) / cell)
    const candidates: Array<{ key: number; distance: number }> = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inside(cx + dx, cy + dy)) continue
      const key = (cy + dy) * columns + cx + dx, candidate = point(key)
      if (homeSegmentClear(room, p, candidate)) candidates.push({ key, distance: Math.hypot(candidate.x - p.x, candidate.y - p.y) })
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0]?.key ?? null
  }
  const first = nearest(start), last = nearest(target)
  if (first === null || last === null) return null
  const open = [first], closed = new Set<number>(), parents = new Map<number, number>()
  const costs = new Map<number, number>([[first, 0]])
  const score = (key: number) => (costs.get(key) ?? Infinity) + Math.hypot(point(key).x - target.x, point(key).y - target.y)
  while (open.length) {
    let best = 0
    for (let i = 1; i < open.length; i++) if (score(open[i]) < score(open[best])) best = i
    const current = open.splice(best, 1)[0]
    if (current === last) {
      const route = [point(last), { ...target }]
      let key = last
      while (parents.has(key)) { key = parents.get(key)!; route.unshift(point(key)) }
      // 只合并可以整段安全走过的拐点，保留绕行路径。
      const smooth: Point[] = [], remaining = route
      let anchor = start
      while (remaining.length) {
        let farthest = 0
        for (let i = 1; i < remaining.length; i++) if (homeSegmentClear(room, anchor, remaining[i])) farthest = i
        anchor = remaining[farthest]; smooth.push(anchor); remaining.splice(0, farthest + 1)
      }
      return smooth
    }
    closed.add(current)
    const x = current % columns, y = Math.floor(current / columns), a = point(current)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || !inside(x + dx, y + dy)) continue
      const next = (y + dy) * columns + x + dx
      if (closed.has(next)) continue
      const b = point(next)
      if (!homeSegmentClear(room, a, b)) continue
      const cost = costs.get(current)! + Math.hypot(dx, dy) * cell
      if (cost >= (costs.get(next) ?? Infinity)) continue
      parents.set(next, current); costs.set(next, cost)
      if (!open.includes(next)) open.push(next)
    }
  }
  return null
}
