import { describe, expect, it } from 'vitest'
import { createLayer, paintDab, paintStroke } from '../sim/glaze'
import { decodeGlaze, encodeGlaze } from './glazeCodec'

function painted() {
  const layer = createLayer(8, 8)
  paintDab(layer, { x: 2.5, y: 2.5, radius: 2, glazeId: 1 })
  paintStroke(layer, { x: 1.5, y: 6.5, radius: 1, glazeId: 2 }, { x: 6.5, y: 6.5, radius: 1, glazeId: 2 })
  paintDab(layer, { x: 2.5, y: 2.5, radius: 1, glazeId: 1 })
  return layer
}

describe('釉层编码：空图只占一条游程', () => {
  it('8×8 空白层编成 "0.0.64"', () => {
    expect(encodeGlaze(createLayer(8, 8))).toEqual({ w: 8, h: 8, runs: '0.0.64' })
  })

  it('512×512 空白层编码不超过 16 个字符（存档不会被一张空贴图撑爆）', () => {
    const enc = encodeGlaze(createLayer(512, 512))
    expect(enc.runs.length).toBeLessThanOrEqual(16)
  })
})

describe('釉层编码：写了东西也能压住体积', () => {
  it('几笔涂抹之后编码仍远小于原始字节数', () => {
    const layer = createLayer(512, 512)
    paintDab(layer, { x: 256, y: 256, radius: 40, glazeId: 1 })
    paintStroke(layer, { x: 100.5, y: 100.5, radius: 20, glazeId: 2 }, { x: 400.5, y: 300.5, radius: 20, glazeId: 2 })
    const enc = encodeGlaze(layer)
    expect(enc.runs.length).toBeLessThan(layer.glazeIds.length)
  })
})

describe('釉层编码：往返后逐字节相同', () => {
  it('空白层往返不变', () => {
    const layer = createLayer(8, 8)
    const back = decodeGlaze(encodeGlaze(layer))
    expect(back).not.toBeNull()
    expect(Array.from(back!.glazeIds)).toEqual(Array.from(layer.glazeIds))
    expect(Array.from(back!.thickness)).toEqual(Array.from(layer.thickness))
  })

  it('有笔触、有叠层、有换釉的层往返不变', () => {
    const layer = painted()
    const enc = encodeGlaze(layer)
    const back = decodeGlaze(JSON.parse(JSON.stringify(enc)))
    expect(back).not.toBeNull()
    expect(back!.width).toBe(layer.width)
    expect(back!.height).toBe(layer.height)
    expect(Array.from(back!.glazeIds)).toEqual(Array.from(layer.glazeIds))
    expect(Array.from(back!.thickness)).toEqual(Array.from(layer.thickness))
  })
})

describe('釉层编码：坏数据一律拒绝', () => {
  const bad: unknown[] = [
    null,
    undefined,
    'runs',
    123,
    {},
    { w: 0, h: 8, runs: '0.0.0' },
    { w: 8.5, h: 8, runs: '0.0.64' },
    { w: 8, h: 8, runs: '' },
    { w: 8, h: 8, runs: '0.0.60' },
    { w: 8, h: 8, runs: '0.0.64,0.0.64' },
    { w: 8, h: 8, runs: '1.4.64' },
    { w: 8, h: 8, runs: '0.2.64' },
    { w: 8, h: 8, runs: '0.0.0' },
    { w: 8, h: 8, runs: 'a.b.c' },
    { w: 8, h: 8, runs: '256.1.64' },
  ]

  it('结构不对、层数超限、游程和像素数不符都返回 null', () => {
    for (const raw of bad) expect(decodeGlaze(raw)).toBeNull()
  })

  it('尺寸大到离谱（坏存档想让我们分配上亿像素）直接拒', () => {
    expect(decodeGlaze({ w: 4096, h: 4096, runs: '0.0.16777216' })).toBeNull()
    expect(decodeGlaze({ w: 99999, h: 1, runs: '0.0.99999' })).toBeNull()
  })
})

describe('釉层编码：向前兼容', () => {
  it('已下线的釉种照样能解码（烧成时按露胎处理，不整块丢釉层）', () => {
    const back = decodeGlaze({ w: 4, h: 1, runs: '9.1.2,0.0.2' })
    expect(back).not.toBeNull()
    expect(Array.from(back!.glazeIds)).toEqual([9, 9, 0, 0])
    expect(Array.from(back!.thickness)).toEqual([1, 1, 0, 0])
  })
})
