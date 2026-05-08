import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from "docx";
import * as XLSX from "xlsx";
import { ACHIEVEMENT_TITLES } from "../config/achievement";
import type { ActivityLog, StudentStatus } from "../types/game";

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
    return "보통: 기본 계산은 가능하나 유형 전환(어림/나눗셈)에서 실수가 반복되는 상태";
  }
  if (wrongStreak >= 2) {
    return "지원 필요: 연속 오답이 누적되어 기초 전략(식 세우기·검산) 재학습이 필요한 상태";
  }
  if (level <= 2) {
    return "기초 형성: 곱셈 절차를 정확히 익히는 단계로, 속도보다 정확도 우선 지도가 필요";
  }
  return "성장 중: 단계별 연습을 통해 정답률과 속도를 함께 끌어올려야 하는 상태";
}

function formatKind(kind: string): string {
  if (kind === "computation") return "계산형";
  if (kind === "estimate") return "어림형";
  if (kind === "principle") return "원리형";
  return kind;
}

export type StudentExportMetrics = {
  student: StudentStatus;
  attempts: number;
  correct: number;
  wrong: number;
  logAccuracy: number;
  rubric: string;
  lessonStats: { lesson: number; attempts: number; correct: number; accuracy: number }[];
  kindStats: { kind: string; attempts: number; accuracy: number }[];
};

export function computeStudentExportMetrics(
  student: StudentStatus,
  activityLogs: ActivityLog[],
): StudentExportMetrics {
  const logs = activityLogs.filter((l) => l.userId === student.id);
  const battleLogs = logs.filter((l) => l.type === "BATTLE_CORRECT" || l.type === "BATTLE_WRONG");
  const correct = battleLogs.filter((l) => l.type === "BATTLE_CORRECT").length;
  const wrong = battleLogs.length - correct;
  const attempts = battleLogs.length;
  const logAccuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;

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

  const lessonStats = [...lessonMap.entries()]
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
    level: student.level,
    recentAccuracy: student.recentAccuracy,
    levelProgress: student.levelProgress,
    wrongStreak: student.wrongStreak,
  });

  return {
    student,
    attempts,
    correct,
    wrong,
    logAccuracy,
    rubric,
    lessonStats,
    kindStats,
  };
}

function exportStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadClassReportsExcel(input: {
  classCode: string;
  teacherEmail?: string;
  students: StudentStatus[];
  activityLogs: ActivityLog[];
}) {
  const { classCode, teacherEmail = "", students, activityLogs } = input;
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const metricsList = sorted.map((s) => computeStudentExportMetrics(s, activityLogs));

  const wb = XLSX.utils.book_new();

  const summaryRows = metricsList.map((m) => ({
    접속코드: m.student.id,
    이름: m.student.name,
    모둠: m.student.groupId == null ? "미참가" : `${m.student.groupId}모둠`,
    레벨: m.student.level,
    성취수준: ACHIEVEMENT_TITLES[m.student.achievement],
    성취율_퍼센트: m.student.levelProgress,
    최근정답률_퍼센트: m.student.recentAccuracy,
    접속중: m.student.online ? "예" : "아니오",
    전투로그_풀이수: m.attempts,
    전투로그_정답: m.correct,
    전투로그_오답: m.wrong,
    전투로그_정답률_퍼센트: m.logAccuracy,
    연속오답: m.student.wrongStreak,
    HP: m.student.hp,
    외형단계: m.student.appearanceTier,
    아이템수: m.student.earnedItems.length,
    아이템목록: m.student.earnedItems.join(", "),
    관찰루브릭: m.rubric,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "학생요약");

  const lessonFlat: Record<string, string | number>[] = [];
  for (const m of metricsList) {
    for (const row of m.lessonStats) {
      lessonFlat.push({
        접속코드: m.student.id,
        이름: m.student.name,
        차시: row.lesson,
        풀이수: row.attempts,
        정답수: row.correct,
        정답률_퍼센트: row.accuracy,
      });
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    lessonFlat.length ? XLSX.utils.json_to_sheet(lessonFlat) : XLSX.utils.aoa_to_sheet([["데이터 없음"]]),
    "차시별통계",
  );

  const kindFlat: Record<string, string | number>[] = [];
  for (const m of metricsList) {
    for (const row of m.kindStats) {
      kindFlat.push({
        접속코드: m.student.id,
        이름: m.student.name,
        유형: formatKind(row.kind),
        풀이수: row.attempts,
        정답률_퍼센트: row.accuracy,
      });
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    kindFlat.length ? XLSX.utils.json_to_sheet(kindFlat) : XLSX.utils.aoa_to_sheet([["데이터 없음"]]),
    "유형별통계",
  );

  const logRows = [...activityLogs]
    .sort((a, b) => b.at - a.at)
    .map((log) => ({
      시각_ISO: new Date(log.at).toISOString(),
      모둠: log.groupId,
      접속코드: log.userId,
      표시이름: log.userName,
      유형: log.type,
      레벨: log.extra?.level ?? "",
      차시: log.extra?.lesson ?? "",
      문항유형: formatKind(String(log.extra?.questionKind ?? "")),
      성취기준: log.extra?.achievementStandard ?? "",
    }));
  XLSX.utils.book_append_sheet(
    wb,
    logRows.length ? XLSX.utils.json_to_sheet(logRows) : XLSX.utils.aoa_to_sheet([["활동 로그 없음"]]),
    "활동로그",
  );

  const meta = [
    ["반코드", classCode],
    ["교사메일", teacherEmail],
    ["추출일시", new Date().toISOString()],
    ["학생수", sorted.length],
    ["로그건수", activityLogs.length],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "메타");

  XLSX.writeFile(wb, `math4rpg_반${classCode}_학생레포트_${exportStamp()}.xlsx`);
}

function tableRowTwoCol(left: string, right: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: left })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: right })],
      }),
    ],
  });
}

