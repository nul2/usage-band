// Draws the 퇴근 카운터 on its own, once a second, without redrawing the rest of the band.
import type { ClientModule } from 'claude-code'

import type { WorkHours } from './leave'
import { leaveText, view } from './leave'

export type LeaveProps = { now: number; tz: number | null; hours: WorkHours; testWeekday?: boolean }
type S = { base: number; ticks: number; stop: () => void }

const ORANGE = '#ED8936'
const MUTED = '#718096'

const Leave: ClientModule<LeaveProps, S> = (props, surface) => {
  const { Text } = surface.elements
  const st = surface.state
  if (st === undefined) {
    // start the one clock (only once): a tick a second
    const stop = surface.every(1000, () => {
      const cur = surface.state
      if (cur) surface.setState({ ...cur, ticks: cur.ticks + 1 })
    })
    surface.setState({ base: props.now, ticks: 0, stop })
  } else if (st.base !== props.now) {
    // fresh time from the plugin: count from there
    surface.setState({ ...st, base: props.now, ticks: 0 })
  }
  if (props.tz === null) return <Text color={MUTED}>🏃 퇴근까지 –</Text>
  const now = (st && st.base === props.now ? st.base + st.ticks * 1000 : props.now)
  const v = view(now, props.tz, props.hours, props.testWeekday === true)
  const text = leaveText(v)
  if (v.kind === 'party') return <Text bold size="title" color={ORANGE}>{text}</Text>
  const color = v.kind === 'working' && v.isOrange ? ORANGE : MUTED
  return <Text color={color} bold={v.kind === 'working' && v.isWrapUp}>{text}</Text>
}

export default Leave
