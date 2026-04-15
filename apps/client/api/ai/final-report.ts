type FinalReportRequest = {
  studentName: string;
  level: number;
  elapsedSec: number;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  earnedItems: string[];
  levelStats: Record<string, { correct: number; wrong: number }>;
};

type FinalReport = {
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

function fallbackSvg(items: string[]) {
  const hasCape = items.some((v) => v.includes("망토"));
  const hasGlasses = items.some((v) => v.includes("안경"));
  const hasHat = items.some((v) => v.includes("모자") || v.includes("귀"));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<rect width="256" height="256" fill="#f7fff0"/>
<circle cx="128" cy="78" r="34" fill="#ffd7b3"/>
<rect x="90" y="110" width="76" height="90" rx="16" fill="#8cc6ff"/>
${hasCape ? '<path d="M88 120 L168 120 L188 210 L68 210 Z" fill="#b78cff" opacity="0.85"/>' : ""}
${hasGlasses ? '<rect x="104" y="70" width="20" height="12" rx="3" fill="none" stroke="#333"/><rect x="132" y="70" width="20" height="12" rx="3" fill="none" stroke="#333"/><line x1="124" y1="76" x2="132" y2="76" stroke="#333"/>' : ""}
${hasHat ? '<path d="M88 58 Q128 18 168 58 Z" fill="#ffcf6e"/>' : ""}
<circle cx="116" cy="78" r="3" fill="#333"/>
<circle cx="140" cy="78" r="3" fill="#333"/>
<path d="M116 94 Q128 102 140 94" stroke="#333" fill="none" stroke-width="2"/>
</svg>`;
}

function fallbackReport(input: FinalReportRequest): FinalReport {
  return {
    title: `${input.studentName} 학생 학습 종료 보고서`,
    overview: `총 ${input.totalAttempts}문항을 풀어 정답 ${input.totalCorrect}문항, 정답률 ${input.accuracy}%를 기록했습니다.`,
    achievementHighlights: [
      `레벨 ${input.level}까지 도달하며 단계별 문제를 완주했습니다.`,
      `획득 아이템 ${input.earnedItems.length}개로 꾸준한 학습 참여를 보였습니다.`,
    ],
    nextGoals: [
      "오답이 나온 차시를 중심으로 하루 10분 복습 루틴을 유지합니다.",
      "정답을 맞춘 문제도 풀이 과정을 말로 설명하는 연습을 추가합니다.",
    ],
    parentGuide:
      "가정에서는 정답 개수보다 풀이 과정을 칭찬해 주세요. 아이가 스스로 검산하는 습관을 만들면 성장이 빨라집니다.",
    finalCharacter: {
      title: "학습 아이템 기반 최종 캐릭터",
      description: "획득 아이템 특징을 반영한 간단한 AI 캐릭터 스케치입니다.",
      svg: fallbackSvg(input.earnedItems),
    },
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
          temperature: 0.5,
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
    throw new Error("Gemini 응답이 비어 있습니다.");
  }
  return text;
}

function normalizeSvg(input: string, fallback: string) {
  if (typeof input !== "string") return fallback;
  const svg = input.trim();
  if (!svg.startsWith("<svg") || !svg.includes("</svg>")) return fallback;
  return svg;
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
  const payload = (bodyRaw ?? {}) as FinalReportRequest;
  if (!payload || typeof payload.studentName !== "string") {
    return res.status(400).json({ error: "요청 데이터 형식이 올바르지 않습니다." });
  }

  const fallback = fallbackReport(payload);
  const prompt = `
너는 초등 수학 학습 리포트 작성 AI다.
학생 활동 요약 보고서와 아이템 기반 최종 캐릭터 SVG를 JSON으로 생성해라.
문장은 한국어로, 교사/학부모가 읽기 쉽게 작성한다.
SVG는 반드시 256x256 뷰박스의 단일 캐릭터 이미지여야 한다.

반드시 아래 JSON만 출력:
{
  "title": "string",
  "overview": "string",
  "achievementHighlights": ["string", ...],
  "nextGoals": ["string", ...],
  "parentGuide": "string",
  "finalCharacter": {
    "title": "string",
    "description": "string",
    "svg": "<svg ...>...</svg>"
  }
}

학생 데이터:
${JSON.stringify(payload, null, 2)}
`;

  try {
    const text = await callGemini(apiKey, prompt);
    const parsed = JSON.parse(text) as FinalReport;
    const safeSvg = normalizeSvg(parsed?.finalCharacter?.svg ?? "", fallback.finalCharacter.svg);
    return res.status(200).json({
      report: {
        title: parsed.title ?? fallback.title,
        overview: parsed.overview ?? fallback.overview,
        achievementHighlights: Array.isArray(parsed.achievementHighlights)
          ? parsed.achievementHighlights
          : fallback.achievementHighlights,
        nextGoals: Array.isArray(parsed.nextGoals) ? parsed.nextGoals : fallback.nextGoals,
        parentGuide: parsed.parentGuide ?? fallback.parentGuide,
        finalCharacter: {
          title: parsed?.finalCharacter?.title ?? fallback.finalCharacter.title,
          description: parsed?.finalCharacter?.description ?? fallback.finalCharacter.description,
          svg: safeSvg,
        },
      },
    });
  } catch {
    return res.status(200).json({ report: fallback, fallback: true });
  }
}
