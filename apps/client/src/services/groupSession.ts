import {
  get,
  onValue,
  push,
  ref,
  runTransaction,
  set,
  update,
  type Database,
} from "firebase/database";
import type { GroupId } from "../types/game";
import { realtimeDb } from "../config/firebase";

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
  totalAttempts?: number;
  totalCorrect?: number;
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

function membersRootRef(db: Database, groupId: GroupId) {
  return ref(db, `groups/${groupId}/members`);
}

function parseMembersMap(current: unknown): Record<string, GroupSessionInfo> {
  if (current == null || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, GroupSessionInfo>;
}

function normalizeClassCode(value: unknown): string {
  return String(value ?? "").trim();
}

async function setOnlineCountFromMembers(groupId: GroupId) {
  const snap = await get(membersRootRef(realtimeDb, groupId));
  const n = snap.exists() ? Object.keys(snap.val() as object).length : 0;
  await set(groupCountRef(realtimeDb, groupId), n);
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
  const membersRoot = membersRootRef(realtimeDb, groupId);
  const joinedAt = Date.now();
  const session: GroupSessionInfo = {
    userId,
    userName,
    classCode,
    groupId,
    joinedAt,
  };

  await runTransaction(membersRoot, (current) => {
    const cur = parseMembersMap(current);
    const currentUser = cur[userId];
    const next = { ...cur };

    // 같은 반으로 재입장하는 경우는 기존 세션을 최신 정보로 갱신
    if (currentUser && normalizeClassCode(currentUser.classCode) === normalizeClassCode(classCode)) {
      next[userId] = session;
      return next;
    }

    next[userId] = session;
    return next;
  });

  await setOnlineCountFromMembers(groupId);

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
  const membersRoot = membersRootRef(realtimeDb, groupId);

  if (!snapshot.exists()) {
    await update(ref(realtimeDb, `students/${userId}`), {
      groupId: null,
      online: false,
      updatedAt: Date.now(),
    });
    await setOnlineCountFromMembers(groupId);
    return;
  }

  const classCode = (snapshot.val() as { classCode?: string })?.classCode ?? "";

  await runTransaction(membersRoot, (current) => {
    const cur = parseMembersMap(current);
    if (!cur[userId]) {
      return cur;
    }
    const next = { ...cur };
    delete next[userId];
    return Object.keys(next).length === 0 ? null : next;
  });

  await setOnlineCountFromMembers(groupId);

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
  const level = Number(value.level ?? 1);
  const levelProgress = Number(value.levelProgress ?? 0);
  const fallbackCorrect = Math.max(
    0,
    Math.round((Math.max(1, level) - 1) * 15 + (Math.max(0, levelProgress) / 100) * 15),
  );
  const totalCorrect = Number(value.totalCorrect ?? fallbackCorrect);
  const recentAccuracy = Number(value.recentAccuracy ?? 0);
  const fallbackAttempts =
    recentAccuracy > 0 ? Math.max(totalCorrect, Math.round((totalCorrect * 100) / recentAccuracy)) : totalCorrect;
  return {
    level,
    levelProgress,
    recentAccuracy,
    totalAttempts: Number(value.totalAttempts ?? fallbackAttempts),
    totalCorrect,
    wrongStreak: Number(value.wrongStreak ?? 0),
    hp: Number(value.hp ?? 100),
    appearanceTier: Number(value.appearanceTier ?? 1),
    earnedItems: Array.isArray(value.earnedItems)
      ? value.earnedItems.map((item: unknown) => String(item))
      : [],
  };
}

/** 드롭다운 현재 인원: 같은 반 기준 `members` 수 — `onlineCount`와 불일치해도 화면은 멤버 기준 */
export function subscribeGroupCounts(
  classCode: string,
  callback: (counts: Record<number, number>) => void,
) {
  const countsRoot = ref(realtimeDb, "groups");
  return onValue(countsRoot, (snapshot) => {
    const raw = snapshot.val() ?? {};
    const normalized = normalizeClassCode(classCode);
    const countByClass = (groupNode: unknown) => {
      if (!groupNode || typeof groupNode !== "object") return 0;
      const members = (groupNode as { members?: unknown }).members;
      if (!members || typeof members !== "object" || Array.isArray(members)) return 0;
      return Object.values(members as Record<string, GroupSessionInfo>).filter(
        (member) => normalizeClassCode(member?.classCode) === normalized,
      ).length;
    };
    callback({
      1: countByClass(raw?.["1"]),
      2: countByClass(raw?.["2"]),
      3: countByClass(raw?.["3"]),
      4: countByClass(raw?.["4"]),
      5: countByClass(raw?.["5"]),
    });
  });
}

export type GroupMemberSummary = {
  userId: string;
  userName: string;
  joinedAt: number;
};

/** 같은 모둠에 입장한 멤버 목록 (입장 순) */
export function subscribeGroupMembers(
  groupId: GroupId,
  classCode: string,
  callback: (members: GroupMemberSummary[]) => void,
) {
  const membersRoot = ref(realtimeDb, `groups/${groupId}/members`);
  return onValue(membersRoot, (snapshot) => {
    const raw = snapshot.val() ?? {};
    const list: GroupMemberSummary[] = Object.entries(raw).map(([userId, value]) => {
      const v = value as { userName?: string; joinedAt?: number; classCode?: string };
      if (normalizeClassCode(v?.classCode) !== normalizeClassCode(classCode)) return null;
      return {
        userId,
        userName: String(v?.userName ?? "학생"),
        joinedAt: Number(v?.joinedAt ?? 0),
      };
    }).filter((entry): entry is GroupMemberSummary => entry != null);
    list.sort((a, b) => a.joinedAt - b.joinedAt);
    callback(list);
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
  totalAttempts: number;
  totalCorrect: number;
  wrongStreak: number;
  hp: number;
  appearanceTier: number;
  earnedItems: string[];
}) {
  // 관리자가 모둠/학생을 삭제한 뒤에는 학생 상태를 다시 생성하지 않도록 가드
  const memberSnapshot = await get(memberRef(realtimeDb, input.groupId, input.userId));
  if (!memberSnapshot.exists()) return;
  const memberClassCode = String((memberSnapshot.val() as { classCode?: string })?.classCode ?? "");
  if (memberClassCode && memberClassCode !== input.classCode) return;

  await update(ref(realtimeDb, `students/${input.userId}`), {
    userId: input.userId,
    name: input.userName,
    classCode: input.classCode,
    groupId: input.groupId,
    level: input.level,
    levelProgress: input.levelProgress,
    recentAccuracy: input.recentAccuracy,
    totalAttempts: input.totalAttempts,
    totalCorrect: input.totalCorrect,
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

/** 교사가 같은 반 학생을 모둠에서 제외할 때 (학생 클라이언트는 RTDB 구독으로 동기화) */
export async function adminRemoveStudentFromGroup(
  teacherClassCode: string,
  studentUserId: string,
): Promise<void> {
  const snapshot = await get(ref(realtimeDb, `students/${studentUserId}`));
  if (!snapshot.exists()) {
    throw new Error("학생 정보를 찾을 수 없습니다.");
  }
  const v = snapshot.val() as Record<string, unknown>;
  if (String(v?.classCode ?? "") !== teacherClassCode) {
    throw new Error("이 반 학생만 조정할 수 있습니다.");
  }
  const rawGid = v?.groupId;
  if (rawGid === null || rawGid === undefined || rawGid === "") {
    throw new Error("모둠에 없는 학생입니다.");
  }
  const groupId = Number(rawGid) as GroupId;
  const userName = String(v?.name ?? "학생");
  await leaveGroup(groupId, studentUserId, userName);
}
