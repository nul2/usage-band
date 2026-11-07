import { expect, test } from 'claude-code/testing'

import { BODY, face, mood, petSvg, restore } from '../hooks/pet'

const DAY = '2026-11-08'
const T0 = Date.parse('2026-11-08T10:00:00Z')

const band = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  surface: 'desktop',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// Example data: a saved pet from today with 2 meals, and a clock the test moves.
function world(on: any, opts: { saved?: unknown; date?: string; fivePct?: number } = {}) {
  const clock = { now: T0 }
  const files: Record<string, string> = {}
  if (opts.saved !== undefined) files['/Users/test/.claude/klkkumi.json'] = JSON.stringify(opts.saved)
  const date = { today: opts.date ?? DAY }
  on('clock.now', () => ({ value: clock.now }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: {
      startedAt: 0, context: { window: 200000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: opts.fivePct ?? 30, resetsAt: '2026-11-08T12:00:00Z' }],
    },
  }))
  on('process.run', (_: unknown, e: any) => {
    const a: string[] = e.argv
    const out = a[0] === '/bin/date' ? `${date.today}\n` : a[0] === '/usr/bin/printenv' ? '/Users/test\n' : ''
    return { value: { exitCode: out ? 0 : 1, stdout: out, stderr: '' } }
  })
  on('fs.read', (_: unknown, e: any) => {
    if (e.path in files) return { value: files[e.path] }
    throw new Error('ENOENT')
  })
  on('fs.write', (_: unknown, e: any) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', (_: unknown, e: any) =>
    e.tool === 'Bash' && e.command === 'false'
      ? { result: {}, text: 'exit 1', isError: true }
      : { result: {}, text: 'ok' })
  return { clock, files, date }
}

const saved = (files: Record<string, string>) => JSON.parse(files['/Users/test/.claude/klkkumi.json']!)
async function petAlt($: any) {
  const ui = await $.ui.mount(band)
  const pics = await ui.findAll({ type: 'Svg' })
  const alt = String(pics.at(-1)?.props.alt)
  await ui.unmount()
  return alt
}

test('the pet is 16×16 dots → 32×32, every face stays inside', () => {
  expect(BODY).toHaveLength(16)
  expect(BODY.every(r => r.length === 16)).toBe(true)
  for (const m of ['happy', 'eating', 'hungry', 'sad', 'sleepy'] as const)
    for (const [x, y] of [...face(m, 0), ...face(m, 1)]) {
      expect(x >= 0 && x < 16 && y >= 0 && y < 16).toBe(true)
    }
  expect(petSvg(null, T0, false).source).toContain('width="2" height="2"')
})

test('saved today: meals kept; a new day: meals 0, the rest kept', () => {
  const s = { date: DAY, meals: 3, lastActivity: T0 - 1000 }
  expect(restore(s, DAY, T0)).toMatchObject({ meals: 3, lastActivity: T0 - 1000 })
  expect(restore(s, '2026-11-09', T0)).toMatchObject({ meals: 0, date: '2026-11-09', lastActivity: T0 - 1000 })
})

test('moods: hungry after 30 min, dozing over 80%, eating first', () => {
  const p = restore({ date: DAY, meals: 1, lastActivity: T0 }, DAY, T0)
  expect(mood(p, T0 + 29 * 60000, false)).toBe('happy')
  expect(mood(p, T0 + 30 * 60000, false)).toBe('hungry')
  expect(mood(p, T0, true)).toBe('sleepy')
  expect(mood({ ...p, eatingUntil: T0 + 1000 }, T0, true)).toBe('eating')
})

test('a day with the example data: eat, heart, sulk, save', async ($, on) => {
  const w = world(on, { saved: { date: DAY, meals: 2, lastActivity: T0 - 60000 } })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(await petAlt($)).toContain('오늘 밥 2 · 기분 좋음')

  // a file is written → a meal, 냠냠 for one second
  await $.tool.call({ tool: 'Write', file_path: '/w/a.md', content: 'hi' })
  expect(await petAlt($)).toContain('오늘 밥 3 · 기분 냠냠')
  expect(saved(w.files).meals).toBe(3)
  w.clock.now += 1001
  expect(await petAlt($)).toContain('오늘 밥 3 · 기분 좋음')

  // a tool fails → 시무룩
  await $.tool.call({ tool: 'Bash', command: 'false' })
  expect(await petAlt($)).toContain('기분 시무룩')

  // an edit succeeds → fed, and the sulk ends
  await $.tool.call({ tool: 'Edit', file_path: '/w/a.md', old_string: 'hi', new_string: 'yo' })
  w.clock.now += 1001
  expect(await petAlt($)).toContain('오늘 밥 4 · 기분 좋음')

  // the answer ends → a heart over the head for a few seconds
  await $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(await petAlt($)).toContain('클꾸미 ♥')
  w.clock.now += 3001
  expect(await petAlt($)).not.toContain('♥')

  // 30 minutes of nothing → 배고픔
  w.clock.now += 30 * 60000
  expect(await petAlt($)).toContain('기분 배고픔')
})

test('over 80% of the 5-hour limit: dozing', async ($, on) => {
  world(on, { saved: { date: DAY, meals: 0, lastActivity: T0 }, fivePct: 85 })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(await petAlt($)).toContain('기분 졸림')
})

test('saved yesterday: opens with 0 meals today', async ($, on) => {
  const w = world(on, { saved: { date: '2026-11-07', meals: 9, lastActivity: T0 - 5000 } })
  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  expect(await petAlt($)).toContain('오늘 밥 0')
  expect(saved(w.files)).toMatchObject({ date: DAY, meals: 0 })
})

test('trial switch: hungry / sleepy for a few seconds, then back', () => {
  const p = restore({ date: DAY, meals: 3, lastActivity: T0 }, DAY, T0)
  const t = { ...p, test: { mood: 'hungry' as const, until: T0 + 3000 } }
  expect(mood(t, T0 + 1000, false)).toBe('hungry')
  expect(mood(t, T0 + 3001, false)).toBe('happy')
  expect(mood({ ...p, test: { mood: 'sleepy', until: T0 + 3000 } }, T0, false)).toBe('sleepy')
})
