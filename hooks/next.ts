// "다음 할 일" chips: the first unchecked items, short labels, and the prompt each fills.
export type Chip = { key: string; label: string; prompt: string }

const MAX_LABEL = 25
const FILLERS: Chip[] = [
  { key: 'filler-review', label: '▶ 방금 고친 것 검토', prompt: '방금 고친 것을 검토해 줘.' },
  { key: 'filler-summary', label: '▶ 팀장 보고용 3줄 요약', prompt: '팀장 보고용으로 3줄 요약해 줘.' },
]
// Never suggested: git work or deleting files.
const AVOID = /커밋|푸시|commit|push|merge|rebase|\bgit\b|삭제|지우기|지워|delete|\brm\b/i

/** Unchecked items, top to bottom. */
export function unchecked(md: string): string[] {
  const out: string[] = []
  for (const line of md.split('\n')) {
    const m = /^\s*[-*+]\s+\[ \]\s+(.+?)\s*$/.exec(line)
    if (m && m[1]) out.push(m[1])
  }
  return out
}

/** 을 / 를 by the last syllable's final consonant. */
export function objectParticle(s: string): string {
  const last = [...s.trim()].pop() ?? ''
  const c = last.charCodeAt(0)
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? '을' : '를'
  return '을(를)'
}

export function shortLabel(item: string): string {
  let s = item.replace(/\([^)]*\)/g, '').replace(/\s*다시\s+/g, ' ').replace(/\s+/g, ' ').trim()
  const room = MAX_LABEL - 2 // '▶ '
  if ([...s].length > room) s = [...s].slice(0, room - 1).join('') + '…'
  return `▶ ${s}`
}

export function itemPrompt(item: string): string {
  return `'${item}'${objectParticle(item)} 해 줘. 끝나면 오늘_할일.md에서 [x]로 바꿔 줘.`
}

/** Three chips: unchecked items first, then the two fillers. */
export function chips(md: string | null): Chip[] {
  const items = md === null ? [] : unchecked(md).filter(i => !AVOID.test(i))
  const fromList: Chip[] = items.slice(0, 3).map((item, i) => ({
    key: `todo-${i}-${item}`.slice(0, 64),
    label: shortLabel(item),
    prompt: itemPrompt(item),
  }))
  return [...fromList, ...FILLERS].slice(0, 3)
}

export const CHIP_STYLE = {
  first: { bg: '#EBF8FF', border: '#3182CE', text: '#2B6CB0' },
  rest: { bg: '#FFFFFF', border: '#CBD5E0', text: '#1A202C' },
} as const
