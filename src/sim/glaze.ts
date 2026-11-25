import data from '../data/glaze.json'
import type { GlazeLayer } from '../game/types'

/**
 * 上釉规则（设计文档 §2.6）：笔刷把生釉涂到 UV 贴图上，每像素只记「釉种 + 厚度」。
 * 这里全是纯函数，不碰 canvas、不碰 Three.js——渲染由阶段层调用结果去画。
 */
export const GLAZE_CANVAS: number = data.canvas
export const MAX_LAYERS: number = data.maxLayers

/** 露胎（无釉）。数据表与存档里 0 恒表示这个。 */
export const BARE_ID = 0

export interface GlazeDef {
  /** 0 = 露胎，1..n = 釉。存进贴图和存档的就是这个数，不用 key。 */
  readonly id: number
  /** 文案 key：界面用 t(`glaze.${key}`)，中文名不进数据表（AGENTS.md：文案走 t()）。 */
  readonly key: string
  readonly raw: string
  readonly fired: string
  readonly source: string
}

export const GLAZES: readonly GlazeDef[] = data.glazes as readonly GlazeDef[]
export const BARE_FIRED: string = data.bare.fired

const BY_ID = new Map<number, GlazeDef>(GLAZES.map((g) => [g.id, g]))

export function glazeById(id: number): GlazeDef | null {
  return BY_ID.get(id) ?? null
}

/** 一块空白釉层：全露胎。 */
export function createLayer(width: number = GLAZE_CANVAS, height: number = GLAZE_CANVAS): GlazeLayer {
  return {
    width,
    height,
    glazeIds: new Uint8Array(width * height),
    thickness: new Uint8Array(width * height),
  }
}

export interface Dab {
  /** 贴图连续坐标，笔刷中心。像素 (i,j) 的中心是 (i+0.5, j+0.5)，所以整数坐标落在像素交界上 */
  x: number
  y: number
  /** 半径，像素。小于 0.5 当单像素笔刷——滑杆拖到最小也不会「涂不上」 */
  radius: number
  /** 釉种 id，必须是数据表里注册过的釉（露胎不能当釉涂） */
  glazeId: number
}

/**
 * 一次落笔：圆形笔刷，落在圈内的像素各加一层。
 * - 原来没釉 → 记这个釉、厚度 1
 * - 原来同一种釉 → 厚度 +1，封顶 MAX_LAYERS
 * - 原来是别的釉 → 上层覆盖下层（MVP 不做混色），釉种换新、厚度从 1 算起
 * 越界部分裁掉，不抛错（笔刷甩到贴图外是正常操作）。
 */
export function paintDab(layer: GlazeLayer, dab: Dab): void {
  if (!glazeById(dab.glazeId)) throw new Error(`未注册的釉：${dab.glazeId}`)
  const id = dab.glazeId
  const r = Math.max(0, dab.radius)
  const single = r < 0.5
  const minX = Math.max(0, Math.floor(dab.x - r))
  const maxX = Math.min(layer.width - 1, Math.floor(dab.x + r))
  const minY = Math.max(0, Math.floor(dab.y - r))
  const maxY = Math.min(layer.height - 1, Math.floor(dab.y + r))
  const r2 = r * r
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (!single) {
        const dx = px + 0.5 - dab.x
        const dy = py + 0.5 - dab.y
        if (dx * dx + dy * dy > r2) continue
      }
      const i = py * layer.width + px
      const cur = layer.glazeIds[i]
      if (cur === id) {
        // 同一地方涂多遍 = 更厚
        layer.thickness[i] = Math.min(layer.thickness[i] + 1, MAX_LAYERS)
      } else {
        // 没釉，或是另一种釉被盖住：都从一层算起
        layer.glazeIds[i] = id
        layer.thickness[i] = 1
      }
    }
  }
}

/**
 * 一笔拖动：在 from → to 之间按笔刷半径的一半补间落笔，避免快速拖动画出断续的点。
 * 两端的半径、釉种以各自 dab 为准（笔刷大小中途变了也不会跳）。
 */
export function paintStroke(layer: GlazeLayer, from: Dab, to: Dab): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const step = Math.max(1, Math.min(from.radius, to.radius) * 0.5)
  const n = Math.max(1, Math.ceil(dist / step))
  for (let k = 1; k <= n; k++) {
    const u = k / n
    paintDab(layer, {
      x: from.x + dx * u,
      y: from.y + dy * u,
      radius: from.radius + (to.radius - from.radius) * u,
      glazeId: to.glazeId,
    })
  }
}

/** 读某像素的釉种。越界返回露胎，不抛错（取样器不该因为边缘崩溃）。 */
export function glazeAt(layer: GlazeLayer, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return BARE_ID
  return layer.glazeIds[y * layer.width + x]
}

/** 读某像素的厚度，越界返回 0。 */
export function thicknessAt(layer: GlazeLayer, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= layer.width || y >= layer.height) return 0
  return layer.thickness[y * layer.width + x]
}

/** 整块贴图一笔没涂 → 还是「没上釉」（用来决定要不要进⑥之后的阶段）。 */
export function isEmpty(layer: GlazeLayer): boolean {
  for (let i = 0; i < layer.glazeIds.length; i++) {
    if (layer.glazeIds[i] !== BARE_ID) return false
  }
  return true
}
