import type { Register } from 'claude-code'

import { type Messages, MESSAGES, resolveMessages } from './i18n'

const PANE = 'session-plan'
const TITLE = 'Session Plan'

// 이 mod 가 등록한 도구. 모델은 mcp__session-plan__<이름> 으로 부름
const SET_TOOL = /^mcp__session-plan__set_session_plan$/
const GET_TOOL = /^mcp__session-plan__get_session_plan$/

type StepStatus = 'todo' | 'doing' | 'done'

type SubStep = { text: string; status: StepStatus }
type Step = { text: string; status: StepStatus; substeps?: SubStep[] }

// 세션 하나에서 합의한 순서:
// title: "합의한 순서 패널 만들기"
// steps: [
//   { text: "우측 패널 mod 만들기", status: "done" },
//   {
//     text: "패널 확인", status: "doing",
//     substeps: [                              ← 있을 때만. 패널에서 눌러 펼침
//       { text: "/order 로 열기",  status: "done" },
//       { text: "펼치기 눌러보기", status: "doing" },
//     ],
//   },
//   { text: "실제 작업에서 써보기", status: "todo" },
// ]
type SessionPlan = {
  title: string
  steps: Step[]
}

// $.store 에 세션마다 한 칸:
// key:   "order:<세션 ID>"
// value: SessionPlan
const storeKeyOf = (sessionId: string) => `order:${sessionId}`

// $.store 에 하나 (세션과 상관없음):
// key:   "autoOpen"
// value: true  ← /session-plan 으로 한 번 연 뒤로 새 세션마다 패널을 자동으로 엶
const AUTO_OPEN_KEY = 'autoOpen'

// 시스템 프롬프트에 넣는 규칙 단락의 id
const PROMPT_RULE_ID = 'session-plan:rule'

// 지금 언어의 글자. register 에서 /config 값으로 정함
let text: Messages = MESSAGES.en

// 도구 입력 모양. 설명 글자가 언어를 따라서 함수로 만듦
const inputSchemaOf = (messages: Messages) => ({
  type: 'object',
  properties: {
    title: { type: 'string', description: messages.tool.titleDescription },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          substeps: {
            type: 'array',
            description: messages.tool.substepsDescription,
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                status: { type: 'string', enum: ['todo', 'doing', 'done'] },
              },
              required: ['text', 'status'],
            },
          },
        },
        required: ['text', 'status'],
      },
    },
  },
  required: ['title', 'steps'],
})

const STATUSES: readonly string[] = ['todo', 'doing', 'done']

// 도구 입력(tool.call 이벤트에 펼쳐져 옴)을 SessionPlan 로 확인함. 틀리면 거절 사유 문자열을 돌려줌
const parseSessionPlanInput = (input: unknown): SessionPlan | string => {
  const raw = (input ?? {}) as { title?: unknown; steps?: unknown }
  if (typeof raw.title !== 'string' || raw.title.trim() === '') {
    return text.invalid.emptyTitle
  }
  if (!Array.isArray(raw.steps)) return text.invalid.stepsNotArray

  const steps: Step[] = []
  for (const rawStep of raw.steps as RawStep[]) {
    const step = parseSubStep(rawStep)
    if (typeof step === 'string') return step

    if (rawStep.substeps === undefined) {
      steps.push(step)
      continue
    }
    if (!Array.isArray(rawStep.substeps)) {
      return text.invalid.substepsNotArray(step.text)
    }
    const substeps: SubStep[] = []
    for (const rawSubStep of rawStep.substeps as RawStep[]) {
      const substep = parseSubStep(rawSubStep)
      if (typeof substep === 'string') return substep
      substeps.push(substep)
    }
    const subDoingCount = substeps.filter(sub => sub.status === 'doing').length
    if (subDoingCount > 1) {
      return text.invalid.tooManySubDoing(step.text, subDoingCount)
    }
    steps.push(substeps.length > 0 ? { ...step, substeps } : step)
  }

  const doingCount = steps.filter(step => step.status === 'doing').length
  if (doingCount > 1) return text.invalid.tooManyDoing(doingCount)

  return { title: raw.title, steps }
}

type RawStep = { text?: unknown; status?: unknown; substeps?: unknown }

// 단계 하나의 text·status 를 확인함. substeps 는 보지 않음
const parseSubStep = (raw: RawStep): SubStep | string => {
  if (typeof raw?.text !== 'string' || raw.text.trim() === '') {
    return text.invalid.emptyStep
  }
  if (typeof raw.status !== 'string' || !STATUSES.includes(raw.status)) {
    return text.invalid.badStatus(raw.text)
  }

  return { text: raw.text, status: raw.status as StepStatus }
}

const describeSessionPlan = (order: SessionPlan) =>
  [
    order.title,
    ...order.steps.flatMap((step, stepIndex) => [
      `${stepIndex + 1}. [${step.status}] ${step.text}`,
      ...(step.substeps ?? []).map(
        (sub, subIndex) => `    ${stepIndex + 1}.${subIndex + 1} [${sub.status}] ${sub.text}`,
      ),
    ]),
  ].join('\n')

// 패널에서 누른 단계의 펼침 여부:
// key:   단계 text  (예: "패널 확인")
// value: true 펼침 / false 접음
// 누른 적 없는 단계는 doing 일 때만 펼침
const expandedOverrides = new Map<string, boolean>()

const isStepExpanded = (step: Step) =>
  expandedOverrides.get(step.text) ?? step.status === 'doing'

const STATUS_MARK: Record<StepStatus, string> = { done: '✓', doing: '▶', todo: '□' }

