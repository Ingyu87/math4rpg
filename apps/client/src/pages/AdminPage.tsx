import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import GroupStatusCard from "../components/admin/GroupStatusCard";
import { ACHIEVEMENT_COLORS } from "../config/achievement";
import type { ActivityLog, GroupStatus, StudentStatus } from "../types/game";
import {
  observeAdminAuth,
  signInAdminWithGoogle,
  signOutAdmin,
} from "../services/adminAuth";
import {
  createTeacherClassCode,
  ensureTeacherClassCode,
  subscribeActivityLogsByClassCode,
  subscribeStudentsByClassCode,
} from "../services/classCode";
import { adminRemoveStudentFromGroup } from "../services/groupSession";

const EVENT_LABELS: Record<string, string> = {
  JOIN_GROUP: "모둠 입장",
  LEAVE_GROUP: "모둠 퇴장",
  BATTLE_CORRECT: "문제 정답",
  BATTLE_WRONG: "문제 오답",
  LEVEL_UP: "레벨 업",
  LEVEL_DOWN: "레벨 다운",
  GAME_CLEAR: "만렙 달성",
};

function eventLabel(type: string) {
  return EVENT_LABELS[type] ?? type;
}

function formatExtra(extra?: Record<string, unknown>) {
  if (!extra) return "-";
  const entries = Object.entries(extra);
  if (entries.length === 0) return "-";
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ");
}

