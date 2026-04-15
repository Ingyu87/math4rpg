import type { AchievementLevel } from "../config/achievement";

export type GroupId = 1 | 2 | 3 | 4 | 5;

export interface StudentStatus {
  id: string;
  name: string;
  /** 모둠 미참가·퇴장 후 RTDB `groupId: null` → null */
  groupId: GroupId | null;
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

/** 교육과정 성취기준 코드(곱셈 차시·나눗셈 차시 구분 표기용) */
export type AchievementStandardCode = "4수01-04" | "4수01-07";

export type QuestionKind = "computation" | "estimate" | "principle";

export interface BattleQuestion {
  id: string;
  level: number;
  lesson: number;
  type: QuestionType;
  /** 계산형·몫 어림·원리 O/X 등 */
  questionKind?: QuestionKind;
  achievementStandard: AchievementStandardCode;
  /** 실생활 맥락 한 문장(있으면 학생 화면에 별도 표시) */
  situation?: string;
  prompt: string;
  choices?: string[];
  answer: string;
  explanation: string;
}
