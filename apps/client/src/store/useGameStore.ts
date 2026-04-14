import { create } from "zustand";
import {
  ACHIEVEMENT_COLORS,
  getAchievementByLevel,
} from "../config/achievement";
import type { GroupStatus, StudentStatus } from "../types/game";

interface GameState {
  students: StudentStatus[];
  groups: GroupStatus[];
}

const mockStudents: StudentStatus[] = [
  {
    id: "s1",
    name: "김하늘",
    groupId: 1,
    level: 2,
    levelProgress: 47,
    recentAccuracy: 82,
    wrongStreak: 1,
    hp: 80,
    appearanceTier: 2,
    earnedItems: ["별 목걸이"],
    achievement: getAchievementByLevel(2),
    online: true,
  },
  {
    id: "s2",
    name: "박민준",
    groupId: 1,
    level: 4,
    levelProgress: 66,
    recentAccuracy: 90,
    wrongStreak: 0,
    hp: 100,
    appearanceTier: 4,
    earnedItems: ["하트 배지", "반짝 망토"],
    achievement: getAchievementByLevel(4),
    online: true,
  },
  {
    id: "s3",
    name: "이서윤",
    groupId: 3,
    level: 5,
    levelProgress: 40,
    recentAccuracy: 76,
    wrongStreak: 2,
    hp: 70,
    appearanceTier: 5,
    earnedItems: ["무지개 안경", "토끼 귀 장식", "리본 모자"],
    achievement: getAchievementByLevel(5),
    online: true,
  },
];

const mockGroups: GroupStatus[] = [
  { groupId: 1, onlineCount: 2, avgLevel: 3, avgAccuracy: 86 },
  { groupId: 2, onlineCount: 0, avgLevel: 0, avgAccuracy: 0 },
  { groupId: 3, onlineCount: 1, avgLevel: 5, avgAccuracy: 76 },
  { groupId: 4, onlineCount: 0, avgLevel: 0, avgAccuracy: 0 },
  { groupId: 5, onlineCount: 0, avgLevel: 0, avgAccuracy: 0 },
];

export const useGameStore = create<GameState>(() => ({
  students: mockStudents,
  groups: mockGroups,
}));

export { ACHIEVEMENT_COLORS };
