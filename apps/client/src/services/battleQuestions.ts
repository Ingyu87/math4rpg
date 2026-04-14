import type { BattleQuestion } from "../types/game";

const LEVEL_TO_LESSON: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
};

function toComma(value: number) {
  return value.toLocaleString("ko-KR");
}

function makeObjectiveChoices(answer: number) {
  const a = answer;
  const b = Math.max(1, answer + 10);
  const c = Math.max(1, answer - 10);
  const d = Math.max(1, Math.floor(answer / 10));
  return [toComma(a), toComma(b), toComma(c), toComma(d)];
}

function buildLevel1(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  for (let i = 1; i <= 100; i += 1) {
    const n = 120 + (i % 80);
    const tens = 20 + (i % 7) * 10;
    const answer = n * tens;
    if (i % 2 === 0) {
      out.push({
        id: `L1-O${i}`,
        level: 1,
        lesson: 2,
        type: "objective",
        prompt: `${n} × ${tens}의 값을 고르세요.`,
        choices: makeObjectiveChoices(answer),
        answer: toComma(answer),
        explanation: `(세 자리 수)×(몇십) 계산입니다.`,
      });
    } else {
      out.push({
        id: `L1-S${i}`,
        level: 1,
        lesson: 2,
        type: "subjective",
        prompt: `${n} × ${tens} = ? (숫자만 입력)`,
        answer: String(answer),
        explanation: `(세 자리 수)×(몇십) 계산입니다.`,
      });
    }
  }
  return out;
}

function buildLevel2(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  for (let i = 1; i <= 100; i += 1) {
    const n = 200 + (i % 120);
    const m = 11 + (i % 19);
    const answer = n * m;
    if (i % 2 === 0) {
      out.push({
        id: `L2-O${i}`,
        level: 2,
        lesson: 3,
        type: "objective",
        prompt: `${n} × ${m} 계산으로 알맞은 값을 고르세요.`,
        choices: makeObjectiveChoices(answer),
        answer: toComma(answer),
        explanation: `(세 자리 수)×(몇십몇) 계산입니다.`,
      });
    } else {
      out.push({
        id: `L2-S${i}`,
        level: 2,
        lesson: 3,
        type: "subjective",
        prompt: `${n} × ${m} = ? (숫자만 입력)`,
        answer: String(answer),
        explanation: `(세 자리 수)×(몇십몇) 계산입니다.`,
      });
    }
  }
  return out;
}

function buildLevel3(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  for (let i = 1; i <= 100; i += 1) {
    const divisor = 20 + (i % 8) * 10;
    const q = 4 + (i % 13);
    const dividend = divisor * q;
    if (i % 2 === 0) {
      out.push({
        id: `L3-O${i}`,
        level: 3,
        lesson: 4,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 몫은?`,
        choices: [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: `(세 자리 수)÷(몇십) 계산입니다.`,
      });
    } else {
      out.push({
        id: `L3-S${i}`,
        level: 3,
        lesson: 4,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor} = ? (숫자만 입력)`,
        answer: String(q),
        explanation: `(세 자리 수)÷(몇십) 계산입니다.`,
      });
    }
  }
  return out;
}

function buildLevel4(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  for (let i = 1; i <= 100; i += 1) {
    const divisor = 12 + (i % 18);
    const q = 2 + (i % 8);
    const dividend = divisor * q;
    if (i % 2 === 0) {
      out.push({
        id: `L4-O${i}`,
        level: 4,
        lesson: 5,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 몫은?`,
        choices: [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: `몫이 한 자리 수인 (두/세 자리 수)÷(두 자리 수)입니다.`,
      });
    } else {
      out.push({
        id: `L4-S${i}`,
        level: 4,
        lesson: 5,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor} = ? (숫자만 입력)`,
        answer: String(q),
        explanation: `몫이 한 자리 수인 나눗셈입니다.`,
      });
    }
  }
  return out;
}

function buildLevel5(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  for (let i = 1; i <= 100; i += 1) {
    const divisor = 21 + (i % 17);
    const q = 10 + (i % 20);
    const dividend = divisor * q;
    if (i % 2 === 0) {
      out.push({
        id: `L5-O${i}`,
        level: 5,
        lesson: 6,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 몫을 고르세요.`,
        choices: [String(q), String(q + 1), String(q - 1), String(q + 2)],
        answer: String(q),
        explanation: `몫이 두 자리 수이고 나누어떨어지는 경우입니다.`,
      });
    } else {
      out.push({
        id: `L5-S${i}`,
        level: 5,
        lesson: 6,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor} = ? (숫자만 입력)`,
        answer: String(q),
        explanation: `몫이 두 자리 수이고 나누어떨어지는 나눗셈입니다.`,
      });
    }
  }
  return out;
}

function buildLevel6(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  for (let i = 1; i <= 100; i += 1) {
    const divisor = 25 + (i % 19);
    const q = 10 + (i % 18);
    const r = 1 + (i % Math.max(2, divisor - 1));
    const dividend = divisor * q + r;
    if (i % 2 === 0) {
      const correct = `${q} ... ${r}`;
      out.push({
        id: `L6-O${i}`,
        level: 6,
        lesson: 7,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 계산 결과(몫 ... 나머지)는?`,
        choices: [
          correct,
          `${q + 1} ... ${r}`,
          `${q} ... ${Math.max(0, r - 1)}`,
          `${q - 1} ... ${r + 1}`,
        ],
        answer: correct,
        explanation: `몫이 두 자리 수이고 나머지가 있는 나눗셈입니다.`,
      });
    } else {
      out.push({
        id: `L6-S${i}`,
        level: 6,
        lesson: 7,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor}의 몫만 입력하세요.`,
        answer: String(q),
        explanation: `몫과 나머지 중 몫만 묻는 문제입니다.`,
      });
    }
  }
  return out;
}

const QUESTIONS: BattleQuestion[] = [
  ...buildLevel1(),
  ...buildLevel2(),
  ...buildLevel3(),
  ...buildLevel4(),
  ...buildLevel5(),
  ...buildLevel6(),
];

export function getLessonByLevel(level: number) {
  return LEVEL_TO_LESSON[level] ?? 2;
}

export function pickRandomQuestion(level: number): BattleQuestion {
  const lesson = getLessonByLevel(level);
  const pool = QUESTIONS.filter((q) => q.level === level && q.lesson === lesson);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function normalizeAnswer(answer: string) {
  return answer.replaceAll(",", "").replaceAll(" ", "").trim();
}
