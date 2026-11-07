/** One rate-limit window: percent used and when it resets (ISO), or null when unread. */
export type UsageWindow = { pct: number; resetsAt: string | null }

/** What the band shows; every field null when the engine had no reading. */
export type UsageSnap = {
  session: UsageWindow | null
  week: UsageWindow | null
  context: number | null
}

/** This computer, read locally every 5 s; null where a reading failed. */
export type SysSnap = {
  cpu: number | null
  ramUsed: number | null // bytes
  ramTotal: number | null // bytes
  battery: number | null
}

/** The walking dog: checklist counts, where it stands (0..1) and where it heads. */
export type WalkState = {
  done: number
  total: number // 0 when the checklist is missing or has no boxes
  pos: number
  target: number
  frame: 0 | 1 // which leg rows are drawn
  isWalking: boolean
}

/** 클꾸미: today's meals (saved), last activity (saved), and short-lived looks. */
export type PetState = {
  date: string // local YYYY-MM-DD the meals count belongs to
  meals: number
  lastActivity: number // ms
  eatingUntil: number // ms
  heartUntil: number // ms
  sadUntil: number // ms
  frame: 0 | 1 // mouth while eating, head while dozing
  test?: { mood: 'hungry' | 'sleepy'; until: number } | null // trial switch, a few seconds
}

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      snap: UsageSnap | null
      sys: SysSnap | null
      walk: WalkState | null
      pet: PetState | null
      todo: string | null // 오늘_할일.md as last read, for the next-step chips
      work: { start: string; end: string; tz: number | null; testWeekday?: boolean } | null // 퇴근 카운터
    }
  }
}
