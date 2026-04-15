type GroupInput = {
  groupId: number;
  onlineCount: number;
  avgLevel: number;
  avgAccuracy: number;
  studentCount: number;
};

type GroupAnalysisRequest = {
  classCode: string;
  groups: GroupInput[];
};

type GroupAnalysisResponse = {
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

function fallback(payload: GroupAnalysisRequest): GroupAnalysisResponse {
  const highest = [...payload.groups].sort((a, b) => b.avgAccuracy - a.avgAccuracy)[0];
  const lowest = [...payload.groups].sort((a, b) => a.avgAccuracy - b.avgAccuracy)[0];
  return {
    summary: `반코드 ${payload.classCode} 기준으로 모둠별 성취도를 비교한 결과, 상위 모둠은 ${highest?.groupId ?? "-"}모둠, 보완이 필요한 모둠은 ${lowest?.groupId ?? "-"}모둠입니다.`,
    groupInsights: payload.groups.map((g) => ({
      groupId: g.groupId,
      status:
        g.avgAccuracy >= 80
          ? "안정"
          : g.avgAccuracy >= 65
            ? "보통"
            : "지원 필요",
      strengths:
        g.avgAccuracy >= 75
          ? ["핵심 유형 정답률이 높아 모둠 내 협력 풀이가 잘 작동합니다."]
          : ["참여 인원이 유지되어 모둠 학습 기반은 갖춰져 있습니다."],
      risks:
        g.avgAccuracy < 65
          ? ["오답 누적 가능성이 높아 기본 계산 절차 재정비가 필요합니다."]
          : ["난이도 상승 시 정확도 하락 가능성을 점검해야 합니다."],
      actions: [
        "오답이 많았던 차시를 5문항 단위로 재연습합니다.",
        "모둠 내 상위 학생이 풀이 과정을 설명하도록 역할을 배치합니다.",
      ],
    })),
    classActions: [
      "모둠 간 난이도 편차를 줄이기 위해 차시별 공통 오답 유형을 먼저 지도하세요.",
      "정답률 하위 모둠에 검산 루틴(식 세우기→계산→검산)을 고정 적용하세요.",
    ],
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
    throw new Error(`Gemini 호출 실패: ${res.status}`);
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
  let body = req.body as unknown;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "JSON 본문 파싱 실패" });
    }
  }
  const payload = body as GroupAnalysisRequest;
  if (!payload || !Array.isArray(payload.groups)) {
    return res.status(400).json({ error: "요청 데이터 형식이 올바르지 않습니다." });
  }

  const fb = fallback(payload);
  const prompt = `
너는 초등 수학 교사의 모둠 운영 보조 AI다.
입력된 모둠 지표를 바탕으로 모둠별 상태를 해석하고 지도 조치를 제안하라.
반드시 한국어 JSON만 출력하라.

출력 스키마:
{
  "summary": "string",
  "groupInsights": [
    {
      "groupId": number,
      "status": "string",
      "strengths": ["string"],
      "risks": ["string"],
      "actions": ["string"]
    }
  ],
  "classActions": ["string"]
}

데이터:
${JSON.stringify(payload, null, 2)}
`;

  try {
    const txt = await callGemini(apiKey, prompt);
    const parsed = JSON.parse(txt) as GroupAnalysisResponse;
    return res.status(200).json({ report: parsed });
  } catch {
    return res.status(200).json({ report: fb, fallback: true });
  }
}
