import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import GroupStatusCard from "../components/admin/GroupStatusCard";
import {
  ACHIEVEMENT_COLORS,
  ACHIEVEMENT_DESCRIPTIONS,
  ACHIEVEMENT_TITLES,
} from "../config/achievement";
import type { ActivityLog, GroupId, GroupStatus, StudentStatus } from "../types/game";
import {
  observeAdminAuth,
  signInAdminWithGoogle,
  signOutAdmin,
} from "../services/adminAuth";
import {
  createTeacherClassCode,
  deleteStudentsFromClass,
  ensureTeacherClassCode,
  fetchAllActivityLogsForClass,
  resetClassProgressAndActivity,
  subscribeActivityLogsByClassCode,
  subscribeStudentsByClassCode,
} from "../services/classCode";
import { adminRemoveStudentFromGroup } from "../services/groupSession";
import {
  downloadClassReportsDocx,
  downloadClassReportsExcel,
} from "../services/studentReportExport";
import {
  generateAiStudentReport,
  generateAiGroupAnalysis,
  type AiGroupAnalysis,
  type AiStudentReport,
} from "../services/aiCoach";

type LessonStat = {
  lesson: number;
  attempts: number;
  correct: number;
  accuracy: number;
};

function summarizeRubric(input: {
  level: number;
  recentAccuracy: number;
  levelProgress: number;
  wrongStreak: number;
}) {
  const { level, recentAccuracy, levelProgress, wrongStreak } = input;
  if (recentAccuracy >= 90 && levelProgress >= 80) {
    return "탁월: 현재 차시 목표를 안정적으로 해결하며 다음 난이도 준비가 된 상태";
  }
  if (recentAccuracy >= 75 && levelProgress >= 50) {
    return "양호: 핵심 유형은 해결 가능하며 복합 문제에서 검산 습관을 더하면 좋음";
  }
  if (recentAccuracy >= 60) {
    return "보통: 기본 계산은 가능하나 유형 전환(어림/나머지)에서 실수가 반복되는 상태";
  }
  if (wrongStreak >= 2) {
    return "지원 필요: 연속 오답이 누적되어 기초 전략(식 세우기·검산) 재학습이 필요한 상태";
  }
  if (level <= 2) {
    return "기초 형성: 곱셈 절차를 정확히 익히는 단계로, 속도보다 정확도 우선 지도가 필요";
  }
  return "성장 중: 단계별 연습을 통해 정확도와 속도를 함께 끌어올려야 하는 상태";
}

