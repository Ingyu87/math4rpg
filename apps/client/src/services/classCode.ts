import {
  get,
  onValue,
  ref,
  runTransaction,
  update,
  remove,
  type Unsubscribe,
} from "firebase/database";
import { getAchievementByLevel } from "../config/achievement";
import { realtimeDb } from "../config/firebase";
import type { ActivityLog, GroupId, StudentStatus } from "../types/game";

const CLASS_CODE_REGEX = /^\d{5}$/;

export function isValidClassCode(code: string) {
  return CLASS_CODE_REGEX.test(code);
}

function randomClassCode() {
  return String(Math.floor(Math.random() * 100000)).padStart(5, "0");
}

export async function getTeacherClassCode(teacherUid: string) {
  const snap = await get(ref(realtimeDb, `teachers/${teacherUid}/classCode`));
  return snap.exists() ? (snap.val() as string) : null;
}

export async function createTeacherClassCode(teacherUid: string, teacherEmail: string) {
  const previous = await getTeacherClassCode(teacherUid);
  for (let i = 0; i < 30; i += 1) {
    const code = randomClassCode();
    const codeRef = ref(realtimeDb, `classrooms/${code}`);
    const tx = await runTransaction(codeRef, (current) => {
      if (current) return;
      return {
        teacherUid,
        teacherEmail,
        active: true,
        createdAt: Date.now(),
      };
    });
    if (tx.committed) {
      if (previous) {
        await update(ref(realtimeDb, `classrooms/${previous}`), {
          active: false,
          disabledAt: Date.now(),
        });
      }
      await update(ref(realtimeDb, `teachers/${teacherUid}`), {
        classCode: code,
        updatedAt: Date.now(),
      });
      return code;
    }
  }
  throw new Error("반코드 생성에 실패했습니다. 다시 시도해 주세요.");
}

export async function ensureTeacherClassCode(teacherUid: string, teacherEmail: string) {
  const existing = await getTeacherClassCode(teacherUid);
  if (existing) {
    const classroomSnap = await get(ref(realtimeDb, `classrooms/${existing}`));
    if (classroomSnap.exists() && classroomSnap.val()?.active !== false) {
      return existing;
    }
  }
  return createTeacherClassCode(teacherUid, teacherEmail);
}

export async function classCodeExists(classCode: string) {
  if (!isValidClassCode(classCode)) return false;
  const snap = await get(ref(realtimeDb, `classrooms/${classCode}`));
  if (!snap.exists()) return false;
  return snap.val()?.active !== false;
}

/** RTDB `groupId`가 null·빈값이면 모둠 미참가 (`?? 1`이면 퇴장 후에도 1모둠로 잘못 표시됨) */
function parseStudentGroupId(raw: unknown): GroupId | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 5) return null;
  return n as GroupId;
}

function toStudentStatus(userId: string, value: any): StudentStatus {
  const level = Number(value?.level ?? 1);
  return {
    id: userId,
    name: String(value?.name ?? "학생"),
    groupId: parseStudentGroupId(value?.groupId),
    level,
    levelProgress: Number(value?.levelProgress ?? 0),
    recentAccuracy: Number(value?.recentAccuracy ?? 0),
    wrongStreak: Number(value?.wrongStreak ?? 0),
    hp: Number(value?.hp ?? 100),
    appearanceTier: Number(value?.appearanceTier ?? 1),
    earnedItems: Array.isArray(value?.earnedItems)
      ? value.earnedItems.map((item: unknown) => String(item))
      : [],
    achievement: getAchievementByLevel(level),
    online: Boolean(value?.online),
  };
}

export function subscribeStudentsByClassCode(
  classCode: string,
  callback: (students: StudentStatus[]) => void,
): Unsubscribe {
  const studentsRef = ref(realtimeDb, "students");
  return onValue(studentsRef, (snapshot) => {
    const raw = snapshot.val() ?? {};
    const filtered = Object.entries(raw)
      .filter(([, value]) => (value as any)?.classCode === classCode)
      .map(([userId, value]) => toStudentStatus(userId, value));
    callback(filtered);
  });
}

/** 같은 반·해당 게임 레벨에 머문 학생만 모아, 성취율(levelProgress) 순으로 정렬한 실시간 랭킹 */
export type LevelRankingEntry = {
  userId: string;
  name: string;
  levelProgress: number;
  groupId: GroupId | null;
  online: boolean;
};

const RANKING_TOP_N = 8;

