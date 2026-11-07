import { expect, test } from 'claude-code/testing'

import { BAR_MAX, cells, fitCells, fitPx, svg, sysCells, weather } from '../hooks/layout'
import { parseBattery, parseCpu, parseVmUsed } from '../hooks/sys'

const NOW = Date.parse('2026-11-08T10:00:00Z')
const USAGE = {
  startedAt: 0,
  context: { tokens: 28000, window: 200000, percent: 14 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 54, resetsAt: '2026-11-08T12:00:00Z' },
    { kind: 'seven_day', percentUsed: 24, resetsAt: '2026-11-13T03:00:00Z' },
  ],
}

const VM = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                     4199.
Pages active:                                  70419.
Pages inactive:                                63212.
Pages wired down:                             141526.
Pages occupied by compressor:                 202226.
`
const BATT = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=24051811)\t80%; AC attached; not charging present: true
`
const OUTPUT: Record<string, string> = {
  'hw.ncpu': '8\n',
  'hw.memsize': '8589934592\n',
  '%cpu=': ' 12.0\n 40.0\n  2.5\n',
  '/usr/bin/vm_stat': VM,
  '-g': BATT,
}

const band = (surface: 'terminal' | 'desktop', bodyColumns: number) => ({
  plugin: 'usage-band',
  component: 'AbovePrompt',
  surface,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
}) as const

