import { expect, test } from 'claude-code/testing'

import { leaveText, parseArgs, parseTz, thinBar, view } from '../hooks/leave'

const KST = 9 * 60
// Example data: Monday 2026-11-09 in Seoul, hours 09:00 ~ 18:00.
const at = (hhmmss: string, day = '2026-11-09') => Date.parse(`${day}T${hhmmss}+09:00`)
const H = { start: '09:00', end: '18:00' }

test('a weekday: time left to the second, a thin bar and %', () => {
  const v = view(at('16:17:50'), KST, H)
  expect(v).toMatchObject({ kind: 'working', remainingSec: 6130, pct: 81, isOrange: false, isWrapUp: false })
  expect(leaveText(v)).toBe('🏃 퇴근까지 1:42:10  ▰▰▰▰▰▰▰▰▱▱ 81%')
  expect(thinBar(78)).toBe('▰▰▰▰▰▰▰▰▱▱')
  expect(view(at('08:30:00'), KST, H)).toMatchObject({ kind: 'working', pct: 0 })
})

test('30 min left: orange; 10 min: wrap-up line; quitting time: 🎉 for 3 s; then +h:mm', () => {
  expect(view(at('17:30:00'), KST, H)).toMatchObject({ isOrange: true, isWrapUp: false })
  expect(view(at('17:29:59'), KST, H)).toMatchObject({ isOrange: false })
  const ten = view(at('17:50:00'), KST, H)
  expect(ten).toMatchObject({ isOrange: true, isWrapUp: true })
  expect(leaveText(ten)).toContain('정리할 시간이에요 🧹')
  expect(leaveText(view(at('18:00:00'), KST, H))).toBe('🎉 퇴근!')
  expect(leaveText(view(at('18:00:02'), KST, H))).toBe('🎉 퇴근!')
  expect(leaveText(view(at('18:00:03'), KST, H))).toBe('퇴근 시간 지났어요 🌙 +0:00')
  expect(leaveText(view(at('18:12:30'), KST, H))).toBe('퇴근 시간 지났어요 🌙 +0:12')
})

test('weekends: a day off', () => {
  expect(leaveText(view(at('11:00:00', '2026-11-08'), KST, H))).toBe('오늘은 쉬는 날 ☀') // Sunday
  expect(leaveText(view(at('11:00:00', '2026-11-07'), KST, H))).toBe('오늘은 쉬는 날 ☀') // Saturday
})

test('/workhours parsing and the time zone', () => {
  expect(parseArgs('09:00 18:30')).toEqual({ start: '09:00', end: '18:30' })
  expect(parseArgs('9:00 18:30')).toEqual({ start: '09:00', end: '18:30' })
  expect(typeof parseArgs('18:00 09:00')).toBe('string')
  expect(typeof parseArgs('nine six')).toBe('string')
  expect(parseTz('+0900\n')).toBe(540)
  expect(parseTz('-0430')).toBe(-270)
})

test('the row ticks every second on its own; /workhours saves to the file', async ($, on) => {
  const files: Record<string, string> = {}
  let clockNow = at('17:59:57')
  on('clock.now', () => ({ value: clockNow }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'workhours' } }))
  on('process.run', (_: unknown, e: any) => {
    const a: string[] = e.argv
    const out = a[0] === '/usr/bin/printenv' ? '/Users/test\n' : a.includes('+%z') ? '+0900\n' : ''
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

  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-band', component: 'AbovePrompt', surface,
      props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 140, scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const leave = async () => (await ui.find({ type: 'Text', text: /퇴근|쉬는 날/, in: 'leave' }))!
    expect((await leave()).text).toBe('🏃 퇴근까지 0:00:03  ▰▰▰▰▰▰▰▰▰▰ 99%  정리할 시간이에요 🧹')
    await ui.advance(1000)
    expect((await leave()).text).toBe('🏃 퇴근까지 0:00:02  ▰▰▰▰▰▰▰▰▰▰ 99%  정리할 시간이에요 🧹')
    await ui.advance(2000)
    const party = await leave()
    expect(party.text).toBe('🎉 퇴근!')
    expect(party.props.size).toBe('title')
    await ui.advance(3000)
    expect((await leave()).text).toBe('퇴근 시간 지났어요 🌙 +0:00')
    await ui.unmount()
  }

  const r = await $.command.run({ command: 'workhours', args: '09:00 18:30' } as any)
  expect(r.text).toContain('퇴근 18:30')
  expect(JSON.parse(files['/Users/test/.claude/workhours.json']!)).toEqual({ start: '09:00', end: '18:30' })
  const bad = await $.command.run({ command: 'workhours', args: '18:30 09:00' } as any)
  expect(bad.text).toContain('늦어야')
  clockNow = at('17:00:00')
  const ui = await $.ui.mount({
    plugin: 'usage-band', component: 'AbovePrompt', surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 140, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect((await ui.find({ type: 'Text', text: /퇴근까지/, in: 'leave' }))?.text).toContain('1:30:00')
  await ui.unmount()
})
