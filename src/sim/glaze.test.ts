import { describe, expect, it } from 'vitest'
import {
  BARE_ID,
  GLAZES,
  MAX_LAYERS,
  createLayer,
  glazeAt,
  glazeById,
  isEmpty,
  paintDab,
  paintStroke,
  thicknessAt,
} from './glaze'

const ASH = 1
const GREEN = 2

describe('上釉：新笔刷是整块露胎', () => {
  it('空白层全 0，isEmpty 为真', () => {
    const layer = createLayer(8, 8)
    expect(layer.glazeIds.length).toBe(64)
    expect(layer.thickness.length).toBe(64)
    expect(isEmpty(layer)).toBe(true)
    expect(glazeAt(layer, 3, 3)).toBe(BARE_ID)
    expect(thicknessAt(layer, 3, 3)).toBe(0)
  })
})

describe('上釉：笔刷落点', () => {
  it('落一笔：圈内记釉种和一层厚度，圈外仍是露胎', () => {
    const layer = createLayer(16, 16)
    paintDab(layer, { x: 8.5, y: 8.5, radius: 2, glazeId: ASH })
    expect(glazeAt(layer, 8, 8)).toBe(ASH)
    expect(thicknessAt(layer, 8, 8)).toBe(1)
    expect(glazeAt(layer, 0, 0)).toBe(BARE_ID)
    expect(isEmpty(layer)).toBe(false)
  })

  it('笔刷是圆的：正右方 2 像素在圈内，斜角 2 像素外已经出圈', () => {
    const layer = createLayer(16, 16)
    paintDab(layer, { x: 8.5, y: 8.5, radius: 2, glazeId: ASH })
    // 像素 (10,8) 中心离笔心正好 2.0 → 在圈上，涂到
    expect(glazeAt(layer, 10, 8)).toBe(ASH)
    // 像素 (11,8) 中心离笔心 3.0 → 出圈
    expect(glazeAt(layer, 11, 8)).toBe(BARE_ID)
    // 像素 (10,10) 中心离笔心 √8≈2.83 → 出圈（圆不是方）
    expect(glazeAt(layer, 10, 10)).toBe(BARE_ID)
  })

  it('半径 0 当单像素笔刷：滑杆拖到最小也涂得上，且只涂一格', () => {
    const layer = createLayer(16, 16)
    paintDab(layer, { x: 5.5, y: 5.5, radius: 0, glazeId: ASH })
    expect(glazeAt(layer, 5, 5)).toBe(ASH)
    let painted = 0
    for (const id of layer.glazeIds) if (id !== BARE_ID) painted++
    expect(painted).toBe(1)
  })
})

describe('上釉：厚度上限 3 层', () => {
  it('同一点涂三遍 = 三层', () => {
    const layer = createLayer(8, 8)
    for (let i = 0; i < 3; i++) paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: ASH })
    expect(thicknessAt(layer, 4, 4)).toBe(MAX_LAYERS)
  })

  it('第四遍就封顶了，不会变四层', () => {
    const layer = createLayer(8, 8)
    for (let i = 0; i < 5; i++) paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: ASH })
    expect(thicknessAt(layer, 4, 4)).toBe(MAX_LAYERS)
    expect(MAX_LAYERS).toBe(3)
  })

  it('厚度只加在笔刷覆盖的像素上，边上还是原来的层数', () => {
    const layer = createLayer(16, 16)
    paintDab(layer, { x: 8.5, y: 8.5, radius: 4, glazeId: ASH })
    paintDab(layer, { x: 8.5, y: 8.5, radius: 1, glazeId: ASH })
    expect(thicknessAt(layer, 8, 8)).toBe(2)
    expect(thicknessAt(layer, 11, 8)).toBe(1)
  })
})

describe('上釉：不同釉叠在一起 = 上层覆盖下层', () => {
  it('灰釉涂三层后刷绿釉：釉种变绿、厚度从一层算起', () => {
    const layer = createLayer(8, 8)
    for (let i = 0; i < 3; i++) paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: ASH })
    paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: GREEN })
    expect(glazeAt(layer, 4, 4)).toBe(GREEN)
    expect(thicknessAt(layer, 4, 4)).toBe(1)
  })

  it('换釉之后继续涂同一种，厚度照常累加', () => {
    const layer = createLayer(8, 8)
    paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: ASH })
    paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: GREEN })
    paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: GREEN })
    expect(glazeAt(layer, 4, 4)).toBe(GREEN)
    expect(thicknessAt(layer, 4, 4)).toBe(2)
  })
})

