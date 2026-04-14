import type { BattleQuestion } from "../types/game";

const LEVEL_TO_LESSON: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
};

const QUESTIONS: BattleQuestion[] = [
  {
    id: "L1-O1",
    level: 1,
    lesson: 2,
    type: "objective",
    prompt: "123 × 20의 값을 고르세요.",
    choices: ["246", "2,460", "24,600", "1,230"],
    answer: "2,460",
    explanation: "123×2=246, 여기에 10배를 해서 2,460입니다.",
  },
  {
    id: "L1-S1",
    level: 1,
    lesson: 2,
    type: "subjective",
    prompt: "340 × 30 = ? (숫자만 입력)",
    answer: "10200",
    explanation: "34×3=102, 뒤에 0 두 개를 붙이면 10,200입니다.",
  },
  {
    id: "L2-O1",
    level: 2,
    lesson: 3,
    type: "objective",
    prompt: "213 × 18 계산으로 알맞은 것은?",
    choices: ["3,834", "2,034", "4,824", "3,294"],
    answer: "3,834",
    explanation: "213×(10+8)=2,130+1,704=3,834입니다.",
  },
  {
    id: "L2-S1",
    level: 2,
    lesson: 3,
    type: "subjective",
    prompt: "456 × 12 = ? (숫자만 입력)",
    answer: "5472",
    explanation: "456×10=4,560, 456×2=912, 합하면 5,472입니다.",
  },
  {
    id: "L3-O1",
    level: 3,
    lesson: 4,
    type: "objective",
    prompt: "160 ÷ 20의 몫은?",
    choices: ["8", "80", "18", "6"],
    answer: "8",
    explanation: "160을 20씩 묶으면 8묶음입니다.",
  },
  {
    id: "L3-S1",
    level: 3,
    lesson: 4,
    type: "subjective",
    prompt: "350 ÷ 50 = ? (숫자만 입력)",
    answer: "7",
    explanation: "35÷5와 같은 관계로 7입니다.",
  },
  {
    id: "L4-O1",
    level: 4,
    lesson: 5,
    type: "objective",
    prompt: "96 ÷ 24의 몫은?",
    choices: ["3", "4", "5", "6"],
    answer: "4",
    explanation: "24×4=96 이므로 몫은 4입니다.",
  },
  {
    id: "L4-S1",
    level: 4,
    lesson: 5,
    type: "subjective",
    prompt: "84 ÷ 21 = ? (숫자만 입력)",
    answer: "4",
    explanation: "21×4=84이므로 몫은 4입니다.",
  },
  {
    id: "L5-O1",
    level: 5,
    lesson: 6,
    type: "objective",
    prompt: "736 ÷ 32의 몫은?",
    choices: ["22", "23", "24", "25"],
    answer: "23",
    explanation: "32×23=736, 나누어떨어집니다.",
  },
  {
    id: "L5-S1",
    level: 5,
    lesson: 6,
    type: "subjective",
    prompt: "624 ÷ 24 = ? (숫자만 입력)",
    answer: "26",
    explanation: "24×26=624입니다.",
  },
  {
    id: "L6-O1",
    level: 6,
    lesson: 7,
    type: "objective",
    prompt: "950 ÷ 45의 계산 결과로 알맞은 것은?",
    choices: ["21 ... 5", "20 ... 50", "22 ... 10", "19 ... 95"],
    answer: "21 ... 5",
    explanation: "45×21=945, 나머지 5입니다.",
  },
  {
    id: "L6-S1",
    level: 6,
    lesson: 7,
    type: "subjective",
    prompt: "437 ÷ 21의 몫만 입력하세요.",
    answer: "20",
    explanation: "21×20=420, 21×21=441(초과)라서 몫은 20입니다.",
  },
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
