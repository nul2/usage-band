import { expect, test } from 'claude-code/testing'

import { chips, itemPrompt, objectParticle, shortLabel, unchecked } from '../hooks/next'

// Example data: the checklist as it is today, plus one with F-codes like the request.
const TODAY = `# 오늘 할 일

- [x] 메일 정리
- [x] 회의록 올리기
- [ ] 발표 자료(초안) 다듬기
- [ ] 다음 주 일정 정리
- [ ] 동료에게 자료 공유
`
const FCODES = `- [ ] F2 보고서체로 맞추기
- [x] F1 표지 확인
- [ ] F2 표 숫자 다시 확인
- [ ] 변경분 커밋하고 푸시
- [ ] 임시 파일 삭제
- [ ] F5 PDF 여백 확인
- [ ] F6 마지막 검토
`

test('three unchecked items, top first, short labels, git and deletion left out', () => {
  expect(chips(FCODES).map(c => c.label)).toEqual([
    '▶ F2 보고서체로 맞추기',
    '▶ F2 표 숫자 확인',
    '▶ F5 PDF 여백 확인',
  ])
  expect(chips(TODAY).map(c => c.label)).toEqual([
    '▶ 발표 자료 다듬기',
    '▶ 다음 주 일정 정리',
    '▶ 동료에게 자료 공유',
  ])
  for (const c of [...chips(FCODES), ...chips(TODAY)]) expect([...c.label].length).toBeLessThanOrEqual(25)
  expect(shortLabel('아주 아주 아주 긴 할 일 이름이 스물다섯 글자를 훌쩍 넘어가는 경우').length).toBeLessThanOrEqual(25)
})

test('the prompt each chip fills', () => {
  expect(itemPrompt('F2 표 숫자 다시 확인')).toBe("'F2 표 숫자 다시 확인'을 해 줘. 끝나면 오늘_할일.md에서 [x]로 바꿔 줘.")
  expect(objectParticle('보고서 공유')).toBe('를')
  expect(objectParticle('요약 정리')).toBe('를')
  expect(objectParticle('초안 작성')).toBe('을')
})

test('fewer than three left: filled with the two suggestions', () => {
  const one = '- [x] a\n- [ ] F5 PDF 여백 확인\n'
  expect(chips(one).map(c => c.label)).toEqual(['▶ F5 PDF 여백 확인', '▶ 방금 고친 것 검토', '▶ 팀장 보고용 3줄 요약'])
  expect(chips(null).map(c => c.label)).toEqual(['▶ 방금 고친 것 검토', '▶ 팀장 보고용 3줄 요약'])
  expect(unchecked('- [x] done\n')).toEqual([])
})

test('drawn above the dog; first chip blue, others white; a press fills, never sends', async ($, on) => {
  const filled: unknown[] = []
  let submitted = 0
  on('clock.now', () => ({ value: 1_800_000_000_000 }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('fs.read', (_: unknown, e: any) => {
    if (String(e.path).endsWith('오늘_할일.md')) return { value: FCODES }
    throw new Error('ENOENT')
  })
  on('fs.write', () => ({ value: undefined }))
  on('prompt.fill', (_: unknown, e: any) => {
    filled.push(e)
    return { isFilled: true }
  })
  on('prompt.submit', () => {
    submitted += 1
    return {}
  })

  await $.session.start({ cwd: '/w', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'usage-band', component: 'AbovePrompt', surface,
      props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 140, scroll: { offset: 0, bodyRows: 30 }, view: {} },
    })
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.map(b => b.text)).toEqual(['▶ F2 보고서체로 맞추기', '▶ F2 표 숫자 확인', '▶ F5 PDF 여백 확인'])
    const boxes = (await ui.findAll({ type: 'Box' })).filter(b => b.props.borderStyle === 'round')
    expect(boxes.map(b => [b.props.backgroundColor, b.props.borderColor])).toEqual([
      ['#EBF8FF', '#3182CE'], ['#FFFFFF', '#CBD5E0'], ['#FFFFFF', '#CBD5E0'],
    ])
    const labels = await ui.findAll({ type: 'Text', text: /^▶/ })
    expect(labels.map(t => [t.props.bold, t.props.color])).toEqual([[true, '#2B6CB0'], [true, '#1A202C'], [true, '#1A202C']])
    if (surface === 'desktop') {
      // chips row sits right above the dog
      const pics = await ui.findAll({ type: 'Svg' })
      expect(String(pics[2]?.props.alt)).toContain('강아지')
    }
    await ui.unmount()
  }

  const ui = await $.ui.mount({
    plugin: 'usage-band', component: 'AbovePrompt', surface: 'desktop',
    props: { hasSurvey: false, isWorking: false, maxRows: 30, bodyColumns: 140, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  const second = (await ui.findAll({ type: 'Button' }))[1]!
  await $.ui.press({ plugin: 'usage-band', key: second.key! })
  expect(filled).toHaveLength(1)
  expect(filled[0]).toMatchObject({ text: "'F2 표 숫자 다시 확인'을 해 줘. 끝나면 오늘_할일.md에서 [x]로 바꿔 줘.", mode: 'replace' })
  expect(submitted).toBe(0)
  await ui.unmount()
})
