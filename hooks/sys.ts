// Parsers for the computer-status row: local command output in, numbers out.
// Anything that does not parse comes back null and is drawn as '–'.

/** `ps -A -o %cpu=` summed over all processes, as a share of every core. */
export function parseCpu(ps: string, ncpu: number | null): number | null {
  if (!ncpu || ncpu <= 0) return null
  let sum = 0
  let seen = 0
  for (const line of ps.split('\n')) {
    const v = Number.parseFloat(line.trim().replace(',', '.'))
    if (Number.isFinite(v)) {
      sum += v
      seen += 1
    }
  }
  if (seen === 0) return null
  return Math.min(100, Math.max(0, sum / ncpu))
}

/** Memory in use from `vm_stat`: active + wired + compressed, as Activity Monitor counts it. */
export function parseVmUsed(vm: string): number | null {
  const page = /page size of (\d+) bytes/.exec(vm)
  const get = (label: string) => {
    const m = new RegExp(`${label}:\\s+(\\d+)\\.`).exec(vm)
    return m ? Number(m[1]) : null
  }
  const active = get('Pages active')
  const wired = get('Pages wired down')
  const compressed = get('Pages occupied by compressor')
  if (!page || active === null || wired === null || compressed === null) return null
  return (active + wired + compressed) * Number(page[1])
}

/** Battery percent from `pmset -g batt`; null on a Mac with no battery. */
export function parseBattery(pmset: string): number | null {
  const m = /InternalBattery[^\n]*?\t(\d{1,3})%/.exec(pmset) ?? /(\d{1,3})%;/.exec(pmset)
  return m ? Number(m[1]) : null
}

export function parseInt0(s: string): number | null {
  const v = Number.parseInt(s.trim(), 10)
  return Number.isFinite(v) && v > 0 ? v : null
}
