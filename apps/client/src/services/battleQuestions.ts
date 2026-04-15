import type { AchievementStandardCode, BattleQuestion, QuestionKind } from "../types/game";

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

function achievementForLesson(lesson: number): AchievementStandardCode {
  return lesson <= 3 ? "4수01-04" : "4수01-07";
}

/** 짧은 실생활·맥락 한 문장 (UI에서 본문 위에 표시) */
const SITUATIONS: Partial<Record<number, string[]>> = {
  2: [
    "체육 대회 응원 물품을 상자에 담을 때, ",
    "도서관에서 책꽂이 한 칸에 책을 나란히 세울 때, ",
  ],
  3: [
    "학예회 준비용 색종이를 모둠별로 나눌 때, ",
    "환경 동아리에서 재활용 봉투를 접어 쌓을 때, ",
  ],
  4: [
    "간식 봉지를 몇십 개씩 묶어 나눌 때, ",
    "실내화를 상자에 같은 개수씩 넣을 때, ",
  ],
  5: [
    "모둠 활동 자료를 두 자리 수만큼씩 묶을 때, ",
    "체험 학습 기념품을 한 묶음당 같은 수로 나눌 때, ",
  ],
  6: [
    "운동회 도시락을 한 줄에 같은 수로 배치할 때, ",
    "과학 시간 실험 도구를 세트로 나눌 때, ",
  ],
  7: [
    "봉사 활동 후 남은 물품을 나누고 남은 개수를 셀 때, ",
    "친구들과 게임 점수를 공정하게 나눌 때, ",
  ],
};

function pickSituation(lesson: number, i: number): string | undefined {
  const list = SITUATIONS[lesson];
  if (!list || list.length === 0) return undefined;
  if (i % 5 !== 0) return undefined;
  return list[i % list.length];
}

type PrincipleItem = {
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
};

