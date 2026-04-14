import {
  get,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
  type Database,
} from "firebase/database";
import type { GroupId } from "../types/game";
import { realtimeDb } from "../config/firebase";

const MAX_GROUP_SIZE = 5;

export interface GroupSessionInfo {
  userId: string;
  userName: string;
  classCode: string;
  groupId: GroupId;
  joinedAt: number;
}

interface ActivityLogPayload {
  type: string;
  userId: string;
  userName: string;
  classCode: string;
  groupId: GroupId;
  at?: number;
  extra?: Record<string, unknown>;
}

export interface PersistedStudentState {
  level?: number;
  levelProgress?: number;
  recentAccuracy?: number;
  wrongStreak?: number;
  hp?: number;
  appearanceTier?: number;
  earnedItems?: string[];
}

function groupCountRef(db: Database, groupId: GroupId) {
  return ref(db, `groups/${groupId}/onlineCount`);
}

function memberRef(db: Database, groupId: GroupId, userId: string) {
  return ref(db, `groups/${groupId}/members/${userId}`);
}

async function pushActivityLog(payload: ActivityLogPayload) {
  const eventRef = push(ref(realtimeDb, `activityLogs/${payload.groupId}`));
  await set(eventRef, {
    type: payload.type,
    userId: payload.userId,
    userName: payload.userName,
    classCode: payload.classCode,
    groupId: payload.groupId,
    at: payload.at ?? Date.now(),
    ...(payload.extra ?? {}),
  });
}

export async function joinGroup(
  groupId: GroupId,
  userId: string,
  userName: string,
  classCode: string,
) {
  const countRef = groupCountRef(realtimeDb, groupId);
  const tx = await runTransaction(countRef, (current) => {
    const value = typeof current === "number" ? current : 0;
    if (value >= MAX_GROUP_SIZE) {
      return;
    }
    return value + 1;
  });

  if (!tx.committed) {
    throw new Error("선택한 모둠 인원이 가득 찼습니다.");
  }

  const session: GroupSessionInfo = {
    userId,
    userName,
    classCode,
    groupId,
    joinedAt: Date.now(),
  };

  await set(memberRef(realtimeDb, groupId, userId), session);
  await update(ref(realtimeDb, `students/${userId}`), {
    userId,
    name: userName,
    classCode,
    groupId,
    online: true,
    updatedAt: Date.now(),
  });
  await pushActivityLog({
    type: "JOIN_GROUP",
    userId,
    userName,
    classCode,
    groupId,
  });
}

export async function leaveGroup(groupId: GroupId, userId: string, userName: string) {
  const targetMemberRef = memberRef(realtimeDb, groupId, userId);
  const snapshot = await get(targetMemberRef);
  if (!snapshot.exists()) {
    return;
  }

  await remove(targetMemberRef);
  await runTransaction(groupCountRef(realtimeDb, groupId), (current) => {
    const value = typeof current === "number" ? current : 0;
    return Math.max(0, value - 1);
  });

  const classCode = snapshot.val()?.classCode ?? "";
  await pushActivityLog({
    type: "LEAVE_GROUP",
    userId,
    userName,
    classCode,
    groupId,
  });
  await update(ref(realtimeDb, `students/${userId}`), {
    groupId: null,
    online: false,
    updatedAt: Date.now(),
  });
}

export async function getStudentState(userId: string): Promise<PersistedStudentState | null> {
  const snapshot = await get(ref(realtimeDb, `students/${userId}`));
  if (!snapshot.exists()) return null;
  const value = snapshot.val() ?? {};
  return {
    level: Number(value.level ?? 1),
    levelProgress: Number(value.levelProgress ?? 0),
    recentAccuracy: Number(value.recentAccuracy ?? 0),
    wrongStreak: Number(value.wrongStreak ?? 0),
    hp: Number(value.hp ?? 100),
    appearanceTier: Number(value.appearanceTier ?? 1),
    earnedItems: Array.isArray(value.earnedItems)
      ? value.earnedItems.map((item: unknown) => String(item))
      : [],
  };
}

export function subscribeGroupCounts(callback: (counts: Record<number, number>) => void) {
  const countsRoot = ref(realtimeDb, "groups");
  return onValue(countsRoot, (snapshot) => {
    const raw = snapshot.val() ?? {};
    callback({
      1: raw?.["1"]?.onlineCount ?? 0,
      2: raw?.["2"]?.onlineCount ?? 0,
      3: raw?.["3"]?.onlineCount ?? 0,
      4: raw?.["4"]?.onlineCount ?? 0,
      5: raw?.["5"]?.onlineCount ?? 0,
    });
  });
}

export async function syncStudentBattleState(input: {
  userId: string;
  userName: string;
  classCode: string;
  groupId: GroupId;
  level: number;
  levelProgress: number;
  recentAccuracy: number;
  wrongStreak: number;
  hp: number;
  appearanceTier: number;
  earnedItems: string[];
}) {
  await update(ref(realtimeDb, `students/${input.userId}`), {
    userId: input.userId,
    name: input.userName,
    classCode: input.classCode,
    groupId: input.groupId,
    level: input.level,
    levelProgress: input.levelProgress,
    recentAccuracy: input.recentAccuracy,
    wrongStreak: input.wrongStreak,
    hp: input.hp,
    appearanceTier: input.appearanceTier,
    earnedItems: input.earnedItems,
    online: true,
    updatedAt: Date.now(),
  });
}

export async function logBattleEvent(input: {
  type: "BATTLE_CORRECT" | "BATTLE_WRONG" | "LEVEL_UP" | "LEVEL_DOWN" | "GAME_CLEAR";
  userId: string;
  userName: string;
  classCode: string;
  groupId: GroupId;
  extra?: Record<string, unknown>;
}) {
  await pushActivityLog({
    ...input,
    extra: input.extra,
  });
}
