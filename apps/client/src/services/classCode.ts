import {
  get,
  onValue,
  ref,
  runTransaction,
  update,
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

function toStudentStatus(userId: string, value: any): StudentStatus {
  const level = Number(value?.level ?? 1);
  return {
    id: userId,
    name: String(value?.name ?? "학생"),
    groupId: Number(value?.groupId ?? 1) as 1 | 2 | 3 | 4 | 5,
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