export async function downloadClassReportsDocx(input: {
  classCode: string;
  teacherEmail?: string;
  students: StudentStatus[];
  activityLogs: ActivityLog[];
}) {
  const { classCode, teacherEmail = "", students, activityLogs } = input;
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const metricsList = sorted.map((s) => computeStudentExportMetrics(s, activityLogs));

  const sectionChildren: (Paragraph | Table)[] = [
    new Paragraph({
      text: "math4rpg 학생 레포트 (전체)",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      text: `반코드 ${classCode} · 교사 ${teacherEmail || "(미기재)"} · 생성 ${new Date().toLocaleString("ko-KR")}`,
    }),
    new Paragraph({
      text: `학생 ${sorted.length}명 · 활동 로그 ${activityLogs.length}건`,
    }),
    new Paragraph({ text: "" }),
  ];

  for (const m of metricsList) {
    const s = m.student;
    sectionChildren.push(
      new Paragraph({
        text: `${s.name} (${s.id})`,
        heading: HeadingLevel.HEADING_2,
      }),
    );

    const groupLabel = s.groupId == null ? "미참가" : `${s.groupId}모둠`;
    sectionChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          tableRowTwoCol("모둠", groupLabel),
          tableRowTwoCol("레벨", String(s.level)),
          tableRowTwoCol("성취수준", ACHIEVEMENT_TITLES[s.achievement]),
          tableRowTwoCol("성취율", `${s.levelProgress}%`),
          tableRowTwoCol("최근 정답률", `${s.recentAccuracy}%`),
          tableRowTwoCol("접속", s.online ? "접속 중" : "오프라인"),
          tableRowTwoCol("전투 로그 풀이 / 정·오답", `${m.attempts} / ${m.correct}·${m.wrong}`),
          tableRowTwoCol("전투 로그 정답률", `${m.logAccuracy}%`),
          tableRowTwoCol("연속 오답·HP·외형", `${s.wrongStreak} · ${s.hp} · ${s.appearanceTier}단계`),
          tableRowTwoCol("아이템", s.earnedItems.length ? s.earnedItems.join(", ") : "-"),
          tableRowTwoCol("관찰 루브릭", m.rubric),
        ],
      }),
    );

    if (m.lessonStats.length > 0) {
      sectionChildren.push(new Paragraph({ text: "차시별 통계", heading: HeadingLevel.HEADING_3 }));
      const lessonRows = [
        new TableRow({
          children: ["차시", "풀이수", "정답수", "정답률"].map(
            (h) =>
              new TableCell({
                children: [new Paragraph({ text: h })],
              }),
          ),
        }),
        ...m.lessonStats.map(
          (row) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: String(row.lesson) })] }),
                new TableCell({ children: [new Paragraph({ text: String(row.attempts) })] }),
                new TableCell({ children: [new Paragraph({ text: String(row.correct) })] }),
                new TableCell({ children: [new Paragraph({ text: `${row.accuracy}%` })] }),
              ],
            }),
        ),
      ];
      sectionChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: lessonRows,
        }),
      );
    }

    if (m.kindStats.length > 0) {
      sectionChildren.push(new Paragraph({ text: "유형별 통계", heading: HeadingLevel.HEADING_3 }));
      const kindRows = [
        new TableRow({
          children: ["유형", "풀이수", "정답률"].map(
            (h) => new TableCell({ children: [new Paragraph({ text: h })] }),
          ),
        }),
        ...m.kindStats.map(
          (row) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: formatKind(row.kind) })] }),
                new TableCell({ children: [new Paragraph({ text: String(row.attempts) })] }),
                new TableCell({ children: [new Paragraph({ text: `${row.accuracy}%` })] }),
              ],
            }),
        ),
      ];
      sectionChildren.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: kindRows,
        }),
      );
    }

    sectionChildren.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: sectionChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, `math4rpg_반${classCode}_학생레포트_${exportStamp()}.docx`);
}
