// 퇴근 카운터: pure time math. Local time = UTC ms + the machine's offset.
export type WorkHours = { start: string; end: string } // "HH:MM"
export const DEFAULT_HOURS: WorkHours = { start: '09:00', end: '18:00' }

export type LeaveView =
  | { kind: 'weekend' }
  | { kind: 'working'; remainingSec: number; pct: number; isOrange: boolean; isWrapUp: boolean }
  | { kind: 'party' } // the first 3 s at quitting time
  | { kind: 'after'; overSec: number }

export const ORANGE_SEC = 30 * 60
export const WRAPUP_SEC = 10 * 60
export const PARTY_SEC = 3

export function parseHM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** `/workhours 09:00 18:30` → the hours, or why not. */
export function parseArgs(args: string): WorkHours | string {
  const [a, b, extra] = args.trim().split(/\s+/)
  if (!a || !b || extra) return '사용법: /workhours 09:00 18:30'
  const s = parseHM(a)
  const e = parseHM(b)
  if (s === null || e === null) return '시각은 09:00처럼 적어 주세요. 사용법: /workhours 09:00 18:30'
  if (e <= s) return '퇴근 시각이 출근 시각보다 늦어야 해요.'
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { start: fmt(s), end: fmt(e) }
}

/** `date +%z` ("+0900") → minutes. */
export function parseTz(z: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})$/.exec(z.trim())
  if (!m) return null
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

export function view(nowMs: number, tzMin: number, hours: WorkHours, testWeekday = false): LeaveView {
  const local = new Date(nowMs + tzMin * 60000) // read with UTC getters = local wall time
  const dow = local.getUTCDay() // 0 Sun … 6 Sat
  if ((dow === 0 || dow === 6) && !testWeekday) return { kind: 'weekend' }
  const secOfDay = local.getUTCHours() * 3600 + local.getUTCMinutes() * 60 + local.getUTCSeconds()
  const start = (parseHM(hours.start) ?? 540) * 60
  const end = (parseHM(hours.end) ?? 1080) * 60
  if (secOfDay >= end) {
    if (secOfDay < end + PARTY_SEC) return { kind: 'party' }
    return { kind: 'after', overSec: secOfDay - end }
  }
  const remainingSec = end - secOfDay
  const pct = secOfDay <= start ? 0 : Math.floor(((secOfDay - start) / (end - start)) * 100)
  return { kind: 'working', remainingSec, pct, isOrange: remainingSec <= ORANGE_SEC, isWrapUp: remainingSec <= WRAPUP_SEC }
}

export const hms = (sec: number) =>
  `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
export const hm = (sec: number) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`

export function thinBar(pct: number, cells = 10): string {
  const n = Math.round((Math.min(100, Math.max(0, pct)) / 100) * cells)
  return '▰'.repeat(n) + '▱'.repeat(cells - n)
}

/** The line as plain text (what the row draws, and its alt). */
export function leaveText(v: LeaveView): string {
  switch (v.kind) {
    case 'weekend':
      return '오늘은 쉬는 날 ☀'
    case 'party':
      return '🎉 퇴근!'
    case 'after':
      return `퇴근 시간 지났어요 🌙 +${hm(v.overSec)}`
    case 'working':
      return `🏃 퇴근까지 ${hms(v.remainingSec)}  ${thinBar(v.pct)} ${v.pct}%${v.isWrapUp ? '  정리할 시간이에요 🧹' : ''}`
  }
}
