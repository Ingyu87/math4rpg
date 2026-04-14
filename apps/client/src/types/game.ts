import type { AchievementLevel } from "../config/achievement";

export type GroupId = 1 | 2 | 3 | 4 | 5;

export interface StudentStatus {
  id: string;
  name: string;
  groupId: GroupId;
  level: number;
  levelProgress: number;
  recentAccuracy: number;
  wrongStreak: number;
  hp: number;
  appearanceTier: number;
  earnedItems: string[];
  achievement: AchievementLevel;
  online: boolean;
}

export interface GroupStatus {
  groupId: GroupId;
  onlineCount: number;
  avgLevel: number;
  avgAccuracy: number;
}

export interface ActivityLog {
  id: string;
  type: string;
  userId: string;
  userName: string;
  classCode: string;
  groupId: GroupId;
  at: number;
  extra?: Record<string, unknown>;
}

export type QuestionType = "objective" | "subjective";

export interface BattleQuestion {
  id: string;
  level: number;
  lesson: number;
  type: QuestionType;
  prompt: string;
  choices?: string[];
  answer: string;
  explanation: string;
}