const PRINCIPLE_BY_LESSON: Partial<Record<number, PrincipleItem[]>> = {
  2: [
    {
      prompt: "(몇십)×(세 자리 수)를 계산할 때, 먼저 0이 아닌 수끼리 곱한 뒤 자리를 맞춘다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "몇십·몇백과 세 자리 수의 곱셈에서 흔히 쓰는 방법입니다.",
    },
    {
      prompt: "30×120과 120×30의 값은 같다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "곱셈의 교환법칙에 따라 순서를 바꿔도 값은 같습니다.",
    },
  ],
  3: [
    {
      prompt: "(세 자리 수)×(몇십몇)에서, 몇십몇을 (몇십)+(몇)으로 나누어 생각할 수 있다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "분배법칙을 이용해 두 번 곱한 값을 더할 수 있습니다.",
    },
    {
      prompt: "두 자리 수와 세 자리 수의 곱의 결과는 항상 네 자리이다. ( O / X )",
      choices: ["O", "X"],
      answer: "X",
      explanation: "자리 수에 따라 네 자리보다 클 수도 있습니다.",
    },
  ],
  4: [
    {
      prompt: "나눗셈에서 나머지는 나누는 수보다 항상 ( )다.",
      choices: ["크다", "작다", "같다"],
      answer: "작다",
      explanation: "나머지는 0 이상, 나누는 수 미만의 정수입니다.",
    },
    {
      prompt: "나누어떨어지는 나눗셈에서 나머지는 ( )이다.",
      choices: ["0", "1", "나누는 수와 같다"],
      answer: "0",
      explanation: "나누어떨어지면 나머지는 0입니다.",
    },
  ],
  5: [
    {
      prompt: "(세 자리 수)÷(두 자리 수)에서 몫이 한 자리일 수 있다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "피제수와 나누는 수의 크기에 따라 몫의 자릿수가 달라집니다.",
    },
    {
      prompt: "나눗셈에서 몫×나누는 수가 피제수보다 클 수 있다. ( O / X )",
      choices: ["O", "X"],
      answer: "X",
      explanation: "나누어떨어지면 몫×나누는 수 = 피제수입니다.",
    },
  ],
  6: [
    {
      prompt: "나누어떨어지는 나눗셈에서 몫은 두 자리일 수도, 한 자리일 수도 있다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "피제수와 나누는 수에 따라 몫의 자릿수가 달라집니다.",
    },
    {
      prompt: "몫이 10 이상이면 반드시 두 자리 몫이다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "10 이상 99 이하는 두 자리 자연수입니다.",
    },
  ],
  7: [
    {
      prompt: "나머지가 있는 나눗셈에서 피제수 = 몫×나누는 수 + 나머지 이다. ( O / X )",
      choices: ["O", "X"],
      answer: "O",
      explanation: "나눗셈과 나머지의 관계식입니다.",
    },
    {
      prompt: "나머지는 나누는 수와 같을 수 있다. ( O / X )",
      choices: ["O", "X"],
      answer: "X",
      explanation: "나머지는 항상 나누는 수보다 작습니다.",
    },
  ],
};

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let k = a.length - 1; k > 0; k -= 1) {
    s = (s * 9301 + 49297) % 233280;
    const j = s % (k + 1);
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

function makeEstimateQuotientChoices(q: number): string[] {
  const nums = new Set<number>([q]);
  for (const off of [1, -1, 2, -2, 3, -3, 4, 5, 6, 7, 8]) {
    if (nums.size >= 4) break;
    const v = q + off;
    if (v >= 1) nums.add(v);
  }
  let extra = 10;
  while (nums.size < 4) {
    nums.add(Math.max(1, q + extra));
    extra += 3;
  }
  return shuffleWithSeed([...nums], q + 17).map(String);
}

function tryPushPrinciple(
  out: BattleQuestion[],
  level: number,
  lesson: number,
  i: number,
): boolean {
  if (i % 13 !== 0) return false;
  const pool = PRINCIPLE_BY_LESSON[lesson];
  if (!pool?.length) return false;
  const p = pool[Math.floor(i / 13) % pool.length];
  const choices = shuffleWithSeed([...p.choices], i + lesson * 31);
  const achievementStandard = achievementForLesson(lesson);
  const situation = pickSituation(lesson, i);
  out.push({
    id: `L${level}-P${i}`,
    level,
    lesson,
    type: "objective",
    questionKind: "principle",
    achievementStandard,
    situation,
    prompt: p.prompt,
    choices,
    answer: p.answer,
    explanation: p.explanation,
  });
  return true;
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

function quotientRemainderAnswer(q: number, r: number) {
  return `${q}...${r}`;
}

function formatQrPromptSuffix() {
  return "형식: 몫 ... 나머지 (점 세 개, 나머지는 나누는 수보다 작은 정수)";
}

function buildLevel1(): BattleQuestion[] {
  const out: BattleQuestion[] = [];
  const lesson = 2;
  const achievementStandard = achievementForLesson(lesson);
  for (let i = 1; i <= 100; i += 1) {
    if (tryPushPrinciple(out, 1, lesson, i)) continue;
    const n = 120 + (i % 80);
    const tens = 20 + (i % 7) * 10;
    const answer = n * tens;
    const situation = pickSituation(lesson, i);
    const questionKind: QuestionKind = i % 9 === 0 ? "estimate" : "computation";
    if (i % 2 === 0) {
      const prompt =
        questionKind === "estimate"
          ? `${n} × ${tens}의 값에 가장 가까운 것을 고르세요.`
          : `${n} × ${tens}의 값을 고르세요.`;
      out.push({
        id: `L1-O${i}`,
        level: 1,
        lesson,
        type: "objective",
        questionKind,
        achievementStandard,
        situation,
        prompt,
        choices: questionKind === "estimate" ? makeEstimateQuotientChoices(answer) : makeObjectiveChoices(answer),
        answer: questionKind === "estimate" ? String(answer) : toComma(answer),
        explanation:
          questionKind === "estimate"
            ? `실제 곱은 ${toComma(answer)}입니다. 어림은 근사값을 고르는 연습입니다.`
            : `(세 자리 수)×(몇십) 계산입니다.`,
      });
    } else {
      out.push({
        id: `L1-S${i}`,
        level: 1,
        lesson,
        type: "subjective",
        questionKind: "computation",
        achievementStandard,
        situation,
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
  const lesson = 3;
  const achievementStandard = achievementForLesson(lesson);
  for (let i = 1; i <= 100; i += 1) {
    if (tryPushPrinciple(out, 2, lesson, i)) continue;
    const n = 200 + (i % 120);
    const m = 11 + (i % 19);
    const answer = n * m;
    const situation = pickSituation(lesson, i);
    const questionKind: QuestionKind = i % 9 === 0 ? "estimate" : "computation";
    if (i % 2 === 0) {
      const prompt =
        questionKind === "estimate"
          ? `${n} × ${m}의 곱에 가장 가까운 값을 고르세요.`
          : `${n} × ${m} 계산으로 알맞은 값을 고르세요.`;
      out.push({
        id: `L2-O${i}`,
        level: 2,
        lesson,
        type: "objective",
        questionKind,
        achievementStandard,
        situation,
        prompt,
        choices: questionKind === "estimate" ? makeEstimateQuotientChoices(answer) : makeObjectiveChoices(answer),
        answer: questionKind === "estimate" ? String(answer) : toComma(answer),
        explanation:
          questionKind === "estimate"
            ? `실제 곱은 ${toComma(answer)}입니다.`
            : `(세 자리 수)×(몇십몇) 계산입니다.`,
      });
    } else {
      out.push({
        id: `L2-S${i}`,
        level: 2,
        lesson,
        type: "subjective",
        questionKind: "computation",
        achievementStandard,
        situation,
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
  const lesson = 4;
  const achievementStandard = achievementForLesson(lesson);
  for (let i = 1; i <= 100; i += 1) {
    if (tryPushPrinciple(out, 3, lesson, i)) continue;
    const divisor = 20 + (i % 8) * 10;
    const qMin = Math.ceil(100 / divisor);
    const qMax = Math.floor(999 / divisor);
    if (qMin > qMax) throw new Error(`L3-${i}: 피제수 세 자리 불가`);
    const q = qMin + (i % (qMax - qMin + 1));
    const dividend = divisor * q;
    assertDivisible(dividend, divisor, q, `L3-${i}`);
    const situation = pickSituation(lesson, i);
    const useEstimate = i % 2 === 0 && i % 9 === 0;
    const questionKind: QuestionKind = useEstimate ? "estimate" : "computation";

    if (i % 2 === 0) {
      const prompt = useEstimate
        ? `${dividend} ÷ ${divisor}의 몫을 어림할 때, 실제 몫에 가장 가까운 수를 고르세요.`
        : `${dividend} ÷ ${divisor}의 몫은? (나누어떨어짐)`;
      out.push({
        id: `L3-O${i}`,
        level: 3,
        lesson,
        type: "objective",
        questionKind,
        achievementStandard,
        situation,
        prompt,
        choices: useEstimate ? makeEstimateQuotientChoices(q) : [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: useEstimate
          ? `실제 몫은 ${q}입니다. (세 자리 피제수)÷(몇십), 나누어떨어짐.`
          : `(세 자리 수)÷(몇십) — 몫만 구합니다. 소수는 나오지 않습니다.`,
      });
    } else {
      out.push({
        id: `L3-S${i}`,
        level: 3,
        lesson,
        type: "subjective",
        questionKind: "computation",
        achievementStandard,
        situation,
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
  const lesson = 5;
  const achievementStandard = achievementForLesson(lesson);
  for (let i = 1; i <= 100; i += 1) {
    if (tryPushPrinciple(out, 4, lesson, i)) continue;
    const divisor = 12 + (i % 18);
    const qLow = Math.max(2, Math.ceil(100 / divisor));
    const qHigh = Math.min(9, Math.floor(999 / divisor));
    if (qLow > qHigh) throw new Error(`L4-${i}: 피제수 세 자리 불가`);
    const q = qLow + (i % (qHigh - qLow + 1));
    const dividend = divisor * q;
    assertDivisible(dividend, divisor, q, `L4-${i}`);
    const situation = pickSituation(lesson, i);
    const useEstimate = i % 2 === 0 && i % 9 === 0;
    const questionKind: QuestionKind = useEstimate ? "estimate" : "computation";

    if (i % 2 === 0) {
      const prompt = useEstimate
        ? `${dividend} ÷ ${divisor}의 몫을 어림할 때, 실제 몫에 가장 가까운 수를 고르세요.`
        : `${dividend} ÷ ${divisor}의 몫은? (나누어떨어짐)`;
      out.push({
        id: `L4-O${i}`,
        level: 4,
        lesson,
        type: "objective",
        questionKind,
        achievementStandard,
        situation,
        prompt,
        choices: useEstimate ? makeEstimateQuotientChoices(q) : [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: useEstimate
          ? `실제 몫은 ${q}입니다. 세 자리 피제수÷두 자리, 나누어떨어짐.`
          : `(세 자리 수)÷(두 자리) — 몫은 한 자리입니다. 소수는 없습니다.`,
      });
    } else {
      out.push({
        id: `L4-S${i}`,
        level: 4,
        lesson,
        type: "subjective",
        questionKind: "computation",
        achievementStandard,
        situation,
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
  const lesson = 6;
  const achievementStandard = achievementForLesson(lesson);
  for (let i = 1; i <= 100; i += 1) {
    if (tryPushPrinciple(out, 5, lesson, i)) continue;
    const divisor = 21 + (i % 17);
    const qLow = Math.max(10, Math.ceil(100 / divisor));
    const qHigh = Math.min(29, Math.floor(999 / divisor));
    if (qLow > qHigh) throw new Error(`L5-${i}: 피제수 세 자리 불가`);
    const q = qLow + (i % (qHigh - qLow + 1));
    const dividend = divisor * q;
    assertDivisible(dividend, divisor, q, `L5-${i}`);
    const situation = pickSituation(lesson, i);
    const useEstimate = i % 2 === 0 && i % 9 === 0;
    const questionKind: QuestionKind = useEstimate ? "estimate" : "computation";

    if (i % 2 === 0) {
      const prompt = useEstimate
        ? `${dividend} ÷ ${divisor}의 몫을 어림할 때, 실제 몫에 가장 가까운 수를 고르세요.`
        : `${dividend} ÷ ${divisor}의 몫은? (나누어떨어짐)`;
      out.push({
        id: `L5-O${i}`,
        level: 5,
        lesson,
        type: "objective",
        questionKind,
        achievementStandard,
        situation,
        prompt,
        choices: useEstimate ? makeEstimateQuotientChoices(q) : [String(q), String(q + 1), String(Math.max(1, q - 1)), String(q + 2)],
        answer: String(q),
        explanation: useEstimate
          ? `실제 몫은 ${q}입니다. 세 자리 피제수, 몫은 두 자리.`
          : `몫은 두 자리입니다. 나누어떨어지며 소수는 없습니다.`,
      });
    } else {
      out.push({
        id: `L5-S${i}`,
        level: 5,
        lesson,
        type: "subjective",
        questionKind: "computation",
        achievementStandard,
        situation,
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
  const lesson = 7;
  const achievementStandard = achievementForLesson(lesson);
  for (let i = 1; i <= 100; i += 1) {
    if (tryPushPrinciple(out, 6, lesson, i)) continue;
    const divisor = 25 + (i % 19);
    const q = 10 + (i % 18);
    const mod = Math.max(2, divisor - 1);
    const r = 1 + (i % mod);
    let dividend = divisor * q + r;
    if (dividend < 100) {
      const bumpQ = Math.max(q, Math.ceil((100 - r) / divisor));
      const dividend2 = divisor * bumpQ + r;
      assertDivisionWithRemainder(dividend2, divisor, bumpQ, r, `L6-${i}-bump`);
      dividend = dividend2;
    }
    const qFinal = Math.floor((dividend - r) / divisor);
    assertDivisionWithRemainder(dividend, divisor, qFinal, r, `L6-${i}`);

    const situation = pickSituation(lesson, i);
    const correct = quotientRemainderAnswer(qFinal, r);

    if (i % 2 === 0) {
      const rWrong = pickWrongRemainder(divisor, r);
      const w1 = `${qFinal + 1} ... ${r}`;
      const w2 = `${qFinal} ... ${rWrong}`;
      const w3 = qFinal > 10 ? `${qFinal - 1} ... ${r}` : `${qFinal + 2} ... ${r}`;
      const w4 = `${qFinal + 1} ... ${rWrong}`;
      const dedup = [...new Set([correct.replaceAll("...", " ... "), w1, w2, w3, w4])];
      if (dedup.length < 4) {
        throw new Error(`L6-O${i}: 보기 4개 확보 실패`);
      }
      out.push({
        id: `L6-O${i}`,
        level: 6,
        lesson,
        type: "objective",
        questionKind: "computation",
        achievementStandard,
        situation,
        prompt: `${dividend} ÷ ${divisor} — 몫과 나머지를 고르세요. (${formatQrPromptSuffix()})`,
        choices: dedup.slice(0, 4),
        answer: correct,
        explanation: `몫·나머지는 정수이고, 나머지는 나누는 수보다 작습니다. 소수는 사용하지 않습니다.`,
      });
    } else {
      out.push({
        id: `L6-S${i}`,
        level: 6,
        lesson,
        type: "subjective",
        questionKind: "computation",
        achievementStandard,
        situation,
        prompt: `${dividend} ÷ ${divisor}의 몫과 나머지를 입력하세요. (${formatQrPromptSuffix()})`,
        answer: correct,
        explanation: `정답은 ${correct.replaceAll("...", " ... ")} 형태입니다. 피제수 = 몫×나누는 수+나머지로 검산할 수 있습니다.`,
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

/** 주관식·객관식 정답 비교용. 곱셈 숫자, 쉼표, `몫 ... 나머지` 변형 허용 */
export function normalizeAnswer(answer: string) {
  let raw = answer.replaceAll(",", "").trim();
  const compact = raw.replace(/\s+/g, "");

  const compound = /^(\d+)(?:\.{2,}|…+|\/)(\d+)$/;
  const cm = compact.match(compound);
  if (cm) {
    return `${cm[1]}...${cm[2]}`;
  }

  let s = compact;
  const asInt = /^(\d+)\.0+$/;
  const m = s.match(asInt);
  if (m) s = m[1];
  return s;
}
