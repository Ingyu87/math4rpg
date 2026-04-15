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

/** 초등 나눗셈: 나누어떨어짐 — 몫만 정수 */
function assertDivisible(dividend: number, divisor: number, q: number, tag: string) {
  if (divisor <= 0) throw new Error(`${tag}: divisor`);
  if (dividend !== divisor * q) throw new Error(`${tag}: dividend≠divisor×몫`);
  if (!Number.isInteger(q) || dividend % divisor !== 0) throw new Error(`${tag}: 나누어떨어져야 함`);
}

/** 몫 q, 나머지 r (0≤r<divisor), 피제수 = divisor×q+r */
function assertDivisionWithRemainder(dividend: number, divisor: number, q: number, r: number, tag: string) {
  if (divisor <= 0) throw new Error(`${tag}: divisor`);
  if (!Number.isInteger(r) || r < 0 || r >= divisor) throw new Error(`${tag}: 나머지 범위`);
  if (!Number.isInteger(q) || q < 0) throw new Error(`${tag}: 몫`);
  if (dividend !== divisor * q + r) throw new Error(`${tag}: 피제수 불일치`);
}

/** 정답 나머지와 다른 1~(divisor-1) 중 하나 (오답 보기용, 항상 나누는 수보다 작음) */
function pickWrongRemainder(divisor: number, r: number): number {
  for (let d = 1; d < divisor; d += 1) {
    if (d !== r) return d;
  }
  return 1;
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
    assertDivisible(dividend, divisor, q, `L3-${i}`);
    if (i % 2 === 0) {
      out.push({
        id: `L3-O${i}`,
        level: 3,
        lesson: 4,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 몫은? (나누어떨어짐)`,
        choices: [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: `(세 자리 수)÷(몇십) — 몫만 구합니다. 소수는 나오지 않습니다.`,
      });
    } else {
      out.push({
        id: `L3-S${i}`,
        level: 3,
        lesson: 4,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor}의 몫은? (숫자만, 나누어떨어짐)`,
        answer: String(q),
        explanation: `(세 자리 수)÷(몇십) — 몫만 입력합니다.`,
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
    assertDivisible(dividend, divisor, q, `L4-${i}`);
    if (i % 2 === 0) {
      out.push({
        id: `L4-O${i}`,
        level: 4,
        lesson: 5,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 몫은? (나누어떨어짐)`,
        choices: [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: `(두/세 자리)÷(두 자리) — 나누어떨어지며 몫은 한 자리입니다. 소수는 없습니다.`,
      });
    } else {
      out.push({
        id: `L4-S${i}`,
        level: 4,
        lesson: 5,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor}의 몫은? (숫자만, 나누어떨어짐)`,
        answer: String(q),
        explanation: `몫만 입력합니다. 나누어떨어지는 나눗셈입니다.`,
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
    assertDivisible(dividend, divisor, q, `L5-${i}`);
    if (i % 2 === 0) {
      out.push({
        id: `L5-O${i}`,
        level: 5,
        lesson: 6,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor}의 몫은? (나누어떨어짐)`,
        choices: [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: `몫은 두 자리입니다. 나누어떨어지며 소수는 없습니다.`,
      });
    } else {
      out.push({
        id: `L5-S${i}`,
        level: 5,
        lesson: 6,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor}의 몫은? (숫자만, 나누어떨어짐)`,
        answer: String(q),
        explanation: `몫만 입력합니다. 나누어떨어지는 나눗셈입니다.`,
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
    const mod = Math.max(2, divisor - 1);
    const r = 1 + (i % mod);
    const dividend = divisor * q + r;
    assertDivisionWithRemainder(dividend, divisor, q, r, `L6-${i}`);

    if (i % 2 === 0) {
      const correct = `${q} ... ${r}`;
      const rWrong = pickWrongRemainder(divisor, r);
      const w1 = `${q + 1} ... ${r}`;
      const w2 = `${q} ... ${rWrong}`;
      const w3 = q > 10 ? `${q - 1} ... ${r}` : `${q + 2} ... ${r}`;
      const w4 = `${q + 1} ... ${rWrong}`;
      const dedup = [...new Set([correct, w1, w2, w3, w4])];
      if (dedup.length < 4) {
        throw new Error(`L6-O${i}: 보기 4개 확보 실패`);
      }
      out.push({
        id: `L6-O${i}`,
        level: 6,
        lesson: 7,
        type: "objective",
        prompt: `${dividend} ÷ ${divisor} — 몫과 나머지를 고르세요. (형식: 몫 ... 나머지, 나머지는 ${divisor}보다 작은 정수)`,
        choices: dedup.slice(0, 4),
        answer: correct,
        explanation: `몫·나머지는 정수이고, 나머지는 나누는 수보다 작습니다. 소수는 사용하지 않습니다.`,
      });
    } else {
      out.push({
        id: `L6-S${i}`,
        level: 6,
        lesson: 7,
        type: "subjective",
        prompt: `${dividend} ÷ ${divisor}의 몫만 입력하세요. (정수)`,
        answer: String(q),
        explanation: `몫만 구합니다. 몫·나머지·나누는 수는 모두 정수입니다.`,
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
  let s = answer.replaceAll(",", "").replaceAll(" ", "").trim();
  const asInt = /^(\d+)\.0+$/;
  const m = s.match(asInt);
  if (m) s = m[1];
  return s;
}