function emptyLevelRankings(): Record<number, LevelRankingEntry[]> {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

function emptyPerGroupByLevel(): Record<number, Record<GroupId, LevelRankingEntry[]>> {
  const out: Record<number, Record<GroupId, LevelRankingEntry[]>> = {};
  for (let lv = 1; lv <= 6; lv += 1) {
    out[lv] = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  }
  return out;
}

/** 반 전체 상위 + 레벨별 모둠(1~5) 내부 상위 */
export type LiveRankingsBundle = {
  classByLevel: Record<number, LevelRankingEntry[]>;
  perGroupByLevel: Record<number, Record<GroupId, LevelRankingEntry[]>>;
};

export function emptyLiveRankingsBundle(): LiveRankingsBundle {
  return {
    classByLevel: emptyLevelRankings(),
    perGroupByLevel: emptyPerGroupByLevel(),
  };
}

function sortRankingEntries(
  entries: LevelRankingEntry[],
  raw: Record<string, unknown>,
): LevelRankingEntry[] {
  return [...entries]
    .map((entry) => ({
      entry,
      t: Number((raw[entry.userId] as { updatedAt?: number })?.updatedAt ?? 0),
    }))
    .sort((a, b) => {
      if (b.entry.levelProgress !== a.entry.levelProgress) {
        return b.entry.levelProgress - a.entry.levelProgress;
      }
      return b.t - a.t;
    })
    .map(({ entry }) => entry);
}

export function subscribeLevelRankingsByClassCode(
  classCode: string,
  callback: (bundle: LiveRankingsBundle) => void,
): Unsubscribe {
  const studentsRef = ref(realtimeDb, "students");
  return onValue(studentsRef, (snapshot) => {
    const raw = snapshot.val() ?? {};
    const buckets = emptyLevelRankings();
    for (const [userId, value] of Object.entries(raw)) {
      const v = value as any;
      if (String(v?.classCode ?? "") !== classCode) continue;
      const level = Number(v?.level ?? 1);
      if (level < 1 || level > 6) continue;
      buckets[level].push({
        userId,
        name: String(v?.name ?? "학생"),
        levelProgress: Number(v?.levelProgress ?? 0),
        groupId: parseStudentGroupId(v?.groupId),
        online: Boolean(v?.online),
      });
    }
    const classByLevel = emptyLevelRankings();
    const perGroupByLevel = emptyPerGroupByLevel();
    for (let lv = 1; lv <= 6; lv += 1) {
      const sorted = sortRankingEntries(buckets[lv], raw);
      classByLevel[lv] = sorted.slice(0, RANKING_TOP_N);
      for (const gid of [1, 2, 3, 4, 5] as GroupId[]) {
        perGroupByLevel[lv][gid] = sorted
          .filter((e) => e.groupId === gid)
          .slice(0, RANKING_TOP_N);
      }
    }
    callback({ classByLevel, perGroupByLevel });
  });
}

function toActivityLog(groupId: GroupId, id: string, value: any): ActivityLog {
  const extra =
    value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).filter(
            ([key]) =>
              !["type", "userId", "userName", "classCode", "groupId", "at"].includes(
                key,
              ),
          ),
        )
      : undefined;
  return {
    id,
    type: String(value?.type ?? "UNKNOWN"),
    userId: String(value?.userId ?? ""),
    userName: String(value?.userName ?? "학생"),
    classCode: String(value?.classCode ?? ""),
    groupId,
    at: Number(value?.at ?? 0),
    extra: extra && Object.keys(extra).length > 0 ? extra : undefined,
  };
}

export function subscribeActivityLogsByClassCode(
  classCode: string,
  callback: (logs: ActivityLog[]) => void,
): Unsubscribe {
  const rootRef = ref(realtimeDb, "activityLogs");
  return onValue(rootRef, (snapshot) => {
    const raw = snapshot.val() ?? {};
    const merged: ActivityLog[] = [];
    [1, 2, 3, 4, 5].forEach((groupNum) => {
      const groupLogs = raw?.[String(groupNum)] ?? {};
      Object.entries(groupLogs).forEach(([id, value]) => {
        const item = toActivityLog(groupNum as GroupId, id, value);
        if (item.classCode === classCode) {
          merged.push(item);
        }
      });
    });
    merged.sort((a, b) => b.at - a.at);
    callback(merged.slice(0, 50));
  });
}

/** 관리자용: 반 활동로그 + 학생 성취수준(학습 상태) 초기화 */
export async function resetClassProgressAndActivity(classCode: string): Promise<{
  resetStudents: number;
  removedLogs: number;
}> {
  if (!isValidClassCode(classCode)) {
    throw new Error("유효한 반코드가 아닙니다.");
  }

  const studentsSnap = await get(ref(realtimeDb, "students"));
  const studentsRaw = (studentsSnap.val() ?? {}) as Record<string, any>;
  const updates: Record<string, unknown> = {};
  let resetStudents = 0;
  for (const [userId, value] of Object.entries(studentsRaw)) {
    if (String(value?.classCode ?? "") !== classCode) continue;
    resetStudents += 1;
    const base = `students/${userId}`;
    updates[`${base}/level`] = 1;
    updates[`${base}/levelProgress`] = 0;
    updates[`${base}/recentAccuracy`] = 0;
    updates[`${base}/wrongStreak`] = 0;
    updates[`${base}/hp`] = 100;
    updates[`${base}/appearanceTier`] = 1;
    updates[`${base}/earnedItems`] = [];
    updates[`${base}/updatedAt`] = Date.now();
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(realtimeDb), updates);
  }

  const logsSnap = await get(ref(realtimeDb, "activityLogs"));
  const logsRaw = (logsSnap.val() ?? {}) as Record<string, Record<string, any>>;
  const removals: Promise<void>[] = [];
  let removedLogs = 0;
  for (const gid of ["1", "2", "3", "4", "5"]) {
    const groupLogs = logsRaw[gid] ?? {};
    for (const [logId, logValue] of Object.entries(groupLogs)) {
      if (String(logValue?.classCode ?? "") !== classCode) continue;
      removedLogs += 1;
      removals.push(remove(ref(realtimeDb, `activityLogs/${gid}/${logId}`)));
    }
  }
  if (removals.length > 0) {
    await Promise.all(removals);
  }

  return { resetStudents, removedLogs };
}
