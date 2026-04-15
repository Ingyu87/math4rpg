type LessonStat = { lesson: number; attempts: number; correct: number; accuracy: number };
type KindStat = { kind: string; attempts: number; accuracy: number };

type StudentReportRequest = {
  studentName: string;
  level: number;
  levelProgress: number;
  recentAccuracy: number;
  attempts: number;
  correct: number;
  wrong: number;
  lessonStats: LessonStat[];
  kindStats: KindStat[];
};

type StudentReportResponse = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  actionPlan: string[];
  rubricNote: string;
  teacherComment: string;
};

function parseBody(body: unknown): StudentReportRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.studentName !== "string") return null;
  return {
    studentName: b.studentName,
    level: Number(b.level ?? 1),
    levelProgress: Number(b.levelProgress ?? 0),
    recentAccuracy: Number(b.recentAccuracy ?? 0),
    attempts: Number(b.attempts ?? 0),
    correct: Number(b.correct ?? 0),
    wrong: Number(b.wrong ?? 0),
    lessonStats: Array.isArray(b.lessonStats)
      ? (b.lessonStats as LessonStat[])
      : [],
    kindStats: Array.isArray(b.kindStats) ? (b.kindStats as KindStat[]) : [],
  };
}

function fallbackReport(input: StudentReportRequest): StudentReportResponse {
  const topLesson = [...input.lessonStats].sort((a, b) => b.accuracy - a.accuracy)[0];
  const lowLesson = [...input.lessonStats].sort((a, b) => a.accuracy - b.accuracy)[0];
  return {
    summary: `${input.studentName} 학생은 총 ${input.attempts}문항을 풀었고 정답률은 ${input.recentAccuracy}%입니다.`,
    strengths: topLesson
      ? [`${topLesson.lesson}차시 정답률 ${topLesson.accuracy}%로 비교적 안정적입니다.`]
      : ["아직 특정 강점을 판단할 만큼 데이터가 충분하지 않습니다."],
    weaknesses: lowLesson
      ? [`${lowLesson.lesson}차시 정답률 ${lowLesson.accuracy}%로 보완이 필요합니다.`]
      : ["오답 원인 분석을 위한 문항 데이터가 더 필요합니다."],
    actionPlan: [
      "오답 문항은 식 세우기 → 계산 → 검산 순서로 다시 풀어보게 지도하세요.",
      "정답률이 낮은 차시를 중심으로 5문항 단위 짧은 반복학습을 권장합니다.",
    ],
    rubricNote:
      input.recentAccuracy >= 80
        ? "루브릭 판정: 핵심 계산은 안정적이며 적용 문제 확장이 가능한 수준입니다."
        : "루브릭 판정: 기본 계산 절차는 형성 중이며 검산 습관 강화가 필요합니다.",
    teacherComment:
      "학생에게는 정답률 숫자보다 '어떤 문제에서 어떻게 틀렸는지'를 구체적으로 피드백해 주세요.",
  };
}

async function callGemini(apiKey: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini 요청 실패: ${res.status} ${txt}`);
  }
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== "string") {
    throw new Error("Gemini 응답 본문이 비어 있습니다.");
  }
  return text;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 지원합니다." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." });
  }

  let bodyRaw: unknown = req.body;
  if (typeof bodyRaw === "string") {
    try {
      bodyRaw = JSON.parse(bodyRaw);
    } catch {
      return res.status(400).json({ error: "JSON 본문 파싱에 실패했습니다." });
    }
  }
  const payload = parseBody(bodyRaw);
  if (!payload) {
    return res.status(400).json({ error: "요청 데이터 형식이 올바르지 않습니다." });
  }

  const prompt = `
너는 초등 수학 교사 보조 AI다.
학생 활동 데이터를 바탕으로 교사용 분석 리포트를 JSON으로 작성해라.
숫자 나열이 아니라 강점/보완점의 원인을 설명해라.
각 문장은 한국어로 쓰고, 과장 없이 실제 수업에서 바로 쓸 수 있게 작성해라.

반드시 다음 JSON 스키마만 출력:
{
  "summary": "string",
  "strengths": ["string", ...],
  "weaknesses": ["string", ...],
  "actionPlan": ["string", ...],
  "rubricNote": "string",
  "teacherComment": "string"
}

학생 데이터:
${JSON.stringify(payload, null, 2)}
`;

  try {
    const text = await callGemini(apiKey, prompt);
    const parsed = JSON.parse(text) as StudentReportResponse;
    return res.status(200).json({
      report: {
        summary: parsed.summary ?? "",
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
        actionPlan: Array.isArray(parsed.actionPlan) ? parsed.actionPlan : [],
        rubricNote: parsed.rubricNote ?? "",
        teacherComment: parsed.teacherComment ?? "",
      },
    });
  } catch {
    return res.status(200).json({ report: fallbackReport(payload), fallback: true });
  }
}