export default function AdminPage() {
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [classCode, setClassCode] = useState<string>("");
  const [students, setStudents] = useState<StudentStatus[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [adminGroupMsg, setAdminGroupMsg] = useState<string>("");
  const [adminResetMsg, setAdminResetMsg] = useState<string>("");
  const [adminStudentDeleteMsg, setAdminStudentDeleteMsg] = useState("");
  const [isResettingClass, setIsResettingClass] = useState(false);
  const [isDeletingSelectedStudents, setIsDeletingSelectedStudents] = useState(false);
  const [selectedStudentIdsForDelete, setSelectedStudentIdsForDelete] = useState<Set<string>>(
    () => new Set(),
  );
  const [aiReport, setAiReport] = useState<AiStudentReport | null>(null);
  const [aiReportError, setAiReportError] = useState("");
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiGroupReport, setAiGroupReport] = useState<AiGroupAnalysis | null>(null);
  const [aiGroupError, setAiGroupError] = useState("");
  const [aiGroupLoading, setAiGroupLoading] = useState(false);
  const [bulkExportBusy, setBulkExportBusy] = useState(false);
  const [bulkExportMsg, setBulkExportMsg] = useState("");

  useEffect(() => observeAdminAuth(setAdminUser), []);

  useEffect(() => {
    if (!adminUser?.uid || !adminUser.email) {
      setClassCode("");
      return;
    }
    localStorage.setItem("math4rpg_user_mode", "admin");
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
      const grouped = students.filter((student) => student.groupId === groupId);
      const size = grouped.length;
      const onlineCount = grouped.filter((student) => student.online).length;
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
        onlineCount,
        avgLevel,
        avgAccuracy,
      };
    });
    return byGroup;
  }, [students]);

  const groupLeaderboard = useMemo(() => {
    return ([1, 2, 3, 4, 5] as GroupId[])
      .map((groupId) => {
        const members = students.filter((student) => student.groupId === groupId);
        const memberCount = members.length;
        const onlineCount = members.filter((student) => student.online).length;
        const avgAccuracy =
          memberCount === 0
            ? 0
            : Math.round(
                members.reduce((sum, student) => sum + student.recentAccuracy, 0) / memberCount,
              );
        const avgLevel =
          memberCount === 0
            ? 0
            : Math.round(members.reduce((sum, student) => sum + student.level, 0) / memberCount);
        return { groupId, memberCount, onlineCount, avgAccuracy, avgLevel };
      })
      .sort((a, b) => {
        if (b.avgAccuracy !== a.avgAccuracy) return b.avgAccuracy - a.avgAccuracy;
        if (b.avgLevel !== a.avgLevel) return b.avgLevel - a.avgLevel;
        return b.memberCount - a.memberCount;
      });
  }, [students]);

  const groupStatsForAi = useMemo(
    () =>
      groups.map((g) => ({
        groupId: g.groupId,
        onlineCount: g.onlineCount,
        avgLevel: g.avgLevel,
        avgAccuracy: g.avgAccuracy,
        studentCount: students.filter((s) => s.groupId === g.groupId).length,
      })),
    [groups, students],
  );

  const selectedStudentLogs = useMemo(() => {
    if (!selectedStudentId) return [];
    return activityLogs.filter((log) => log.userId === selectedStudentId);
  }, [activityLogs, selectedStudentId]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  useEffect(() => {
    setAiReport(null);
    setAiReportError("");
  }, [selectedStudentId]);

  useEffect(() => {
    setSelectedStudentIdsForDelete(new Set());
    setAdminStudentDeleteMsg("");
    setBulkExportMsg("");
  }, [classCode]);

  const selectedStudentReport = useMemo(() => {
    if (!selectedStudent) return null;
    const battleLogs = selectedStudentLogs.filter(
      (log) => log.type === "BATTLE_CORRECT" || log.type === "BATTLE_WRONG",
    );
    const correct = battleLogs.filter((log) => log.type === "BATTLE_CORRECT").length;
    const wrong = battleLogs.length - correct;
    const attempts = battleLogs.length;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;

    const lessonMap = new Map<number, { attempts: number; correct: number }>();
    const kindMap = new Map<string, { attempts: number; correct: number }>();
    for (const log of battleLogs) {
      const extra = log.extra ?? {};
      const lesson = Number(extra.lesson ?? 0);
      if (lesson >= 2 && lesson <= 7) {
        const cur = lessonMap.get(lesson) ?? { attempts: 0, correct: 0 };
        cur.attempts += 1;
        if (log.type === "BATTLE_CORRECT") cur.correct += 1;
        lessonMap.set(lesson, cur);
      }

      const kind = String(extra.questionKind ?? "computation");
      const kcur = kindMap.get(kind) ?? { attempts: 0, correct: 0 };
      kcur.attempts += 1;
      if (log.type === "BATTLE_CORRECT") kcur.correct += 1;
      kindMap.set(kind, kcur);
    }

    const lessonStats: LessonStat[] = [...lessonMap.entries()]
      .map(([lesson, v]) => ({
        lesson,
        attempts: v.attempts,
        correct: v.correct,
        accuracy: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : 0,
      }))
      .sort((a, b) => a.lesson - b.lesson);

    const kindStats = [...kindMap.entries()]
      .map(([kind, v]) => ({
        kind,
        attempts: v.attempts,
        accuracy: v.attempts > 0 ? Math.round((v.correct / v.attempts) * 100) : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts);

    const rubric = summarizeRubric({
      level: selectedStudent.level,
      recentAccuracy: selectedStudent.recentAccuracy,
      levelProgress: selectedStudent.levelProgress,
      wrongStreak: selectedStudent.wrongStreak,
    });

    return {
      attempts,
      correct,
      wrong,
      accuracy,
      lessonStats,
      kindStats,
      rubric,
    };
  }, [selectedStudent, selectedStudentLogs]);

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
        <div className="admin-group-leaderboard">
          <p className="admin-group-leaderboard__title">모둠 대항 순위 (모둠 평균 정답률 기준)</p>
          <div className="admin-group-leaderboard__cards">
            {groupLeaderboard.map((row, idx) => (
              <article key={`admin-rank-${row.groupId}`} className="admin-group-rank-card">
                <p className="admin-group-rank-card__head">
                  <strong>#{idx + 1}</strong> · {row.groupId}모둠
                </p>
                {row.memberCount === 0 ? (
                  <p className="admin-group-rank-card__empty">참여 학생 없음</p>
                ) : (
                  <div className="admin-group-rank-card__stats">
                    <p>평균 정답률: {row.avgAccuracy}%</p>
                    <p>평균 레벨: Lv{row.avgLevel}</p>
                    <p>
                      참여 인원 {row.memberCount}명 · 접속 중 {row.onlineCount}명
                    </p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button
            type="button"
            disabled={aiGroupLoading || !classCode}
            onClick={async () => {
              if (!classCode) return;
              try {
                setAiGroupLoading(true);
                setAiGroupError("");
                const report = await generateAiGroupAnalysis({
                  classCode,
                  groups: groupStatsForAi,
                });
                setAiGroupReport(report);
              } catch (error) {
                setAiGroupError(
                  error instanceof Error ? error.message : "모둠 AI 분석 생성에 실패했습니다.",
                );
              } finally {
                setAiGroupLoading(false);
              }
            }}
          >
            {aiGroupLoading ? "AI 모둠 분석 생성 중..." : "모둠 현황 AI 분석"}
          </button>
          {aiGroupReport ? <span style={{ color: "#35531e" }}>AI 분석 완료</span> : null}
        </div>
        {aiGroupError ? <p style={{ color: "#b91c1c" }}>{aiGroupError}</p> : null}
        {aiGroupReport ? (
          <div style={{ marginBottom: 10 }}>
            <p>
              <strong>AI 요약:</strong> {aiGroupReport.summary}
            </p>
            {aiGroupReport.groupInsights.map((item) => (
              <div
                key={`ai-group-${item.groupId}`}
                style={{
                  border: "1px solid #dce8c8",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginBottom: 8,
                  background: "rgba(255,255,255,0.6)",
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong>{item.groupId}모둠</strong> · 상태: {item.status}
                </p>
                <p style={{ margin: "4px 0 0" }}>
                  <strong>강점:</strong> {item.strengths.join(" / ")}
                </p>
                <p style={{ margin: "4px 0 0" }}>
                  <strong>위험요인:</strong> {item.risks.join(" / ")}
                </p>
                <p style={{ margin: "4px 0 0" }}>
                  <strong>권장 조치:</strong> {item.actions.join(" / ")}
                </p>
              </div>
            ))}
            {aiGroupReport.classActions.length > 0 ? (
              <p>
                <strong>반 전체 조치:</strong> {aiGroupReport.classActions.join(" / ")}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="group-grid">
          {groups.map((group) => (
            <GroupStatusCard key={group.groupId} group={group} />
          ))}
        </div>
      </section>

      <section className="page-card">
        <h3>학생 성취수준</h3>
        <p>
          레벨을 기준으로 계산 숙련도를 해석해 보여줍니다. 표 왼쪽에서 학생을 선택한 뒤「선택 학생 데이터 삭제」로 해당 학생만 지우거나, 반 전체를 한 번에 초기화할 수 있습니다.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <button
            type="button"
            disabled={!classCode || bulkExportBusy}
            onClick={async () => {
              if (!classCode) return;
              try {
                setBulkExportBusy(true);
                setBulkExportMsg("");
                const logs = await fetchAllActivityLogsForClass(classCode);
                downloadClassReportsExcel({
                  classCode,
                  teacherEmail: adminUser.email ?? "",
                  students,
                  activityLogs: logs,
                });
                setBulkExportMsg(
                  `Excel 저장 완료 · 학생 ${students.length}명 · 활동 로그 ${logs.length}건`,
                );
              } catch (error) {
                setBulkExportMsg(
                  error instanceof Error ? error.message : "Excel 내보내기에 실패했습니다.",
                );
              } finally {
                setBulkExportBusy(false);
              }
            }}
          >
            {bulkExportBusy ? "파일 준비 중..." : "학생 레포트 전체 · Excel (.xlsx)"}
          </button>
          <button
            type="button"
            disabled={!classCode || bulkExportBusy}
            onClick={async () => {
              if (!classCode) return;
              try {
                setBulkExportBusy(true);
                setBulkExportMsg("");
                const logs = await fetchAllActivityLogsForClass(classCode);
                await downloadClassReportsDocx({
                  classCode,
                  teacherEmail: adminUser.email ?? "",
                  students,
                  activityLogs: logs,
                });
                setBulkExportMsg(
                  `Word 저장 완료 · 학생 ${students.length}명 · 활동 로그 ${logs.length}건`,
                );
              } catch (error) {
                setBulkExportMsg(
                  error instanceof Error ? error.message : "Word 내보내기에 실패했습니다.",
                );
              } finally {
                setBulkExportBusy(false);
              }
            }}
          >
            학생 레포트 전체 · Word (.docx)
          </button>
        </div>
        {bulkExportMsg ? <p style={{ marginBottom: 10 }}>{bulkExportMsg}</p> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <button
            type="button"
            disabled={
              !classCode ||
              selectedStudentIdsForDelete.size === 0 ||
              isDeletingSelectedStudents ||
              isResettingClass
            }
            onClick={async () => {
              if (!classCode || selectedStudentIdsForDelete.size === 0) return;
              const ids = [...selectedStudentIdsForDelete];
              const picked = students.filter((s) => ids.includes(s.id));
              const ok = window.confirm(
                `선택한 ${picked.length}명의 학습 데이터를 삭제할까요?\n\n${picked.map((s) => `· ${s.name} (${s.id})`).join("\n")}\n\n삭제 후에는 되돌릴 수 없습니다.`,
              );
              if (!ok) return;
              try {
                setIsDeletingSelectedStudents(true);
                setAdminStudentDeleteMsg("");
                const result = await deleteStudentsFromClass(classCode, ids);
                setSelectedStudentIdsForDelete(new Set());
                if (selectedStudentId && ids.includes(selectedStudentId)) {
                  setSelectedStudentId("");
                }
                setAdminStudentDeleteMsg(
                  result.deletedStudents === 0
                    ? "삭제할 수 있는 학생이 없었습니다. (다른 반 소속이거나 이미 삭제됨)"
                    : `선택 삭제 완료: 학생 ${result.deletedStudents}명, 활동로그 ${result.removedLogs}건 삭제`,
                );
              } catch (error) {
                setAdminStudentDeleteMsg(
                  error instanceof Error ? error.message : "선택 삭제 처리 중 오류가 발생했습니다.",
                );
              } finally {
                setIsDeletingSelectedStudents(false);
              }
            }}
          >
            {isDeletingSelectedStudents ? "삭제 처리 중..." : "선택 학생 데이터 삭제"}
          </button>
          <button
            type="button"
            disabled={!classCode || isResettingClass}
            onClick={async () => {
              if (!classCode) {
                setAdminResetMsg("반코드를 불러온 뒤 다시 시도해 주세요.");
                return;
              }
              const ok = window.confirm(
                "이 반의 활동로그와 학생 성취수준(레벨/정답률/아이템 등)을 모두 초기화할까요?",
              );
              if (!ok) return;
              try {
                setIsResettingClass(true);
                setAdminResetMsg("");
                const result = await resetClassProgressAndActivity(classCode);
                setSelectedStudentIdsForDelete(new Set());
                setSelectedStudentId("");
                setAdminResetMsg(
                  `초기화 완료: 학생 ${result.removedStudents}명 삭제, 활동로그 ${result.removedLogs}건 삭제`,
                );
              } catch (error) {
                setAdminResetMsg(
                  error instanceof Error ? error.message : "초기화 처리 중 오류가 발생했습니다.",
                );
              } finally {
                setIsResettingClass(false);
              }
            }}
          >
            {isResettingClass ? "초기화 처리 중..." : "이 반 활동로그 + 성취수준 초기화"}
          </button>
        </div>
        {adminStudentDeleteMsg ? <p>{adminStudentDeleteMsg}</p> : null}
        {adminResetMsg ? <p>{adminResetMsg}</p> : null}
        <p>모둠에 참가 중인 학생을 반에서 제외하면 RTDB가 갱신되고, 학생 화면에서도 모둠 참가가 해제됩니다.</p>
        {adminGroupMsg ? <p>{adminGroupMsg}</p> : null}
        <table className="student-table">
          <thead>
            <tr>
              <th scope="col" aria-label="전체 선택">
                <input
                  type="checkbox"
                  title="현재 목록 전체 선택"
                  checked={
                    students.length > 0 && students.every((s) => selectedStudentIdsForDelete.has(s.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedStudentIdsForDelete(new Set(students.map((s) => s.id)));
                    } else {
                      setSelectedStudentIdsForDelete(new Set());
                    }
                  }}
                />
              </th>
              <th>이름</th>
              <th>모둠</th>
              <th>레벨</th>
              <th>성취수준</th>
              <th>성취율</th>
              <th>최근 정답률</th>
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
                <td>
                  <input
                    type="checkbox"
                    checked={selectedStudentIdsForDelete.has(student.id)}
                    onChange={() => {
                      setSelectedStudentIdsForDelete((prev) => {
                        const next = new Set(prev);
                        if (next.has(student.id)) next.delete(student.id);
                        else next.add(student.id);
                        return next;
                      });
                    }}
                    aria-label={`${student.name} 선택`}
                  />
                </td>
                <td>{student.name}</td>
                <td>{student.groupId == null ? "미참가" : `${student.groupId}모둠`}</td>
                <td>{student.level}</td>
                <td>
                  <span
                    className="badge"
                    style={{
                      backgroundColor: ACHIEVEMENT_COLORS[student.achievement],
                    }}
                    title={ACHIEVEMENT_DESCRIPTIONS[student.achievement]}
                  >
                    {ACHIEVEMENT_TITLES[student.achievement]}
                  </span>
                  <div style={{ marginTop: 4, fontSize: "0.82rem", color: "#4b5563", lineHeight: 1.35 }}>
                    {ACHIEVEMENT_DESCRIPTIONS[student.achievement]}
                  </div>
                </td>
                <td>{student.levelProgress}%</td>
                <td>{student.recentAccuracy}%</td>
                <td>{student.appearanceTier}단계</td>
                <td>{student.earnedItems.length}개</td>
                <td>{student.earnedItems.length === 0 ? "-" : student.earnedItems.join(", ")}</td>
                <td>
                  {student.groupId == null ? (
                    <span style={{ color: "#64748b", fontSize: "0.9rem" }} title="현재 모둠에 속하지 않음">
                      —
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="해당 학생을 모둠에서 보냅니다"
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
                  )}
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
        <h3>학생 상세 학습 리포트</h3>
        {!selectedStudent ? (
          <p>학생 목록에서 '보기'를 누르면 풀이량·레벨·정답률과 차시별/유형별 학습 지표를 보여줍니다.</p>
        ) : !selectedStudentReport ? (
          <p>선택한 학생의 학습 데이터를 불러올 수 없습니다.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={aiReportLoading}
                onClick={async () => {
                  try {
                    setAiReportLoading(true);
                    setAiReportError("");
                    const report = await generateAiStudentReport({
                      studentName: selectedStudent.name,
                      level: selectedStudent.level,
                      levelProgress: selectedStudent.levelProgress,
                      recentAccuracy: selectedStudent.recentAccuracy,
                      attempts: selectedStudentReport.attempts,
                      correct: selectedStudentReport.correct,
                      wrong: selectedStudentReport.wrong,
                      lessonStats: selectedStudentReport.lessonStats,
                      kindStats: selectedStudentReport.kindStats,
                    });
                    setAiReport(report);
                  } catch (error) {
                    setAiReportError(
                      error instanceof Error ? error.message : "AI 리포트 생성에 실패했습니다.",
                    );
                  } finally {
                    setAiReportLoading(false);
                  }
                }}
              >
                {aiReportLoading ? "AI 분석 생성 중..." : "AI 리포트 생성"}
              </button>
              {aiReport ? <span style={{ color: "#35531e" }}>AI 분석 반영됨</span> : null}
            </div>
            {aiReportError ? <p style={{ color: "#b91c1c" }}>{aiReportError}</p> : null}
            <p>
              <strong>{selectedStudent.name}</strong> · 현재 레벨 {selectedStudent.level} (차시{" "}
              {selectedStudent.level + 1}) · 최근 정답률 {selectedStudent.recentAccuracy}% · 성취율{" "}
              {selectedStudent.levelProgress}%
            </p>
            <p>
              총 풀이 <strong>{selectedStudentReport.attempts}</strong>문항 (정답{" "}
              {selectedStudentReport.correct} / 오답 {selectedStudentReport.wrong}) · 로그기준 정답률{" "}
              {selectedStudentReport.accuracy}%
            </p>
            <p>
              <strong>평가 루브릭:</strong> {aiReport?.rubricNote ?? selectedStudentReport.rubric}
            </p>
            {aiReport?.strengths?.length || aiReport?.weaknesses?.length ? (
              <p>
                <strong>AI 관찰 포인트:</strong>{" "}
                {[...(aiReport.strengths ?? []), ...(aiReport.weaknesses ?? [])].join(" / ")}
              </p>
            ) : null}
            {aiReport?.summary ? (
              <p>
                <strong>AI 종합 의견:</strong> {aiReport.summary}
              </p>
            ) : null}
            {aiReport?.actionPlan?.length ? (
              <div>
                <strong>AI 권장 지도안</strong>
                <ul>
                  {aiReport.actionPlan.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {aiReport?.teacherComment ? (
              <p>
                <strong>교사 코멘트:</strong> {aiReport.teacherComment}
              </p>
            ) : null}

            {selectedStudentReport.lessonStats.length > 0 ? (
              <table className="student-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>차시</th>
                    <th>풀이 문항 수</th>
                    <th>정답 수</th>
                    <th>정답률</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudentReport.lessonStats.map((row) => (
                    <tr key={`lesson-${row.lesson}`}>
                      <td>{row.lesson}차시</td>
                      <td>{row.attempts}</td>
                      <td>{row.correct}</td>
                      <td>{row.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {selectedStudentReport.kindStats.length > 0 ? (
              <table className="student-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>문항 유형</th>
                    <th>풀이 수</th>
                    <th>정답률</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedStudentReport.kindStats.map((row) => (
                    <tr key={`kind-${row.kind}`}>
                      <td>
                        {row.kind === "computation"
                          ? "계산형"
                          : row.kind === "estimate"
                            ? "어림형"
                            : row.kind === "principle"
                              ? "원리형"
                              : row.kind}
                      </td>
                      <td>{row.attempts}</td>
                      <td>{row.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
