import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { PetState, SysSnap, UsageSnap, UsageWindow, WalkState } from '../types'
import type { Cell } from './layout'
import {
  BG, HEIGHT, MUTED, NAME, SEP,
  cells, fillColor, fitCells, fitPx, pctText, svg, sysCells, textBar,
} from './layout'
import { parseBattery, parseCpu, parseInt0, parseVmUsed } from './sys'
import { BAND_H, LABEL, REST, TRAIL, progress, stepToward, walkSvg, walkText } from './walk'
import { PET_ROW_H, petSvg, petText, restore, toSaved } from './pet'
import { CHIP_STYLE, chips } from './next'
import { DEFAULT_HOURS, parseArgs, parseTz } from './leave'
import type { WorkHours } from './leave'
import type { Chip } from './next'

const snapAtom = atom({ plugin: 'usage-band', key: 'snap' } as const, null)
const sysAtom = atom({ plugin: 'usage-band', key: 'sys' } as const, null)
const walkAtom = atom({ plugin: 'usage-band', key: 'walk' } as const, null)
const petAtom = atom({ plugin: 'usage-band', key: 'pet' } as const, null)
const todoAtom = atom({ plugin: 'usage-band', key: 'todo' } as const, null)
const workAtom = atom({ plugin: 'usage-band', key: 'work' } as const, null)

const CHECKLIST = '오늘_할일.md'
const CHECK_EVERY_MS = 1000
const STEP_MS = 120

// Desktop cells are measured in the code font's advance; a slightly small
// guess keeps the drawing inside the slot rather than scaled or clipped.
const DESKTOP_CELL_PX = 7.2
const SYS_EVERY_MS = 5000

function toWindow(limits: SessionRateLimit[], kind: string): UsageWindow | null {
  const w = limits.find(l => l.kind === kind)
  if (!w || !Number.isFinite(w.percentUsed)) return null
  return { pct: w.percentUsed, resetsAt: w.resetsAt ?? null }
}

function toSnap(context: SessionContextUsage, limits: SessionRateLimit[]): UsageSnap {
  return {
    session: toWindow(limits, 'five_hour'),
    week: toWindow(limits, 'seven_day'),
    context: typeof context.percent === 'number' ? context.percent : null,
  }
}

async function refresh($: EngineInterface) {
  try {
    const u = await $.session.usage()
    const snap = toSnap(u.context, u.rateLimits)
    await update($, snapAtom, () => snap)
  } catch {
    // Unreadable: leave what we had; never invent figures.
  }
}

// ---- computer status: local commands only, nothing leaves the machine ----