const ran: string[][] = []
function engine(on: any, usage: unknown = USAGE, failSys = false) {
  on('session.usage', () => ({ value: usage }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('process.run', (_: unknown, e: any) => {
    const argv: string[] = e.argv
    ran.push(argv)
    if (failSys) return { value: { exitCode: 1, stdout: '', stderr: 'no' } }
    const key = Object.keys(OUTPUT).find(k => argv.includes(k)) ?? ''
    return { value: { exitCode: 0, stdout: OUTPUT[key] ?? '', stderr: '' } }
  })
}

test('parsers read real macOS output', () => {
  expect(Math.round(parseCpu(OUTPUT['%cpu=']!, 8)! * 100)).toBe(681)
  expect(parseVmUsed(VM)).toBe((70419 + 141526 + 202226) * 16384)
  expect(parseBattery(BATT)).toBe(80)
  expect(parseBattery('Now drawing from \'AC Power\'\n')).toBe(null)
  expect(parseCpu('', 8)).toBe(null)
})

test('two lines, one each, wide and narrow, with local figures only', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // only local commands, by absolute path; nothing over the network
  expect(ran.every(a => a[0]!.startsWith('/usr/') || a[0]!.startsWith('/bin/'))).toBe(true)

  for (const cols of [200, 120, 90, 70, 60]) {
    const term = await $.ui.mount(band('terminal', cols))
    const usage = (await term.find({ type: 'Text', text: /SESSION/ }))?.text ?? ''
    const sys = (await term.find({ type: 'Text', text: /CPU/ }))?.text ?? ''
    for (const text of [usage, sys]) {
      expect(text.includes('\n')).toBe(false)
      expect([...text].length + 3).toBeLessThanOrEqual(cols)
    }
    expect(usage).toContain('54%')
    expect(sys).toContain('7%') // CPU
    expect(sys).toContain('🔋 80%')
    if (cols >= 120) expect(sys).toContain('6.3/8GB')
    await term.unmount()

    const desk = await $.ui.mount(band('desktop', cols))
    const pics = await desk.findAll({ type: 'Svg' })
    expect(pics).toHaveLength(4) // usage, computer, dog, 클꾸미
    const usagePic = pics.find(p => String(p.props.alt).includes('SESSION'))
    const sysPic = pics.find(p => String(p.props.alt).includes('CPU'))
    expect(usagePic && sysPic).toBeTruthy()
    for (const pic of [usagePic, sysPic]) {
      expect(pic?.props.height).toBe(28)
      expect(pic!.props.width as number).toBeLessThanOrEqual(cols * 7.2)
    }
    expect(String(sysPic?.props.alt)).toContain('RAM 79%')
    await desk.unmount()
  }
})

test('bars line up: both rows share one width; shrink, then tails hide', () => {
  const cs = cells({ session: { pct: 54, resetsAt: '2026-11-08T12:00:00Z' }, week: { pct: 24, resetsAt: '2026-11-13T03:00:00Z' }, context: 14 }, NOW)
  expect(cs[0]?.tail).toBe('↻2h00')
  expect(cs[1]?.tail).toBe('↻4d17h')
  const sys = sysCells({ cpu: 23, ramUsed: 11.2 * 1024 ** 3, ramTotal: 16 * 1024 ** 3, battery: 82 })
  expect(sys[1]?.tail).toBe('11.2/16GB')
  const rows = [cs, sys]

  const wide = fitPx(rows, 1600)
  expect(wide.map(f => f.bar)).toEqual([BAR_MAX, BAR_MAX])
  expect(wide.every(f => f.showTail)).toBe(true)
  for (const w of [640, 470]) {
    const f = fitPx(rows, w)
    expect(f[0]!.bar).toBe(f[1]!.bar)
    expect(f.every(r => r.total <= w)).toBe(true)
  }
  expect(fitPx(rows, 470)[0]!.showTail).toBe(false)
  expect(svg(sys, 300, fitPx(rows, 300)[1]!).width).toBeLessThanOrEqual(300)

  expect(fitCells(rows, 200).map(f => f.bar)).toEqual([20, 20])
  expect(fitCells(rows, 60).every(f => f.total <= 60)).toBe(true)
})

test('over 80% turns that bar orange; weather icon steps', () => {
  const cs = cells({ session: { pct: 81, resetsAt: null }, week: { pct: 80, resetsAt: null }, context: 90 }, NOW)
  const src = svg(cs, 1600, fitPx([cs], 1600)[0]!).source
  expect(src).toContain('#ED8936')
  expect(src).toContain('#48BB78')
  expect([weather(49), weather(50), weather(70), weather(85)]).toEqual(['☀', '☁', '☂', '⚡'])
})

test('too narrow: lines truncate, never wrap', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(band('terminal', 40))
  expect((await ui.find({ type: 'Text', text: /SESSION/ }))?.props.wrap).toBe('truncate-end')
  expect((await ui.find({ type: 'Text', text: /CPU/ }))?.props.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('missing figures are drawn as –, never invented', async ($, on) => {
  engine(on, { startedAt: 0, context: { window: 200000 }, rateLimits: [] }, true)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(band('terminal', 160))
  const usage = (await ui.find({ type: 'Text', text: /SESSION/ }))?.text ?? ''
  const sys = (await ui.find({ type: 'Text', text: /CPU/ }))?.text ?? ''
  expect(usage).toContain('↻–')
  expect(usage).not.toMatch(/\d+%/)
  expect(sys).toContain('–/–GB')
  expect(sys).toContain('🔋 –')
  expect(sys).not.toMatch(/\d+%/)
  await ui.unmount()
})

// ---- walking dog ----
import { DOG, DOG_STEP, isFinished, labelText, progress, stepToward, walkSvg } from '../hooks/walk'

const TODO = `# 오늘 할 일
- [x] a
- [x] b
- [ ] c
- [ ] d
- [ ] e
`

test('the dog is the given map, 30×18; walking changes only the two leg rows', () => {
  expect(DOG).toHaveLength(9)
  expect(DOG.every(r => r.length === 15)).toBe(true)
  expect(DOG_STEP.slice(0, 7)).toEqual(DOG.slice(0, 7))
  expect(DOG_STEP[7]).not.toBe(DOG[7])
  expect(DOG_STEP[8]).not.toBe(DOG[8])
  const src = walkSvg({ done: 2, total: 5, pos: 0.4, target: 0.4, frame: 0, isWalking: false }, 600).source
  expect(src).toContain('height="28"')
  expect((src.match(/width="2" height="2"/g) ?? []).length).toBe(DOG.join('').replace(/\./g, '').length)
  expect(src).toContain('2/5 · 40%')
  expect(src).toContain('#B07A42')
  expect(src).not.toContain('🎉')
})

test('checklist counts; missing is –', () => {
  expect(progress(TODO)).toEqual({ done: 2, total: 5 })
  expect(labelText(null)).toBe('–')
})

test('walking: legs alternate until it arrives, then it stands', () => {
  let w = { done: 3, total: 5, pos: 0.4, target: 0.6, frame: 0 as 0 | 1, isWalking: false }
  const frames: number[] = []
  for (let i = 0; i < 50; i++) {
    const n = stepToward(w)
    if (!n) break
    frames.push(n.frame)
    w = n
  }
  expect(w.pos).toBe(0.6)
  expect(w.frame).toBe(0)
  expect(w.isWalking).toBe(false)
  expect(frames.slice(0, 4)).toEqual([1, 0, 1, 0])
})

test('100%: stops next to the flag with 🎉', () => {
  const w = { done: 5, total: 5, pos: 1, target: 1, frame: 0 as 0 | 1, isWalking: false }
  expect(isFinished(w)).toBe(true)
  const src = walkSvg(w, 600).source
  expect(src).toContain('🎉')
  expect(src).toContain('5/5 · 100%')
})

test('the dog band sits under the two status rows, on both surfaces', async ($, on) => {
  engine(on)
  on('fs.read', () => ({ value: TODO }))
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  const desk = await $.ui.mount(band('desktop', 120))
  const pics = await desk.findAll({ type: 'Svg' })
  expect(pics).toHaveLength(4)
  expect(String(pics[2]?.props.alt)).toContain('2/5 · 40%')
  expect(pics[2]?.props.height).toBe(28)
  await desk.unmount()
  const term = await $.ui.mount(band('terminal', 80))
  const line = await term.find({ type: 'Text', text: /🏠/ })
  expect(line?.text).toContain('2/5 · 40%')
  expect(line?.props.wrap).toBe('truncate-end')
  await term.unmount()
})
