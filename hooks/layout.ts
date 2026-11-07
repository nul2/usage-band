// Pure layout for the band: no `$`, so the test can check widths directly.
import type { SysSnap, UsageSnap, UsageWindow } from '../types'

export const BG = '#141B33' // 짙은 남색
export const NAME = '#E2E8F0'
export const MUTED = '#A0AEC0' // 연회색: %, ↻, GB
export const SEP = '#4A5568'
export const ORANGE = '#ED8936'
export const DOT_BG = '#262E4A'
export const DOT = '#6B7590'

export const HEIGHT = 28 // px
export const FONT = 13 // px
export const BAR_MAX = 120 // px
const CH = FONT * 0.6 // monospace advance at 13px
const ICON = 18
const GAP = 6
const PAD = 10
const SEP_W = CH * 3
const BAR_MIN_WITH_TAIL = 24
const BAR_MIN = 8

const T_BAR_MAX = 20 // cells
const T_BAR_MIN_WITH_TAIL = 6
const T_BAR_MIN = 3

export type Cell = {
  icon: string
  name: string // '' draws no name (🔋)
  pct: number | null
  tail?: string // shown after %, hidden first when room runs out (↻…, 11.2/16GB)
  color: string
  noBar?: boolean
}

export function weather(pct: number | null): string {
  if (pct === null) return '☀'
  if (pct < 50) return '☀'
  if (pct < 70) return '☁'
  if (pct < 85) return '☂'
  return '⚡'
}