async function out($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(argv, { timeoutMs: 4000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

async function readSys($: EngineInterface): Promise<SysSnap> {
  const [ncpu, memsize, ps, vm, batt] = await Promise.all([
    out($, ['/usr/sbin/sysctl', '-n', 'hw.ncpu']),
    out($, ['/usr/sbin/sysctl', '-n', 'hw.memsize']),
    out($, ['/bin/ps', '-A', '-o', '%cpu=']),
    out($, ['/usr/bin/vm_stat']),
    out($, ['/usr/bin/pmset', '-g', 'batt']),
  ])
  return {
    cpu: ps === null ? null : parseCpu(ps, ncpu === null ? null : parseInt0(ncpu)),
    ramUsed: vm === null ? null : parseVmUsed(vm),
    ramTotal: memsize === null ? null : parseInt0(memsize),
    battery: batt === null ? null : parseBattery(batt),
  }
}

async function sampleSys($: EngineInterface) {
  const sys = await readSys($)
  await update($, sysAtom, () => sys)
}

let fileTimer: { cancel: () => void } | null = null
let stepTimer: { cancel: () => void } | null = null
let lastText: string | null | undefined
let sessionCwd: string | null = null

// Read the checklist; on a change, set the new target and walk there.
async function checkList($: EngineInterface, cwd: string, isFirst: boolean) {
  let text: string | null
  try {
    text = (await $.fs.read(`${cwd}/${CHECKLIST}`)) as string
  } catch {
    text = null // missing: shown as '–'
  }
  if (text === lastText) return
  lastText = text
  await update($, todoAtom, () => text)
  const p = text === null ? null : progress(text)
  const done = p?.done ?? 0
  const total = p?.total ?? 0
  const target = total ? done / total : 0
  const prev = (await read($, walkAtom)) as WalkState | null
  if (isFirst || prev === null) {
    await update($, walkAtom, () => ({ done, total, pos: target, target, frame: 0, isWalking: false }))
    return
  }
  await update($, walkAtom, () => ({ ...prev, done, total, target }))
  if (prev.pos !== target) startWalking($)
}

function startWalking($: EngineInterface) {
  stepTimer?.cancel()
  stepTimer = $.clock.every(STEP_MS, () => {
    void (async () => {
      const w = (await read($, walkAtom)) as WalkState | null
      const next = w && stepToward(w)
      if (!next) {
        stepTimer?.cancel()
        stepTimer = null
        if (w && (w.frame !== 0 || w.isWalking)) await update($, walkAtom, () => ({ ...w, frame: 0, isWalking: false }))
        return
      }
      await update($, walkAtom, () => next)
    })()
  })
}


// ---- 클꾸미 ----
// Saved to ~/.claude/klkkumi.json so it outlives the conversation.
const EAT_MS = 1000
const HEART_MS = 3000
const SAD_MS = 3 * 60 * 1000
const PET_TICK_MS = 30 * 1000
const ANIM_MS = 350 // mouth flips while eating, head nods while dozing
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

let petFile: string | null = null
let petTimer: { cancel: () => void } | null = null
let animTimer: { cancel: () => void } | null = null

async function today($: EngineInterface): Promise<string> {
  const d = (await out($, ['/bin/date', '+%F']))?.trim()
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

async function loadPet($: EngineInterface) {
  const home = (await out($, ['/usr/bin/printenv', 'HOME']))?.trim()
  petFile = home ? `${home}/.claude/klkkumi.json` : null
  let saved: unknown = null
  if (petFile) {
    try {
      saved = JSON.parse((await $.fs.read(petFile)) as string)
    } catch {
      saved = null // first time: a fresh pet
    }
  }
  const p = restore(saved, await today($), await $.clock.now())
  await update($, petAtom, () => p)
  await savePet($, p)
}

async function savePet($: EngineInterface, p: PetState) {
  if (!petFile) return
  try {
    await $.fs.write(petFile, JSON.stringify(toSaved(p)) + '\n')
  } catch {
    // could not save; the pet still shows
  }
}

async function changePet($: EngineInterface, fn: (p: PetState, now: number) => PetState, save = false) {
  const now = await $.clock.now()
  const cur = (await read($, petAtom)) as PetState | null
  if (!cur) return
  const next = fn(cur, now)
  await update($, petAtom, () => next)
  if (save) await savePet($, next)
}

const isSleepyNow = async ($: EngineInterface) => {
  const snap = (await read($, snapAtom)) as UsageSnap | null
  return !!snap?.session && snap.session.pct > 80
}

// Short animations: mouth while eating, head nodding while dozing.
function animate($: EngineInterface) {
  animTimer?.cancel()
  animTimer = $.clock.every(ANIM_MS, () => {
    void (async () => {
      const now = await $.clock.now()
      const p = (await read($, petAtom)) as PetState | null
      if (!p) return
      const eating = p.eatingUntil > now
      const sleepy = (await isSleepyNow($)) || (p.test?.mood === 'sleepy' && p.test.until > now)
      const heart = p.heartUntil > now
      if (!eating && !sleepy && !heart) {
        animTimer?.cancel()
        animTimer = null
        await update($, petAtom, () => ({ ...p, frame: 0 }))
        return
      }
      const flip = eating || sleepy
      await update($, petAtom, () => ({ ...p, frame: flip ? (p.frame ? 0 : 1) : p.frame }))
    })()
  })
}

// Trial switch: data/test-mood.json = { "mood": "hungry" | "sleepy", "until": <ms> }.
// Shows that mood until the time passes, then the pet goes back by itself.
async function checkTestMood($: EngineInterface) {
  let t: { mood: 'hungry' | 'sleepy'; until: number } | null = null
  try {
    const j = JSON.parse((await $.fs.read(`${$.plugin.root}/data/test-mood.json`)) as string)
    if ((j.mood === 'hungry' || j.mood === 'sleepy') && typeof j.until === 'number') t = { mood: j.mood, until: j.until }
  } catch {
    t = null
  }
  const now = await $.clock.now()
  if (t && t.until <= now) t = null
  const p = (await read($, petAtom)) as PetState | null
  if (!p) return
  const cur = p.test ?? null
  if (JSON.stringify(cur) === JSON.stringify(t)) return
  await update($, petAtom, (): PetState => ({ ...p, test: t, frame: 0 }))
  if (t?.mood === 'sleepy') animate($)
}

async function petTick($: EngineInterface) {
  const d = await today($)
  await changePet($, p => (d && d !== p.date ? { ...p, date: d, meals: 0 } : { ...p }), true)
  if (await isSleepyNow($)) animate($)
}

async function feed($: EngineInterface) {
  const d = await today($)
  await changePet($, (p, now) => ({
    ...p,
    date: d || p.date,
    meals: (d && d !== p.date ? 0 : p.meals) + 1,
    eatingUntil: now + EAT_MS,
    sadUntil: 0,
    lastActivity: now,
  }), true)
  animate($)
}

async function poke($: EngineInterface) {
  await changePet($, (p, now) => ({ ...p, lastActivity: now }), true)
}

// ---- 퇴근 카운터 ----
// Hours saved in ~/.claude/workhours.json so a new conversation keeps them.
let workFile: string | null = null
let workTimer: { cancel: () => void } | null = null

async function loadWork($: EngineInterface) {
  if (!workFile) {
    const home = (await out($, ['/usr/bin/printenv', 'HOME']))?.trim()
    workFile = home ? `${home}/.claude/workhours.json` : null
  }
  let hours: WorkHours = DEFAULT_HOURS
  let testWeekday = false // trial switch: treats a weekend as a workday, for a live test only
  if (workFile) {
    try {
      const j = JSON.parse((await $.fs.read(workFile)) as string)
      const ok = parseArgs(`${j.start} ${j.end}`)
      if (typeof ok !== 'string') hours = ok
      testWeekday = j.testWeekday === true
    } catch {
      // no file yet: 09:00 ~ 18:00
    }
  }
  const z = await out($, ['/bin/date', '+%z'])
  const tz = z === null ? null : parseTz(z)
  const cur = (await read($, workAtom)) as { start: string; end: string; tz: number | null; testWeekday?: boolean } | null
  if (!cur || cur.start !== hours.start || cur.end !== hours.end || cur.tz !== tz || (cur.testWeekday ?? false) !== testWeekday) {
    await update($, workAtom, () => ({ ...hours, tz, testWeekday }))
  }
}

export const register: Register = on => {
  let timer: { cancel: () => void } | null = null
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    await sampleSys($)
    timer?.cancel()
    timer = $.clock.every(SYS_EVERY_MS, () => void sampleSys($))
    lastText = undefined
    sessionCwd = e.cwd
    await checkList($, e.cwd, true)
    fileTimer?.cancel()
    fileTimer = $.clock.every(CHECK_EVERY_MS, () => {
      void checkList($, e.cwd, false)
      void checkTestMood($)
    })
    await loadPet($)
    await loadWork($)
    workTimer?.cancel()
    workTimer = $.clock.every(5000, () => void loadWork($))
    await $.command.register({ name: 'workhours', description: '출근·퇴근 시각 바꾸기 (예: /workhours 09:00 18:30)', argumentHint: '09:00 18:30' })
    petTimer?.cancel()
    petTimer = $.clock.every(PET_TICK_MS, () => void petTick($))
    return r
  })

  // Re-read after every answer; 클꾸미 shows a heart.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await refresh($)
    if (sessionCwd) {
      lastText = undefined // read the checklist again after every answer
      await checkList($, sessionCwd, false)
    }
    await changePet($, (p, now) => ({ ...p, heartUntil: now + HEART_MS, lastActivity: now }), true)
    animate($)
    return r
  })

  on('command.run', { command: 'workhours' }, async ($, e) => {
    if (!e.args.trim()) {
      const w = (await read($, workAtom)) as { start: string; end: string } | null
      return { text: `지금은 출근 ${w?.start ?? DEFAULT_HOURS.start} · 퇴근 ${w?.end ?? DEFAULT_HOURS.end}이에요. 바꾸려면: /workhours 09:00 18:30` }
    }
    const hours = parseArgs(e.args)
    if (typeof hours === 'string') return { text: hours }
    if (!workFile) await loadWork($)
    if (!workFile) return { text: '저장할 곳(HOME)을 찾지 못했어요.' }
    await $.fs.write(workFile, JSON.stringify(hours) + '\n')
    await loadWork($)
    return { text: `출근 ${hours.start} · 퇴근 ${hours.end}으로 저장했어요. 새 대화에서도 그대로예요.` }
  })

  on('prompt.submit', async ($, e, next) => {
    await poke($)
    return next(e)
  })

  // A file made or changed: a meal. A failed tool: a sulk.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if ('isError' in r && r.isError) {
      await changePet($, (p, now) => ({ ...p, sadUntil: now + SAD_MS, lastActivity: now }))
    } else if ('deny' in r && r.deny !== undefined) {
      await poke($)
    } else if (FILE_TOOLS.has(e.tool)) {
      await feed($)
    } else {
      await changePet($, (p, now) => ({ ...p, sadUntil: 0, lastActivity: now }))
    }
    return r
  })

  // Pushed figures between turns (a rate-limit window moving a point).
  on('session.measure', async ($, e, next) => {
    const snap = toSnap(e.context, e.rateLimits)
    await update($, snapAtom, () => snap)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const snap = (await read($, snapAtom)) as UsageSnap | null
    const sys = (await read($, sysAtom)) as SysSnap | null
    const walk = (await read($, walkAtom)) as WalkState | null
    const pet = (await read($, petAtom)) as PetState | null
    const todo = (await read($, todoAtom)) as string | null
    const now = await $.clock.now()
    const work = (await read($, workAtom)) as { start: string; end: string; tz: number | null; testWeekday?: boolean } | null
    const { Box: LBox, Client } = $.ui.resolve(e) as { Box: any; Client: any }
    const leaveRow = (
      <LBox flexDirection="row" justifyContent="flex-end">
        <Client key="leave" module="./leave-client.tsx" props={{
          now,
          tz: work ? work.tz : null,
          testWeekday: work?.testWeekday === true,
          hours: work ? { start: work.start, end: work.end } : DEFAULT_HOURS,
        }} />
      </LBox>
    )
    const next3 = chips(todo)
    const { Box: CBox, Text: CText, Button: CButton } = $.ui.resolve(e)
    const chipRow = (
      <CBox flexDirection="row" alignItems="center" columnGap={1}>
        <CText color="#718096">다음 할 일</CText>
        {next3.map((c: Chip, i: number) => {
          const st = i === 0 ? CHIP_STYLE.first : CHIP_STYLE.rest
          return (
            <CBox borderStyle="round" borderColor={st.border} backgroundColor={st.bg} paddingX={1}>
              <CButton key={c.key} plain onPress={() => void $.prompt.fill({ text: c.prompt, mode: 'replace' })}>
                <CText bold color={st.text} backgroundColor={st.bg}>{c.label}</CText>
              </CButton>
            </CBox>
          )
        })}
      </CBox>
    )
    const sleepy = !!snap?.session && snap.session.pct > 80
    const rows = [cells(snap, now), sysCells(sys)]
    const ui = $.ui.resolve(e)

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Box, Svg } = ui
      const widthPx = e.props.bodyColumns * DESKTOP_CELL_PX
      const fits = fitPx(rows, widthPx)
      return (
        <Box flexDirection="column">
          {leaveRow}
          {rows.map((cs, i) => {
            const drawn = svg(cs, widthPx, fits[i]!)
            return <Svg source={drawn.source} alt={drawn.alt} width={drawn.width} height={HEIGHT} />
          })}
          {chipRow}
          {(() => {
            const dog = walkSvg(walk, widthPx)
            return <Svg source={dog.source} alt={dog.alt} width={dog.width} height={BAND_H} />
          })()}
          {(() => {
            const kk = petSvg(pet, now, sleepy)
            return <Svg source={kk.source} alt={kk.alt} width={kk.width} height={PET_ROW_H} />
          })()}
        </Box>
      )
    }

    // Terminal: the same lines in █ ░ characters.
    const { Box, Text } = ui
    const fits = fitCells(rows, e.props.bodyColumns)
    const line = (cs: Cell[], bar: number, showTail: boolean) => (
      <Box flexDirection="row" backgroundColor={BG}>
        <Text wrap="truncate-end" backgroundColor={BG}>
          {' '}
          {cs.map((c, i) => {
            const b = textBar(c, bar)
            const hasBar = bar > 0 && !c.noBar
            return (
              <Text>
                {i > 0 ? <Text color={SEP}> │ </Text> : ''}
                <Text color={NAME}>{c.icon} </Text>
                {c.name ? <Text color={NAME} bold>{c.name} </Text> : ''}
                {hasBar ? <Text color={MUTED}>[</Text> : ''}
                {hasBar ? <Text color={fillColor(c)}>{b.full}</Text> : ''}
                {hasBar ? <Text color={SEP}>{b.empty}</Text> : ''}
                {hasBar ? <Text color={MUTED}>] </Text> : ''}
                <Text color={MUTED}>{pctText(c.pct)}</Text>
                {showTail && c.tail !== undefined ? <Text color={MUTED}> {c.tail}</Text> : ''}
              </Text>
            )
          })}
          {' '}
        </Text>
      </Box>
    )
    return (
      <Box flexDirection="column">
        {leaveRow}
        {rows.map((cs, i) => line(cs, fits[i]!.bar, fits[i]!.showTail))}
        {chipRow}
        {(() => {
          const d = walkText(walk, e.props.bodyColumns)
          return (
            <Box flexDirection="row">
              <Text wrap="truncate-end">
                🏠 <Text color={TRAIL}>{d.trail}</Text>🐕<Text color={REST}>{d.rest}</Text>
                <Text color={LABEL}>{d.right}</Text>
              </Text>
            </Box>
          )
        })()}
        <Box flexDirection="row">
          <Text wrap="truncate-end" color={LABEL}>{petText(pet, now, sleepy)}</Text>
        </Box>
      </Box>
    )
  })
}
