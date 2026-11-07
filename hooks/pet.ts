// 클꾸미: an original round 8-bit pet. Pure drawing and mood logic, no `$`.
import type { PetState } from '../types'

// 16 × 16 dots, one dot = 2 px → 32 × 32. A round mint bun with two little ears.
// O outline · M body · W shine · F feet
export const BODY = [
  '...OO......OO...',
  '..OMMO....OMMO..',
  '..OMMMOOOOMMMO..',
  '.OMMMMMMMMMMMMO.',
  'OMWWMMMMMMMMMMMO',
  'OMWMMMMMMMMMMMMO',
  'OMMMMMMMMMMMMMMO',
  'OMMMMMMMMMMMMMMO',
  'OMMMMMMMMMMMMMMO',
  'OMMMMMMMMMMMMMMO',
  'OMMMMMMMMMMMMMMO',
  '.OMMMMMMMMMMMMO.',
  '..OMMMMMMMMMMO..',
  '...OOOOOOOOOO...',
  '...OFFO..OFFO...',
  '....OO....OO....',
]

const PALETTE: Record<string, string> = {
  O: '#2F4858', M: '#8FE3CF', W: '#E6FFF8', F: '#5BB89F',
  E: '#1B1B1B', C: '#F7A8B8', R: '#D9485F', T: '#5DADE2',
  H: '#E53E5A', h: '#FF8FA3',
}

type Dot = [x: number, y: number, c: string]
const dots = (c: string, ...xy: [number, number][]): Dot[] => xy.map(([x, y]) => [x, y, c])

const CHEEKS = dots('C', [3, 9], [4, 9], [11, 9], [12, 9])

export type Mood = 'happy' | 'eating' | 'hungry' | 'sad' | 'sleepy'

export const MOOD_WORD: Record<Mood, string> = {
  happy: '좋음', eating: '냠냠', hungry: '배고픔', sad: '시무룩', sleepy: '졸림',
}

/** The face dots for a mood; `frame` flips the mouth while eating. */
export function face(mood: Mood, frame: 0 | 1): Dot[] {
  switch (mood) {
    case 'happy':
      return [
        ...dots('E', [5, 6], [5, 7], [10, 6], [10, 7]),
        ...CHEEKS,
        ...dots('E', [6, 9], [9, 9], [7, 10], [8, 10]),
      ]
    case 'eating':
      return [
        ...dots('E', [4, 7], [5, 6], [6, 7], [9, 7], [10, 6], [11, 7]), // ^ ^
        ...CHEEKS,
        ...(frame === 0
          ? [...dots('E', [7, 9], [8, 9], [6, 10], [9, 10], [7, 11], [8, 11]), ...dots('R', [7, 10], [8, 10])]
          : dots('E', [6, 10], [7, 10], [8, 10], [9, 10])),
      ]
    case 'hungry':
      return [
        ...dots('E', [5, 7], [5, 8], [10, 7], [10, 8]),
        ...dots('E', [7, 10], [8, 10], [6, 11], [9, 11], [7, 12], [8, 12]),
        ...dots('T', [13, 4], [13, 5]), // sweat drop
      ]
    case 'sad':
      return [
        ...dots('E', [4, 5], [5, 6], [11, 5], [10, 6]), // worried brows
        ...dots('E', [5, 7], [5, 8], [10, 7], [10, 8]),
        ...dots('E', [7, 10], [8, 10], [6, 11], [9, 11]), // frown
        ...dots('T', [11, 9], [11, 10]), // tear
      ]
    case 'sleepy':
      return [
        ...dots('E', [4, 7], [5, 7], [6, 7], [9, 7], [10, 7], [11, 7]), // closed
        ...CHEEKS,
        ...dots('E', [7, 10], [8, 10]),
      ]
  }
}

// 7 × 6 pixel heart.
const HEART = [
  '.HH.HH.',
  'HhHHHHH',
  'HHHHHHH',
  '.HHHHH.',
  '..HHH..',
  '...H...',
]