export function formatReset(resetsAt: string | null, now: number): string | null {
  if (resetsAt === null) return null
  const at = Date.parse(resetsAt)
  if (!Number.isFinite(at)) return null
  const mins = Math.max(0, Math.floor((at - now) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d >= 1) return `${d}d${h}h`
  if (h >= 1) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}m`
}

export const pctText = (p: number | null) => (p === null ? '–' : `${Math.round(p)}%`)
export const resetText = (r: string | null) => `↻${r ?? '–'}`
export const fillColor = (c: Cell) => (c.pct !== null && c.pct > 80 ? ORANGE : c.color)

function win(w: UsageWindow | null, now: number) {
  return { pct: w ? w.pct : null, tail: resetText(w ? formatReset(w.resetsAt, now) : null) }
}

export function cells(snap: UsageSnap | null, now: number): Cell[] {
  const s = win(snap?.session ?? null, now)
  const w = win(snap?.week ?? null, now)
  const c = snap?.context ?? null
  return [
    { icon: '⏱', name: 'SESSION', pct: s.pct, tail: s.tail, color: '#2CC4C4' },
    { icon: '📅', name: 'WEEK', pct: w.pct, tail: w.tail, color: '#48BB78' },
    { icon: weather(c), name: 'CONTEXT', pct: c, color: '#90CDF4' },
  ]
}

const GIB = 1024 ** 3
function gb(bytes: number): string {
  const v = bytes / GIB
  return Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : v.toFixed(1)
}

export function sysCells(sys: SysSnap | null): Cell[] {
  const used = sys?.ramUsed ?? null
  const total = sys?.ramTotal ?? null
  const ramPct = used !== null && total ? (used / total) * 100 : null
  const ramTail = `${used === null ? '–' : gb(used)}/${total === null ? '–' : gb(total)}GB`
  return [
    { icon: '🖥', name: 'CPU', pct: sys?.cpu ?? null, color: '#B794F4' },
    { icon: '🧠', name: 'RAM', pct: ramPct, tail: ramTail, color: '#63B3ED' },
    { icon: '🔋', name: '', pct: sys?.battery ?? null, color: '#48BB78', noBar: true },
  ]
}

type Fit = { bar: number; showTail: boolean }

/** Bar width and whether tails show, given a row's fixed cost and its bar count. */
function fit(avail: number, fixed: (t: boolean, b: boolean) => number, n: number,
  max: number, minWithTail: number, min: number): Fit {
  if (n === 0) return { bar: 0, showTail: fixed(true, false) <= avail }
  const withTail = Math.floor((avail - fixed(true, true)) / n)
  if (withTail >= minWithTail) return { bar: Math.min(max, withTail), showTail: true }
  const without = Math.floor((avail - fixed(false, true)) / n)
  // Last resort, so the line never folds: no bar at all (clipped/truncated past that).
  return { bar: without >= min ? Math.min(max, without) : 0, showTail: false }
}

/** One bar width for every row, so all bars line up the same; tails decided per row. */
function fitRows(rows: Cell[][], one: (cs: Cell[]) => Fit, total: (cs: Cell[], f: Fit) => number) {
  const fits = rows.map(one)
  const bars = fits.filter((_, i) => rows[i]!.some(c => !c.noBar)).map(f => f.bar)
  const bar = bars.length ? Math.min(...bars) : 0
  return rows.map((cs, i) => {
    const f = { bar, showTail: fits[i]!.showTail }
    return { ...f, total: total(cs, f) }
  })
}

// ---- desktop: pixels ----

function segPx(c: Cell, showTail: boolean, showBar: boolean, bar = 0): number {
  let w = ICON + GAP
  if (c.name) w += c.name.length * CH + GAP
  if (showBar && !c.noBar) w += CH + bar + CH + GAP
  w += pctText(c.pct).length * CH
  if (showTail && c.tail !== undefined) w += GAP + c.tail.length * CH
  return w
}

const rowPx = (cs: Cell[], t: boolean, b: boolean, bar = 0) =>
  cs.reduce((a, c) => a + segPx(c, t, b, bar), 0) + SEP_W * (cs.length - 1) + PAD * 2

export function fitPx(rows: Cell[][], widthPx: number) {
  const nBars = (cs: Cell[]) => cs.filter(c => !c.noBar).length
  return fitRows(
    rows,
    cs => fit(widthPx, (t, b) => rowPx(cs, t, b), nBars(cs), BAR_MAX, BAR_MIN_WITH_TAIL, BAR_MIN),
    (cs, f) => rowPx(cs, f.showTail, f.bar > 0, f.bar),
  )
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export function svg(cs: Cell[], widthPx: number, f: Fit & { total: number }) {
  const { bar, showTail, total } = f
  const width = Math.ceil(Math.min(widthPx, total))
  const mid = HEIGHT / 2
  const t = (x: number, s: string, fill: string, bold = false) =>
    `<text x="${x.toFixed(1)}" y="${mid}" fill="${fill}"${bold ? ' font-weight="700"' : ''}>${esc(s)}</text>`
  const parts: string[] = []
  let x = PAD
  cs.forEach((c, i) => {
    if (i > 0) {
      parts.push(t(x + CH, '│', SEP))
      x += SEP_W
    }
    parts.push(t(x, c.icon, NAME))
    x += ICON + GAP
    if (c.name) {
      parts.push(t(x, c.name, NAME, true))
      x += c.name.length * CH + GAP
    }
    if (bar > 0 && !c.noBar) {
      parts.push(t(x, '[', MUTED))
      x += CH
      const filled = c.pct === null ? 0 : Math.round((Math.min(100, Math.max(0, c.pct)) / 100) * bar)
      const by = mid - 5
      parts.push(`<rect x="${x.toFixed(1)}" y="${by}" width="${bar}" height="10" fill="url(#dots)"/>`)
      if (filled > 0)
        parts.push(`<rect x="${x.toFixed(1)}" y="${by}" width="${filled}" height="10" fill="${fillColor(c)}"/>`)
      x += bar
      parts.push(t(x, ']', MUTED))
      x += CH + GAP
    }
    const p = pctText(c.pct)
    parts.push(t(x, p, MUTED))
    x += p.length * CH
    if (showTail && c.tail !== undefined) {
      x += GAP
      parts.push(t(x, c.tail, MUTED))
      x += c.tail.length * CH
    }
  })
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">` +
    `<defs><pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse">` +
    `<rect width="4" height="4" fill="${DOT_BG}"/><circle cx="2" cy="2" r="0.9" fill="${DOT}"/></pattern></defs>` +
    `<rect width="${width}" height="${HEIGHT}" fill="${BG}"/>` +
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="${FONT}" dominant-baseline="central" white-space="pre">` +
    parts.join('') +
    `</g></svg>`
  return { source, width, alt: altText(cs, showTail) }
}

export function altText(cs: Cell[], showTail = true): string {
  return cs
    .map(c => {
      const tail = showTail && c.tail !== undefined ? ` ${c.tail}` : ''
      return `${c.icon}${c.name ? ` ${c.name}` : ''} ${pctText(c.pct)}${tail}`
    })
    .join(' │ ')
}

// ---- terminal: cells ----

function segCells(c: Cell, showTail: boolean, showBar: boolean, bar = 0): number {
  // icon counted as 2 cells (emoji may be wide), then a space
  let w = 2 + 1
  if (c.name) w += c.name.length + 1
  if (showBar && !c.noBar) w += 2 + bar + 1
  w += pctText(c.pct).length
  if (showTail && c.tail !== undefined) w += 1 + c.tail.length
  return w
}

const rowCells = (cs: Cell[], t: boolean, b: boolean, bar = 0) =>
  cs.reduce((a, c) => a + segCells(c, t, b, bar), 0) + 3 * (cs.length - 1) + 2

export function fitCells(rows: Cell[][], columns: number) {
  const nBars = (cs: Cell[]) => cs.filter(c => !c.noBar).length
  return fitRows(
    rows,
    cs => fit(columns, (t, b) => rowCells(cs, t, b), nBars(cs), T_BAR_MAX, T_BAR_MIN_WITH_TAIL, T_BAR_MIN),
    (cs, f) => rowCells(cs, f.showTail, f.bar > 0, f.bar),
  )
}

export function textBar(c: Cell, width: number): { full: string; empty: string } {
  const n = c.pct === null ? 0 : Math.round((Math.min(100, Math.max(0, c.pct)) / 100) * width)
  return { full: '█'.repeat(n), empty: '░'.repeat(width - n) }
}
