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

export function getAchievementByLevel(level: number): AchievementLevel {
  return LEVEL_TO_ACHIEVEMENT[level] ?? "도전";
}
