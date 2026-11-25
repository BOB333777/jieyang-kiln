import data from '../data/glaze.json'
import type { GlazeLayer } from '../game/types'
import { BARE_ID, BARE_FIRED, GLAZES, GLAZE_CANVAS, MAX_LAYERS } from './glaze'

/**
 * 烧制算法（设计文档 §2.7）：读 S6 的釉层贴图，逐像素查表出成品色。
 * 纯函数：同一个釉层烧多少次都是同一张成品图，所以成品贴图不用落盘（s7 可随时重算）。
 */
export interface Rgb {
  r: number
  g: number
  b: number
}

export interface FiredTexture {
  width: number
  height: number
  /** RGBA。alpha 恒 255：成品是一整块不透明的釉面 / 胎面 */
  rgba: Uint8ClampedArray
}

/** 厚度对明度的系数：1 层最亮，越厚越深（数据表 thicknessShade）。 */
const SHADE: readonly number[] = data.thicknessShade

function parseHex(hex: string): Rgb {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`色值不是 #rrggbb：${hex}`)
  const n = Number.parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

const FIRED = new Map<number, Rgb>(GLAZES.map((g) => [g.id, parseHex(g.fired)]))
const BARE_RGB = parseHex(BARE_FIRED)

/**
 * 单像素烧成色。
 * - 露胎（0）→ 陶泥熏褐，不受厚度影响
 * - 有釉 → 查表得烧成色，按厚度压暗（厚 = 深）
 * - 数据表里没有的釉（旧存档留着已下线的釉）→ 按露胎烧，不崩
 */
export function firedColorOf(glazeId: number, thickness: number): Rgb {
  const fired = glazeId === BARE_ID ? undefined : FIRED.get(glazeId)
  if (!fired) return { ...BARE_RGB }
  const layers = Math.min(Math.max(Math.round(thickness), 1), MAX_LAYERS)
  const f = SHADE[layers - 1] ?? 1
  return {
    r: Math.round(fired.r * f),
    g: Math.round(fired.g * f),
    b: Math.round(fired.b * f),
  }
}

/** 把整块釉层烧成成品贴图。layer 为空 = 这一局还没上釉，整块烧成陶泥色。 */
export function fire(layer: GlazeLayer | null | undefined): FiredTexture {
  const width = layer?.width ?? GLAZE_CANVAS
  const height = layer?.height ?? GLAZE_CANVAS
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const c = layer ? firedColorOf(layer.glazeIds[i], layer.thickness[i]) : firedColorOf(BARE_ID, 0)
    const o = i * 4
    rgba[o] = c.r
    rgba[o + 1] = c.g
    rgba[o + 2] = c.b
    rgba[o + 3] = 255
  }
  return { width, height, rgba }
}

export interface Swatch {
  readonly id: number
  readonly key: string
  /** 生釉色（刷上去看到的） */
  readonly raw: string
  /** 烧成色（开窑后看到的） */
  readonly fired: string
}

/** 结果页「你预判对了吗」的对照表：露胎排在最前，然后五种釉按数据表顺序。 */
export function swatches(): readonly Swatch[] {
  return [
    { id: BARE_ID, key: data.bare.key, raw: '', fired: BARE_FIRED },
    ...GLAZES.map((g) => ({ id: g.id, key: g.key, raw: g.raw, fired: g.fired })),
  ]
}
