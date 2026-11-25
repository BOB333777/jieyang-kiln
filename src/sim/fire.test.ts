import { describe, expect, it } from 'vitest'
import { createLayer, paintDab, MAX_LAYERS } from './glaze'
import { fire, firedColorOf, swatches, type FiredTexture } from './fire'

const ASH = 1
const GREEN = 2

/** 陶泥烧成色 #8A5A38 */
const BARE = [138, 90, 56] as const
/** 灰釉烧成色 #A8442F */
const ASH_FIRED = [168, 68, 47] as const

function px(tex: FiredTexture, x: number, y: number): number[] {
  const o = (y * tex.width + x) * 4
  return [tex.rgba[o], tex.rgba[o + 1], tex.rgba[o + 2], tex.rgba[o + 3]]
}

function luminance(rgb: readonly number[]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

function layerWith(dab: { x: number; y: number; radius: number; glazeId: number }): ReturnType<typeof createLayer> {
  const layer = createLayer(8, 8)
  paintDab(layer, dab)
  return layer
}

describe('烧制：没上釉就整块烧成陶泥色', () => {
  it('没有釉层（拆泥阶段直接烧）→ 每像素都是陶泥熏褐', () => {
    const tex = fire(undefined)
    expect(tex.width).toBe(512)
    expect(tex.height).toBe(512)
    expect(tex.rgba.length).toBe(512 * 512 * 4)
    expect(px(tex, 0, 0)).toEqual([...BARE, 255])
    expect(px(tex, 511, 511)).toEqual([...BARE, 255])
  })

  it('空白釉层和没有釉层烧出来一样', () => {
    const tex = fire(createLayer(4, 4))
    expect(px(tex, 2, 2)).toEqual([...BARE, 255])
  })
})

describe('烧制：有釉处查表', () => {
  it('灰釉一层 → 烧成红色，周围没涂的地方仍是陶泥色', () => {
    const tex = fire(layerWith({ x: 4.5, y: 4.5, radius: 1, glazeId: ASH }))
    expect(px(tex, 4, 4)).toEqual([...ASH_FIRED, 255])
    expect(px(tex, 0, 0)).toEqual([...BARE, 255])
  })

  it('绿釉烧成绿，不会沿用灰釉的色', () => {
    const tex = fire(layerWith({ x: 4.5, y: 4.5, radius: 1, glazeId: GREEN }))
    const got = px(tex, 4, 4)
    expect(got.slice(0, 3)).not.toEqual([...ASH_FIRED])
    // 绿的通道高于红的通道
    expect(got[1]).toBeGreaterThan(got[0])
  })
})

describe('烧制：厚 = 深', () => {
  it('一层比两层亮，两层比三层亮', () => {
    const lum = [1, 2, 3].map((times) => {
      const layer = createLayer(8, 8)
      for (let i = 0; i < times; i++) paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: ASH })
      return luminance(px(fire(layer), 4, 4).slice(0, 3))
    })
    expect(lum[0]).toBeGreaterThan(lum[1])
    expect(lum[1]).toBeGreaterThan(lum[2])
  })

  it('三种釉都是越厚越深（不只灰釉一个特例）', () => {
    for (const id of [1, 2, 3, 4, 5]) {
      const one = firedColorOf(id, 1)
      const top = firedColorOf(id, MAX_LAYERS)
      expect(luminance([one.r, one.g, one.b])).toBeGreaterThan(luminance([top.r, top.g, top.b]))
    }
  })

  it('露胎不吃厚度：陶泥色和厚度无关', () => {
    expect(firedColorOf(0, 3)).toEqual(firedColorOf(0, 0))
  })
})

describe('烧制：坏数据不崩', () => {
  it('数据表里没有的釉（旧存档下线釉）→ 按露胎烧', () => {
    expect(firedColorOf(99, 2)).toEqual(firedColorOf(0, 0))
  })

  it('厚度越界（0 或超上限）也夹到 1–3 层，不抛错', () => {
    expect(() => firedColorOf(ASH, 0)).not.toThrow()
    expect(firedColorOf(ASH, 0)).toEqual(firedColorOf(ASH, 1))
    expect(firedColorOf(ASH, 99)).toEqual(firedColorOf(ASH, MAX_LAYERS))
  })
})

describe('烧制：结果页对照表', () => {
  it('露胎排第一，然后五种釉，生釉色和烧成色都齐全', () => {
    const list = swatches()
    expect(list.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5])
    expect(list[0].raw).toBe('')
    for (const s of list.slice(1)) {
      expect(s.raw).toMatch(/^#[0-9a-f]{6}$/i)
    }
    for (const s of list) expect(s.fired).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('灰釉在表里就是「生釉灰、烧成红」（设计文档 §2.6）', () => {
    const ash = swatches().find((s) => s.id === ASH)
    expect(ash?.raw).toBe('#8A8A8A')
    expect(ash?.fired).toBe('#A8442F')
  })
})