// 진행 중 표시는 이 글자들을 차례로 돌려 그림 (터미널 로딩 표시와 같은 모양)
const DOING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const DOING_FRAME_MS = 100

// 지금 몇 번째 글자를 그리는지. 타이머가 하나씩 올림
let doingFrameIndex = 0
// 마지막으로 그린 순서에 진행 중 단계가 있었는지. 없으면 타이머가 다시 그리지 않음
let hasDoingStep = false

// 상태 표시 글자. 진행 중이면 돌아가는 글자
const statusMarkOf = (status: StepStatus) =>
  status === 'doing' ? (DOING_FRAMES[doingFrameIndex % DOING_FRAMES.length] ?? STATUS_MARK.doing) : STATUS_MARK[status]

export const register: Register = (on, options) => {
  text = resolveMessages(options.language)

  on('session.start', async ($, e, next) => {
    // 진행 중 단계가 있을 때만 0.1초마다 패널을 다시 그려 표시를 돌림
    $.clock.every(DOING_FRAME_MS, () => {
      if (!hasDoingStep) return
      doingFrameIndex += 1
      $.ui.invalidate('ui.render')
    })

    // 한 번 연 적이 있으면 새 세션에서도 엶. 이미 열린 패널도 다시 열어 제목을 지금 것으로 바꿔 줌
    const isPaneOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isPaneOpen || (await $.store.get(AUTO_OPEN_KEY)) === true) void $.ui.open({ id: PANE, title: TITLE })

    await $.command.register({
      name: 'session-plan',
      description: text.command.description,
    })
    await $.tool.register({
      name: 'set_session_plan',
      description: text.tool.setDescription,
      inputSchema: inputSchemaOf(text),
    })
    await $.tool.register({
      name: 'get_session_plan',
      description: text.tool.getDescription,
    })

    return next(e)
  })

  on('command.run', { command: 'session-plan' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await $.store.set(AUTO_OPEN_KEY, true)

    return { text: text.command.opened }
  })

  // 순서를 제안·합의·기록하라는 규칙을 시스템 프롬프트 끝에 넣음. 글자가 매번 같아서 캐시가 유지됨
  // 도구 목록으로 거르지 않음. 도구 설명이 나중에 불려오는 세션에서도 규칙은 보여야 함
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { sections: [...composed.sections, { id: PROMPT_RULE_ID, text: text.promptRule, scope: 'session' }] }
  })

  on('tool.call', { tool: SET_TOOL }, async ($, e) => {
    const parsed = parseSessionPlanInput(e)
    if (typeof parsed === 'string') return { deny: parsed }

    await $.store.set(storeKeyOf(await $.session.id()), parsed)
    $.ui.invalidate('ui.render')

    return { result: `${text.tool.saved}\n${describeSessionPlan(parsed)}` }
  })

  on('tool.call', { tool: GET_TOOL }, async $ => {
    const order = (await $.store.get(storeKeyOf(await $.session.id()))) as
      | SessionPlan
      | undefined

    return { result: order ? describeSessionPlan(order) : text.tool.noPlan }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const order = (await $.store.get(storeKeyOf(await $.session.id()))) as
      | SessionPlan
      | undefined

    hasDoingStep =
      !!order &&
      order.steps.some(step => step.status === 'doing' || step.substeps?.some(sub => sub.status === 'doing'))

    if (!order) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{text.pane.empty}</Text>
        </Box>
      )
    }

    // 순번 칸 너비. 단계가 10개를 넘어도 순번 위치가 같도록 앞을 공백으로 채움
    const numberWidth = String(order.steps.length).length + 1

    // 한 줄 모양 (순번이 항상 맨 앞):
    //   "2. □ 패널에 순서가 뜨는지 확인 (진행 중)          ▾ 1/3"
    //   "   2.1 ✓ /order 로 열기"
    return (
      <Box flexDirection="column">
        <Text bold>{order.title}</Text>
        {order.steps.map((step, stepIndex) => {
          const substeps = step.substeps ?? []
          const isDone = step.status === 'done'
          const isDoing = step.status === 'doing'
          const stepNumber = `${stepIndex + 1}.`.padStart(numberWidth)
          const stepText = (
            <Text dimColor={isDone} bold={isDoing} color={isDoing ? 'yellow' : undefined}>
              {stepNumber} {statusMarkOf(step.status)} {step.text}
              {isDoing ? text.pane.inProgress : ''}
            </Text>
          )

          if (substeps.length === 0) return stepText

          const isExpanded = isStepExpanded(step)
          const doneCount = substeps.filter(sub => sub.status === 'done').length
          const toggleStep = () => {
            expandedOverrides.set(step.text, !isExpanded)
            $.ui.invalidate('ui.render')
          }

          return (
            <Box flexDirection="column">
              <Box>
                <Button plain key={`step:${step.text}`} onPress={toggleStep}>
                  {stepText}
                </Button>
                <Box flexGrow={1} />
                <Text dimColor>
                  {' '}
                  {isExpanded ? '▾' : '▸'} {doneCount}/{substeps.length}
                </Text>
              </Box>
              {isExpanded &&
                substeps.map((sub, subIndex) => (
                  <Text
                    dimColor={sub.status === 'done'}
                    color={sub.status === 'doing' ? 'yellow' : undefined}
                  >
                    {' '.repeat(numberWidth + 1)}
                    {stepIndex + 1}.{subIndex + 1} {statusMarkOf(sub.status)} {sub.text}
                  </Text>
                ))}
            </Box>
          )
        })}
      </Box>
    )
  })
}
