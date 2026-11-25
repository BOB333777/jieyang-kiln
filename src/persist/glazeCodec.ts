import type { GlazeLayer } from '../game/types'
import { BARE_ID, MAX_LAYERS } from '../sim/glaze'

/**
 * 釉层的存档编码。512×512 = 262144 像素，两个数组直接 JSON 化是几兆字节，
 * 存档会撑爆 localStorage 配额；釉层又大片留白，所以按「游程」压。
 * 编码只在存储边界出现（设计文档 §3）：内存里永远是 Uint8Array，图省事会把自己坑死。
 */
export interface EncodedGlaze {
  w: number
  h: number
  /** 游程：`釉种.厚度.像素数` 用逗号连起来，空图就是 "0.0.262144" 一条 */
  runs: string
}

/** 单边上限：防止坏存档让 decode 去分配上亿像素。 */
const MAX_SIDE = 4096
const MAX_PIXELS = 2048 * 2048

function normThickness(layer: GlazeLayer, i: number): number {
  // 不变量：露胎没有厚度。真被写脏了也按 0 编码，不把脏数据带进存档。
  return layer.glazeIds[i] === BARE_ID ? 0 : layer.thickness[i]
}

export function encodeGlaze(layer: GlazeLayer): EncodedGlaze {
  const total = layer.width * layer.height
  const runs: string[] = []
  let i = 0
  while (i < total) {
    const glaze = layer.glazeIds[i]
    const thickness = normThickness(layer, i)
    let n = 1
    while (i + n < total && layer.glazeIds[i + n] === glaze && normThickness(layer, i + n) === thickness) n++
    runs.push(`${glaze}.${thickness}.${n}`)
    i += n
  }
  return { w: layer.width, h: layer.height, runs: runs.join(',') }
}

/**
 * 解码。任何结构问题都返回 null——调用方看到 null 要退回「还没上釉」，
 * 不要把关卡丢成坏档：釉层是后段数据，坏了不该毁掉前面的拆泥进度。
 *
 * 釉种不校验是否还注册在数据表里（二期可能下掉某种釉）：
 * 旧档带着已下线的釉照样读得进来，烧成时 fire() 按露胎色处理。
 */
export function decodeGlaze(raw: unknown): GlazeLayer | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const width = d.w
  const height = d.h
  const runs = d.runs
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null
  const total = width * height
  if (total > MAX_PIXELS) return null
  if (typeof runs !== 'string' || runs === '') return null

  const glazeIds = new Uint8Array(total)
  const thickness = new Uint8Array(total)
  let at = 0
  for (const run of runs.split(',')) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,9})$/.exec(run)
    if (!m) return null
    const glaze = Number(m[1])
    const thick = Number(m[2])
    const count = Number(m[3])
    if (glaze > 255) return null
    if (thick > MAX_LAYERS) return null
    if (glaze === BARE_ID) {
      if (thick !== 0) return null
    } else if (thick < 1) {
      return null
    }
    if (count < 1 || at + count > total) return null
    glazeIds.fill(glaze, at, at + count)
    thickness.fill(thick, at, at + count)
    at += count
  }
  if (at !== total) return null
  return { width, height, glazeIds, thickness }
}
