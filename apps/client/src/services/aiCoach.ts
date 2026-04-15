type LessonStat = { lesson: number; attempts: number; correct: number; accuracy: number };
type KindStat = { kind: string; attempts: number; accuracy: number };

export type AiStudentReport = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  actionPlan: string[];
  rubricNote: string;
  teacherComment: string;
};

export type AiFinalReport = {
  title: string;
  overview: string;
  achievementHighlights: string[];
  nextGoals: string[];
  parentGuide: string;
  finalCharacter: {
    title: string;
    description: string;
    svg: string;
  };
};

export type AiGroupAnalysis = {
  summary: string;
  groupInsights: Array<{
    groupId: number;
    status: string;
    strengths: string[];
    risks: string[];
    actions: string[];
  }>;
  classActions: string[];
};

async function postJson<TReq, TRes>(url: string, payload: TReq): Promise<TRes> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "AI 요청에 실패했습니다.");
  }
  return (await res.json()) as TRes;
}

export async function generateAiStudentReport(payload: {
  studentName: string;
  level: number;
  levelProgress: number;
  recentAccuracy: number;
  attempts: number;
  correct: number;
  wrong: number;
  lessonStats: LessonStat[];
  kindStats: KindStat[];
}): Promise<AiStudentReport> {
  const data = await postJson<typeof payload, { report: AiStudentReport }>(
    "/api/ai/student-report",
    payload,
  );
  return data.report;
}

export async function generateAiFinalReport(payload: {
  studentName: string;
  level: number;
  elapsedSec: number;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  earnedItems: string[];
  levelStats: Record<string, { correct: number; wrong: number }>;
}): Promise<AiFinalReport> {
  const data = await postJson<typeof payload, { report: AiFinalReport }>(
    "/api/ai/final-report",
    payload,
  );
  return data.report;
}

export async function generateAiGroupAnalysis(payload: {
  classCode: string;
  groups: Array<{
    groupId: number;
    onlineCount: number;
    avgLevel: number;
    avgAccuracy: number;
    studentCount: number;
  }>;
}): Promise<AiGroupAnalysis> {
  const data = await postJson<typeof payload, { report: AiGroupAnalysis }>(
    "/api/ai/group-analysis",
    payload,
  );
  return data.report;
}
