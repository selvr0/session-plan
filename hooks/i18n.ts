// 패널·명령·도구에 쓰는 모든 글자. /config 의 session-plan.language 로 고름 (en | ko)

export type Language = 'en' | 'ko'

export type Messages = {
  pane: {
    empty: string
    inProgress: string
  }
  command: { description: string; opened: string }
  // 매 요청 시스템 프롬프트에 넣는 규칙. 순서를 제안하고 합의를 받도록 유도함
  promptRule: string
  tool: {
    setDescription: string
    getDescription: string
    titleDescription: string
    substepsDescription: string
    saved: string
    noPlan: string
  }
  invalid: {
    emptyTitle: string
    stepsNotArray: string
    substepsNotArray: (step: string) => string
    tooManySubDoing: (step: string, count: number) => string
    tooManyDoing: (count: number) => string
    emptyStep: string
    badStatus: (step: string) => string
  }
}

const en: Messages = {
  pane: {
    empty: 'No agreed plan yet.',
    inProgress: ' (in progress)',
  },
  command: { description: 'Open the Session Plan pane', opened: 'Opened the Session Plan pane.' },
  promptRule: [
    'This session uses the Session Plan pane.',
    '- If the work has two or more steps, propose an order and get the user\'s agreement before starting',
    '- Once the user agrees, write the whole plan with set_session_plan. Do not write an order you made up without agreement',
    '- Set a step to doing when you start it and to done when you finish it, writing the plan again each time',
    '- If you think the order should change, ask the user first, and rewrite it once they agree',
  ].join('\n'),
  tool: {
    setDescription: [
      'Writes the work plan agreed with the user to this session\'s Session Plan side pane. Always pass the whole plan.',
      '',
      'When to call:',
      '- When the user says "let\'s go in this order", or agrees to an order you proposed. Do not write a plan you made up on your own',
      '- When you start a step, set it to doing; when you finish it, set it to done',
      '- When the user asks to change the order. If you think the order should change, ask the user first',
      '',
      'If a step has several things to do, split them into substeps. The user can expand a step in the pane.',
      '',
      'Do not add or remove steps without the user saying so. Only one step can be doing, and only one substep within that step.',
    ].join('\n'),
    getDescription: 'Reads the work plan agreed with the user in this session. Use it when you no longer remember the plan after the conversation was compacted.',
    titleDescription: 'One line saying what this plan is for',
    substepsDescription: 'Sub-tasks of this step. Leave empty if none',
    saved: 'Saved.',
    noPlan: 'No agreed plan in this session.',
  },
  invalid: {
    emptyTitle: 'title is empty.',
    stepsNotArray: 'steps must be an array.',
    substepsNotArray: step => `substeps must be an array: "${step}"`,
    tooManySubDoing: (step, count) => `Only one substep of "${step}" can be doing. Now ${count}.`,
    tooManyDoing: count => `Only one step can be doing. Now ${count}.`,
    emptyStep: 'A step is empty.',
    badStatus: step => `status must be one of todo, doing, done: "${step}"`,
  },
}

const ko: Messages = {
  pane: {
    empty: '아직 합의한 순서 없음.',
    inProgress: ' (진행 중)',
  },
  command: { description: 'Session Plan 패널을 엶', opened: 'Session Plan 패널을 열었음.' },
  promptRule: [
    '이 세션은 Session Plan 패널을 쓰고 있음.',
    '- 할 일이 두 단계 이상이면, 시작하기 전에 순서를 제안하고 사용자 동의를 받음',
    '- 사용자가 동의하면 set_session_plan 으로 순서 전체를 적음. 동의 없이 혼자 세운 순서는 적지 않음',
    '- 단계를 시작할 때 doing, 끝낼 때 done 으로 바꿔 다시 적음',
    '- 순서를 바꿔야 할 것 같으면 먼저 사용자에게 묻고, 동의하면 고쳐 적음',
  ].join('\n'),
  tool: {
    setDescription: [
      '사용자와 합의한 작업 순서를 이 세션의 우측 패널에 적음. 매번 순서 전체를 넘김.',
      '',
      '언제 부르나:',
      '- 사용자가 "이 순서로 하자"고 하거나, 제안한 순서에 사용자가 "좋아"라고 답했을 때. 혼자 세운 계획은 적지 않음',
      '- 단계를 시작할 때 그 단계를 doing 으로, 끝냈을 때 done 으로',
      '- 사용자가 순서를 바꾸자고 했을 때. 바꾸는 게 낫다고 판단되면 사용자에게 먼저 묻고 고침',
      '',
      '한 단계에 할 일이 여럿이면 substeps 로 나눔. 패널에서 그 단계를 누르면 펼쳐짐.',
      '',
      '사용자 말 없이 단계를 더하거나 빼지 않음. doing 은 단계 중 하나, 그 단계의 substeps 중 하나까지.',
    ].join('\n'),
    getDescription: '이 세션에서 사용자와 합의한 작업 순서를 읽음. 대화가 요약된 뒤 순서가 기억나지 않을 때 씀.',
    titleDescription: '이 순서가 무엇을 위한 것인지 한 줄',
    substepsDescription: '이 단계의 하위 할 일. 없으면 비워 둠',
    saved: '저장함.',
    noPlan: '이 세션에 합의한 순서 없음.',
  },
  invalid: {
    emptyTitle: 'title 이 비었음.',
    stepsNotArray: 'steps 는 배열이어야 함.',
    substepsNotArray: step => `substeps 는 배열이어야 함: "${step}"`,
    tooManySubDoing: (step, count) => `"${step}" 의 substeps 중 doing 은 하나만 가능함. 지금 ${count}개.`,
    tooManyDoing: count => `doing 은 하나만 가능함. 지금 ${count}개.`,
    emptyStep: '빈 단계가 있음.',
    badStatus: step => `status 는 todo·doing·done 중 하나여야 함: "${step}"`,
  },
}

export const MESSAGES: Record<Language, Messages> = { en, ko }

// /config 값이 없거나 모르는 값이면 영어
export function resolveMessages(language: unknown): Messages {
  return language === 'ko' ? ko : en
}
