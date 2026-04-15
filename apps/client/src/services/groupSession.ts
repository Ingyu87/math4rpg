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

function membersRootRef(db: Database, groupId: GroupId) {
  return ref(db, `groups/${groupId}/members`);
}

function parseMembersMap(current: unknown): Record<string, GroupSessionInfo> {
  if (current == null || typeof current !== "object" || Array.isArray(current)) {
    return {};
  }
  return current as Record<string, GroupSessionInfo>;
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
  const existingMember = await get(memberRef(realtimeDb, groupId, userId));

  const joinedAt = Date.now();
  const session: GroupSessionInfo = {
    userId,
    userName,
    classCode,
    groupId,
    joinedAt,
  };

  /** 이미 이 모둠 멤버면 카운트만 맞추고 학생 노드만 갱신 (탭 복구·새로고침) */
  if (existingMember.exists()) {
    await update(ref(realtimeDb, `students/${userId}`), {
      userId,
      name: userName,
      classCode,
      groupId,
      online: true,
      updatedAt: Date.now(),
    });
    await setOnlineCountFromMembers(groupId);
    return;
  }

  const tx = await runTransaction(membersRoot, (current) => {
    const cur = parseMembersMap(current);
    if (cur[userId]) {
      return cur;
    }
    if (Object.keys(cur).length >= MAX_GROUP_SIZE) {
      return;
    }
    return { ...cur, [userId]: session };
  });

  if (!tx.committed) {
    throw new Error("선택한 모둠 인원이 가득 찼습니다.");
  }

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

function memberCountFromGroupNode(groupNode: unknown): number {
  if (!groupNode || typeof groupNode !== "object") return 0;
  const members = (groupNode as { members?: unknown }).members;
  if (!members || typeof members !== "object" || Array.isArray(members)) return 0;
  return Object.keys(members as object).length;
}

/** 드롭다운 (n/5): `members` 실제 키 개수 기준 — `onlineCount`와 불일치해도 화면은 멤버 기준 */
export function subscribeGroupCounts(callback: (counts: Record<number, number>) => void) {
  const countsRoot = ref(realtimeDb, "groups");
  return onValue(countsRoot, (snapshot) => {
    const raw = snapshot.val() ?? {};
    callback({
      1: memberCountFromGroupNode(raw?.["1"]),
      2: memberCountFromGroupNode(raw?.["2"]),
      3: memberCountFromGroupNode(raw?.["3"]),
      4: memberCountFromGroupNode(raw?.["4"]),
      5: memberCountFromGroupNode(raw?.["5"]),
    });
  });
}

export type GroupMemberSummary = {
  userId: string;
  userName: string;
  joinedAt: number;
};

/** 같은 모둠에 입장한 멤버 목록 (입장 순). 최대 5명 */
export function subscribeGroupMembers(
  groupId: GroupId,
  callback: (members: GroupMemberSummary[]) => void,
) {
  const membersRoot = ref(realtimeDb, `groups/${groupId}/members`);
  return onValue(membersRoot, (snapshot) => {
    const raw = snapshot.val() ?? {};
    const list: GroupMemberSummary[] = Object.entries(raw).map(([userId, value]) => {
      const v = value as { userName?: string; joinedAt?: number };
      return {
        userId,
        userName: String(v?.userName ?? "학생"),
        joinedAt: Number(v?.joinedAt ?? 0),
      };
    });
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
