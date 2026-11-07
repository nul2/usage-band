// The walking-dog progress band: checklist parsing and drawing. Pure, no `$`.
import type { WalkState } from '../types'

// The dog, exactly as given: 15 × 9 dots, one dot = 2 px → 30 × 18 px.
export const DOG = [
  '........BBBBB..',
  '.......BBBBBBB.',
  '......DBKBBBKBD',
  '......DBBBLLBBD',
  'B.....DBBLKLBBD',
  'BB.BBBDBBLLLBD.',
  '.BBBBBBBBBBBB..',
  '.BB.BB..BB.BB..',
  '.DD.DD..DD.DD..',
]
// Walking: only the two leg rows change, every leg dot moved one to the right.
export const DOG_STEP = [
  ...DOG.slice(0, 7),
  ...DOG.slice(7).map(r => `.${r.slice(0, -1)}`),
]
const COLOR: Record<string, string> = { B: '#B07A42', D: '#6E4123', K: '#1B1B1B', L: '#E2C08E' }

export const DOT = 2
export const DOG_W = 15 * DOT // 30
export const DOG_H = 9 * DOT // 18
export const BAND_H = 28
export const TRAIL = '#B07A42' // 지나온 선
export const REST = '#CBD5E0' // 남은 선, 연회색
export const LABEL = '#718096'

/** [x] count over all checkboxes; null when there are none. */
export function progress(md: string): { done: number; total: number } | null {
  let done = 0
  let total = 0
  for (const line of md.split('\n')) {
    const m = /^\s*[-*+]\s+\[([ xX])\]/.exec(line)
    if (!m) continue
    total += 1
    if (m[1] !== ' ') done += 1
  }
  return total === 0 ? null : { done, total }
}

export function labelText(w: WalkState | null): string {
  if (!w || w.total === 0) return '–'
  return `${w.done}/${w.total} · ${Math.round((w.done / w.total) * 100)}%`
}

export const isFinished = (w: WalkState | null) => !!w && w.total > 0 && w.done === w.total

/** One step of the walk toward the target: returns the next state, or null once arrived. */
export function stepToward(w: WalkState, stride = 0.02): WalkState | null {
  const d = w.target - w.pos
  if (Math.abs(d) < 1e-9) return null
  const pos = Math.abs(d) <= stride ? w.target : w.pos + Math.sign(d) * stride
  const arrived = pos === w.target
  return { ...w, pos, frame: arrived ? 0 : w.frame === 0 ? 1 : 0, isWalking: !arrived }
}

const CH = 13 * 0.6
const PAD = 6
const EMOJI = 18
const GAP = 6

export function dogRects(map: string[], x: number, y: number): string {
  let out = ''
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const fill = COLOR[row[c]!]
      if (fill) out += `<rect x="${x + c * DOT}" y="${y + r * DOT}" width="${DOT}" height="${DOT}" fill="${fill}"/>`
    }
  })
  return out
}

/** The band as one SVG, `widthPx` wide, 28 high. */
export function walkSvg(w: WalkState | null, widthPx: number): { source: string; width: number; alt: string } {
  const width = Math.max(160, Math.floor(widthPx))
  const label = labelText(w)
  const done = isFinished(w)
  const mid = BAND_H / 2
  const lineY = BAND_H - 5 // the dog's feet stand on it
  const x0 = PAD + EMOJI + GAP // after 🏠
  const rightW = EMOJI + (done ? GAP + EMOJI : 0) + GAP + label.length * CH + PAD
  const x1 = width - rightW - GAP // line end, flag right after
  const pos = Math.min(1, Math.max(0, w?.pos ?? 0))
  const dogX = Math.round(x0 + pos * (x1 - x0 - DOG_W))
  const dogY = lineY - DOG_H
  const map = w?.frame === 1 ? DOG_STEP : DOG
  const flagX = x1 + GAP
  const t = (x: number, s: string, fill = LABEL) =>
    `<text x="${x.toFixed(1)}" y="${mid + 1}" fill="${fill}">${s}</text>`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BAND_H}" viewBox="0 0 ${width} ${BAND_H}" shape-rendering="crispEdges">` +
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" dominant-baseline="central">` +
    t(PAD, '🏠') +
    `<rect x="${x0}" y="${lineY}" width="${Math.max(0, x1 - x0)}" height="2" fill="${REST}"/>` +
    `<rect x="${x0}" y="${lineY}" width="${Math.max(0, dogX + DOG_W / 2 - x0)}" height="2" fill="${TRAIL}"/>` +
    dogRects(map, dogX, dogY) +
    t(flagX, '🚩') +
    (done ? t(flagX + EMOJI + GAP, '🎉') : '') +
    t(flagX + EMOJI + (done ? GAP + EMOJI : 0) + GAP, label) +
    `</g></svg>`
  const alt = `강아지 산책: ${label}${done ? ' 🎉' : ''}`
  return { source, width, alt }
}

/** Terminal: the same line in characters (the terminal draws no pictures in one row). */
export function walkText(w: WalkState | null, columns: number) {
  const label = labelText(w)
  const done = isFinished(w)
  const right = ` 🚩${done ? '🎉' : ''} ${label}`
  const lineLen = Math.max(4, columns - 3 - 2 - 2 - (right.length + 2))
  const pos = Math.min(1, Math.max(0, w?.pos ?? 0))
  const before = Math.round(pos * lineLen)
  return { trail: '━'.repeat(before), rest: '─'.repeat(lineLen - before), right }
}