export const DOT = 2
export const PET = 16 * DOT // 32
export const PET_ROW_H = 46 // heart / zZ above, pet, a little ground

export function mood(p: PetState | null, now: number, isSleepy: boolean): Mood {
  if (!p) return 'happy'
  if (p.eatingUntil > now) return 'eating'
  if (p.test && p.test.until > now) return p.test.mood
  if (isSleepy) return 'sleepy'
  if (p.sadUntil > now) return 'sad'
  if (now - p.lastActivity >= 30 * 60 * 1000) return 'hungry'
  return 'happy'
}

export function labelText(p: PetState | null, m: Mood): string {
  return `오늘 밥 ${p ? p.meals : '–'} · 기분 ${MOOD_WORD[m]}`
}

/** The pet row as one SVG. */
export function petSvg(p: PetState | null, now: number, isSleepy: boolean) {
  const m = mood(p, now, isSleepy)
  const frame = p?.frame ?? 0
  const label = labelText(p, m)
  const top = 12 // room above the head
  const nod = m === 'sleepy' && frame === 1 ? DOT : 0
  const x0 = 6
  let out = ''
  const px = (x: number, y: number, c: string, dx = x0, dy = top + nod) => {
    const fill = PALETTE[c]
    if (fill) out += `<rect x="${dx + x * DOT}" y="${dy + y * DOT}" width="${DOT}" height="${DOT}" fill="${fill}"/>`
  }
  BODY.forEach((row, y) => [...row].forEach((c, x) => {
    // the feet stay put while the head nods
    px(x, y, c, x0, y >= 14 ? top : top + nod)
  }))
  for (const [x, y, c] of face(m, frame)) px(x, y, c)
  const heartOn = !!p && p.heartUntil > now
  if (heartOn) HEART.forEach((row, y) => [...row].forEach((c, x) => px(x, y, c, x0 + 9 * DOT, 0)))
  const textX = x0 + PET + 10
  const zz = m === 'sleepy'
    ? `<text x="${x0 + PET - 2}" y="${10 + (frame ? 2 : 0)}" font-size="${frame ? 11 : 9}" fill="#718096">z${frame ? 'Z' : 'z'}</text>`
    : ''
  const width = textX + label.length * 13 + 8
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PET_ROW_H}" viewBox="0 0 ${width} ${PET_ROW_H}" shape-rendering="crispEdges">` +
    out + zz +
    `<text x="${textX}" y="${top + PET / 2}" dominant-baseline="central" font-family="ui-sans-serif, -apple-system, sans-serif" font-size="12" fill="#718096">${label}</text>` +
    `</svg>`
  return { source, width, alt: `클꾸미${heartOn ? ' ♥' : ''}: ${label}`, mood: m, heartOn }
}

/** Terminal: a tiny face in characters. */
export function petText(p: PetState | null, now: number, isSleepy: boolean): string {
  const m = mood(p, now, isSleepy)
  const faceText: Record<Mood, string> = {
    happy: '(•ᴗ•)', eating: (p?.frame ?? 0) ? '(^ч^)' : '(^o^)', hungry: '(·o·)…',
    sad: '(╥_╥)', sleepy: '(-_-) zZ',
  }
  const heart = p && p.heartUntil > now ? '♥ ' : ''
  return `${heart}${faceText[m]} ${labelText(p, m)}`
}

/** What was saved, read back; a new day keeps everything but the meal count. */
export function restore(saved: unknown, today: string, now: number): PetState {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<{ date: string; meals: number; lastActivity: number }>
  const sameDay = s.date === today
  return {
    date: today,
    meals: sameDay && typeof s.meals === 'number' ? s.meals : 0,
    lastActivity: typeof s.lastActivity === 'number' ? s.lastActivity : now,
    eatingUntil: 0,
    heartUntil: 0,
    sadUntil: 0,
    frame: 0,
  }
}

export const toSaved = (p: PetState) => ({ date: p.date, meals: p.meals, lastActivity: p.lastActivity })