export default function AdminPage() {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [classCode, setClassCode] = useState<string>("");
  const [students, setStudents] = useState<StudentStatus[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [selectedLogType, setSelectedLogType] = useState("ALL");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [adminGroupMsg, setAdminGroupMsg] = useState<string>("");

  useEffect(() => observeAdminAuth(setAdminUser), []);

  useEffect(() => {
    if (!adminUser?.uid || !adminUser.email) return;
    ensureTeacherClassCode(adminUser.uid, adminUser.email).then(setClassCode);
  }, [adminUser?.uid, adminUser?.email]);

  useEffect(() => {
    if (!classCode) return;
    return subscribeStudentsByClassCode(classCode, setStudents);
  }, [classCode]);

  useEffect(() => {
    if (!classCode) return;
    return subscribeActivityLogsByClassCode(classCode, setActivityLogs);
  }, [classCode]);

  const groups: GroupStatus[] = useMemo(() => {
    const byGroup = [1, 2, 3, 4, 5].map((groupId) => {
      const grouped = students.filter(
        (student) => student.groupId === groupId && student.online,
      );
      const size = grouped.length;
      const avgLevel =
        size === 0
          ? 0
          : Math.round(
              grouped.reduce((sum, student) => sum + student.level, 0) / size,
            );
      const avgAccuracy =
        size === 0
          ? 0
          : Math.round(
              grouped.reduce((sum, student) => sum + student.recentAccuracy, 0) /
                size,
            );
      return {
        groupId: groupId as 1 | 2 | 3 | 4 | 5,
        onlineCount: size,
        avgLevel,
        avgAccuracy,
      };
    });
    return byGroup;
  }, [students]);

  const filteredLogs = useMemo(() => {
    if (selectedLogType === "ALL") return activityLogs;
    return activityLogs.filter((log) => log.type === selectedLogType);
  }, [activityLogs, selectedLogType]);

  const selectedStudentLogs = useMemo(() => {
    if (!selectedStudentId) return [];
    return activityLogs.filter((log) => log.userId === selectedStudentId);
  }, [activityLogs, selectedStudentId]);

  const handleGoogleSignIn = async () => {
    try {
      setAuthMessage("");
      await signInAdminWithGoogle();
    } catch (error) {
      setAuthMessage(
        error instanceof Error ? error.message : "Google 로그인에 실패했습니다.",
      );
    }
  };

  if (!adminUser) {
    return (
      <section className="page-card">
        <h2>교사/관리자 로그인</h2>
        <p>관리자 페이지는 Google 계정 로그인 후 이용할 수 있습니다.</p>
        <button type="button" onClick={handleGoogleSignIn}>
          Google로 로그인
        </button>
        {authMessage && <p>{authMessage}</p>}
      </section>
    );
  }

  return (
    <>
      <section className="page-card">
        <h2>관리자 실시간 관제 (초기 MVP)</h2>
        <p>모둠별 인원, 레벨, 성취수준과 학생 활동 지표를 보여줍니다.</p>
        <p>로그인 계정: {adminUser.email}</p>
        <p>
          내 반코드: <strong>{classCode || "생성 중..."}</strong>
        </p>
        <button
          type="button"
          onClick={async () => {
            if (!adminUser.email) return;
            const next = await createTeacherClassCode(adminUser.uid, adminUser.email);
            setClassCode(next);
          }}
        >
          새 반코드 발급
        </button>
        <button type="button" onClick={signOutAdmin}>
          로그아웃
        </button>
      </section>

      <section className="page-card">
        <h3>모둠 현황</h3>
        <div className="group-grid">
          {groups.map((group) => (
            <GroupStatusCard key={group.groupId} group={group} />
          ))}
        </div>
      </section>

      <section className="page-card">
        <h3>학생 성취수준</h3>
        <p>모둠에 참가 중인 학생을 반에서 제외하면 RTDB가 갱신되고, 학생 화면에서도 모둠 참가가 해제됩니다.</p>
        {adminGroupMsg ? <p>{adminGroupMsg}</p> : null}
        <table className="student-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>모둠</th>
              <th>레벨</th>
              <th>성취수준</th>
              <th>성취율</th>
              <th>최근 정답률</th>
              <th>오답누적</th>
              <th>외형단계</th>
              <th>아이템수</th>
              <th>아이템</th>
              <th>모둠 조정</th>
              <th>상세</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td colSpan={12}>현재 이 반코드로 입장한 학생이 없습니다.</td>
              </tr>
            )}
            {students.map((student) => (
              <tr key={student.id}>
                <td>{student.name}</td>
                <td>{student.groupId}모둠</td>
                <td>{student.level}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      backgroundColor: ACHIEVEMENT_COLORS[student.achievement],
                    }}
                  >
                    {student.achievement}
                  </span>
                </td>
                <td>{student.levelProgress}%</td>
                <td>{student.recentAccuracy}%</td>
                <td>{student.wrongStreak}/3</td>
                <td>{student.appearanceTier}단계</td>
                <td>{student.earnedItems.length}개</td>
                <td>{student.earnedItems.length === 0 ? "-" : student.earnedItems.join(", ")}</td>
                <td>
                  <button
                    type="button"
                    title="해당 학생을 모둠에서 내보냅니다"
                    onClick={async () => {
                      if (!classCode) {
                        setAdminGroupMsg("반코드를 불러온 뒤 다시 시도해 주세요.");
                        return;
                      }
                      const ok = window.confirm(
                        `「${student.name}」 학생을 모둠에서 제외할까요? (학생 화면의 모둠 참가도 해제됩니다.)`,
                      );
                      if (!ok) return;
                      try {
                        setAdminGroupMsg("");
                        await adminRemoveStudentFromGroup(classCode, student.id);
                        setAdminGroupMsg(`「${student.name}」 학생을 모둠에서 제외했습니다.`);
                      } catch (error) {
                        setAdminGroupMsg(
                          error instanceof Error ? error.message : "모둠 제외 처리에 실패했습니다.",
                        );
                      }
                    }}
                  >
                    모둠에서 제외
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    보기
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="page-card">
        <h3>반 활동 로그 (실시간)</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {[
            "ALL",
            "BATTLE_CORRECT",
            "BATTLE_WRONG",
            "LEVEL_UP",
            "LEVEL_DOWN",
            "GAME_CLEAR",
          ].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedLogType(type)}
                style={{
                  border:
                    selectedLogType === type ? "2px solid #7a5fd1" : "1px solid #d9cef9",
                }}
              >
                {type === "ALL" ? "전체" : eventLabel(type)}
              </button>
            ))}
        </div>
        {filteredLogs.length === 0 ? (
          <p>현재 이 반코드의 활동 로그가 없습니다.</p>
        ) : (
          <table className="student-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>모둠</th>
                <th>학생</th>
                <th>이벤트</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.at).toLocaleTimeString()}</td>
                  <td>{log.groupId}모둠</td>
                  <td>{log.userName}</td>
                  <td>{eventLabel(log.type)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="page-card">
        <h3>학생 상세 타임라인</h3>
        {!selectedStudentId ? (
          <p>학생 목록에서 '보기'를 눌러 상세 타임라인을 확인하세요.</p>
        ) : selectedStudentLogs.length === 0 ? (
          <p>선택한 학생의 활동 로그가 없습니다.</p>
        ) : (
          <table className="student-table">
            <thead>
              <tr>
                <th>시간</th>
                <th>이벤트</th>
                <th>모둠</th>
                <th>추가 정보</th>
              </tr>
            </thead>
            <tbody>
              {selectedStudentLogs.map((log) => (
                <tr key={`${log.id}-detail`}>
                  <td>{new Date(log.at).toLocaleTimeString()}</td>
                  <td>{eventLabel(log.type)}</td>
                  <td>{log.groupId}모둠</td>
                  <td>{formatExtra(log.extra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
