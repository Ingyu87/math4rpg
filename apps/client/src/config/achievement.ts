export type AchievementLevel =
  | "도전"
  | "기초"
  | "발전"
  | "숙련"
  | "심화"
  | "확장";

export const ACHIEVEMENT_COLORS: Record<AchievementLevel, string> = {
  도전: "#9CA3AF",
  기초: "#60A5FA",
  발전: "#34D399",
  숙련: "#3B82F6",
  심화: "#A78BFA",
  확장: "#F59E0B",
};

export const LEVEL_TO_ACHIEVEMENT: Record<number, AchievementLevel> = {
  1: "도전",
  2: "기초",
  3: "발전",
  4: "숙련",
  5: "심화",
  6: "확장",
};

export const ACHIEVEMENT_TITLES: Record<AchievementLevel, string> = {
  도전: "1수준: 기본 곱셈·나눗셈 시작",
  기초: "2수준: 세 자리×몇십 기초 수행",
  발전: "3수준: 세 자리×두 자리/몇십 나눗셈 이해",
  숙련: "4수준: 두 자리 나눗셈 안정 수행",
  심화: "5수준: 두 자리 몫 계산 숙달",
  확장: "6수준: 몫·나머지 관계식까지 적용",
};

export const ACHIEVEMENT_DESCRIPTIONS: Record<AchievementLevel, string> = {
  도전: "한 자리·기본 연산 규칙을 다시 확인하며 천천히 정확도를 만드는 단계",
  기초: "세 자리 수와 몇십의 곱셈을 절차에 맞춰 해결할 수 있는 단계",
  발전: "곱셈/나눗셈 유형을 구분해 계산 전략을 선택할 수 있는 단계",
  숙련: "두 자리 수로 나누는 계산을 실수 없이 안정적으로 수행하는 단계",
  심화: "몫의 자릿수 판단과 검산을 스스로 적용할 수 있는 단계",
  확장: "나머지 포함 나눗셈에서 관계식을 활용해 설명·검증까지 가능한 단계",
};

export function getAchievementByLevel(level: number): AchievementLevel {
  return LEVEL_TO_ACHIEVEMENT[level] ?? "도전";
}