describe('上釉：拖动补间', () => {
  it('一笔从左拖到右，中间不断点', () => {
    const layer = createLayer(32, 16)
    paintStroke(layer, { x: 2.5, y: 8.5, radius: 1, glazeId: ASH }, { x: 28.5, y: 8.5, radius: 1, glazeId: ASH })
    for (let x = 3; x <= 27; x++) expect(glazeAt(layer, x, 8)).toBe(ASH)
  })

  it('拖动也认厚度上限：来回拖十遍还是三层', () => {
    const layer = createLayer(16, 16)
    for (let i = 0; i < 10; i++) {
      paintStroke(layer, { x: 4.5, y: 8.5, radius: 2, glazeId: ASH }, { x: 12.5, y: 8.5, radius: 2, glazeId: ASH })
    }
    expect(thicknessAt(layer, 8, 8)).toBe(MAX_LAYERS)
  })
})

describe('上釉：边界', () => {
  it('笔刷甩到贴图外：只涂进来的那部分，不越界不抛错', () => {
    const layer = createLayer(8, 8)
    expect(() => paintDab(layer, { x: -2, y: -2, radius: 5, glazeId: ASH })).not.toThrow()
    expect(glazeAt(layer, 0, 0)).toBe(ASH)
    expect(layer.glazeIds.length).toBe(64)
  })

  it('整块画在贴图外面：一笔都没涂上', () => {
    const layer = createLayer(8, 8)
    paintDab(layer, { x: 100, y: 100, radius: 3, glazeId: ASH })
    expect(isEmpty(layer)).toBe(true)
  })

  it('取样越界返回露胎 / 零厚度，不抛错', () => {
    const layer = createLayer(8, 8)
    expect(glazeAt(layer, -1, 0)).toBe(BARE_ID)
    expect(glazeAt(layer, 8, 0)).toBe(BARE_ID)
    expect(thicknessAt(layer, 0, 99)).toBe(0)
  })

  it('没注册的釉不能往贴图上画（露胎也不行）', () => {
    const layer = createLayer(8, 8)
    expect(() => paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: 99 })).toThrow()
    expect(() => paintDab(layer, { x: 4.5, y: 4.5, radius: 1, glazeId: BARE_ID })).toThrow()
  })
})

describe('上釉：同一笔刷序列出同一张图', () => {
  it('两遍完全相同的操作，釉种和厚度逐字节相同', () => {
    const run = () => {
      const layer = createLayer(24, 24)
      paintDab(layer, { x: 6.5, y: 6.5, radius: 3, glazeId: ASH })
      paintStroke(layer, { x: 6.5, y: 6.5, radius: 3, glazeId: GREEN }, { x: 18.5, y: 16.5, radius: 2, glazeId: GREEN })
      paintDab(layer, { x: 18.5, y: 16.5, radius: 4, glazeId: ASH })
      return layer
    }
    const a = run()
    const b = run()
    expect(Array.from(a.glazeIds)).toEqual(Array.from(b.glazeIds))
    expect(Array.from(a.thickness)).toEqual(Array.from(b.thickness))
  })
})

describe('釉数据表', () => {
  it('五种釉，id 从 1 起，生釉色和烧成色都是合法色值', () => {
    expect(GLAZES.length).toBe(5)
    expect(GLAZES.map((g) => g.id)).toEqual([1, 2, 3, 4, 5])
    for (const g of GLAZES) {
      expect(g.raw).toMatch(/^#[0-9a-f]{6}$/i)
      expect(g.fired).toMatch(/^#[0-9a-f]{6}$/i)
      expect(glazeById(g.id)).toBe(g)
    }
  })

  it('露胎不是釉，查不到', () => {
    expect(glazeById(BARE_ID)).toBeNull()
  })
})
