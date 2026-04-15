import { onValue, ref as dbRef } from "firebase/database";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { realtimeDb } from "../config/firebase";
import { ACHIEVEMENT_COLORS, getAchievementByLevel } from "../config/achievement";
import CuteToast from "../components/ui/CuteToast";
import NpcBubble from "../components/ui/NpcBubble";
import type { BattleQuestion, GroupId } from "../types/game";
import {
  getStudentState,
  joinGroup,
  leaveGroup,
  logBattleEvent,
  subscribeGroupCounts,
  subscribeGroupMembers,
  syncStudentBattleState,
  type GroupMemberSummary,
} from "../services/groupSession";
import {
  classCodeExists,
  emptyLiveRankingsBundle,
  isValidClassCode,
  subscribeLevelRankingsByClassCode,
  type LevelRankingEntry,
  type LiveRankingsBundle,
} from "../services/classCode";
import {
  getLessonByLevel,
  normalizeAnswer,
  pickRandomQuestion,
} from "../services/battleQuestions";
import { generateAiFinalReport, type AiFinalReport } from "../services/aiCoach";

type LevelStats = {
  correct: number;
  wrong: number;
};

type Facing = "up" | "down" | "left" | "right";

type CharacterOption = {
  id: string;
  name: string;
  sprite: string;
};

type Rect = { x: number; y: number; width: number; height: number };

type RankingScope = "class" | "myGroup" | "allGroups";

const STUDENT_ACHIEVEMENT_LABEL: Record<string, string> = {
  "4수01-04": "세 자리 수의 곱셈 계산과 의미를 이해해 문제를 해결해요",
  "4수01-07": "나눗셈에서 몫과 나머지의 관계를 이해해 계산해요",
};

/** 숲에 돌아다니는 몬스터 한 마리 (96×32 워크 스트립 공통) */
type WildMonster = {
  id: string;
  x: number;
  y: number;
  sprite: string;
};

const WILD_MONSTER_STRIPS = [
  "/sprites/slime_walk_strip.svg",
  "/sprites/bat_walk_strip.svg",
  "/sprites/ghost_walk_strip.svg",
  "/sprites/mushroom_walk_strip.svg",
  "/sprites/golem_walk_strip.svg",
] as const;

const WILD_MONSTER_COUNT_MIN = 4;
const WILD_MONSTER_COUNT_MAX = 5;

function pickWildMonsterCount() {
  return (
    WILD_MONSTER_COUNT_MIN +
    Math.floor(Math.random() * (WILD_MONSTER_COUNT_MAX - WILD_MONSTER_COUNT_MIN + 1))
  );
}

function shuffleStripOrder(count: number): string[] {
  const pool = [...WILD_MONSTER_STRIPS];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]!);
}

function spawnWildMonsters(playerPos?: { x: number; y: number }, count?: number): WildMonster[] {
  const n = count ?? pickWildMonsterCount();
  const sprites = shuffleStripOrder(n);
  const placed: Array<{ x: number; y: number }> = [];
  const out: WildMonster[] = [];
  for (let i = 0; i < n; i += 1) {
    const pos = randomMonsterPosition(playerPos, placed);
    placed.push(pos);
    out.push({
      id: `wm_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      x: pos.x,
      y: pos.y,
      sprite: sprites[i]!,
    });
  }
  return out;
}

function seedMonsterVelocities(
  monsters: WildMonster[],
  ref: { current: Record<string, { vx: number; vy: number }> },
) {
  const next: Record<string, { vx: number; vy: number }> = {};
  for (const m of monsters) {
    next[m.id] = randomMonsterVelocity();
  }
  ref.current = next;
}

const ITEM_POOL = [
  "별 목걸이",
  "하트 배지",
  "리본 모자",
  "반짝 망토",
  "무지개 안경",
  "토끼 귀 장식",
];

/** 아이템 창고에 표시할 칸 수 (텍스트 타일만, 스프라이트 없음) */
const ITEM_WAREHOUSE_SLOTS = 16;

const AC_VILLAGER_TILE_MOD = ["ac-villager-tile--a", "ac-villager-tile--b", "ac-villager-tile--c", "ac-villager-tile--d"] as const;

const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 320;
const ENTITY_SIZE = 32;

const MAP_OBSTACLES: Rect[] = [
  { x: 160, y: 70, width: 80, height: 42 },
  { x: 300, y: 138, width: 70, height: 56 },
  { x: 460, y: 60, width: 92, height: 40 },
  { x: 70, y: 212, width: 112, height: 40 },
  { x: 420, y: 230, width: 130, height: 46 },
];

/** 이동 방향 스프라이트: 상·우·하·좌 4방향 × 3프레임 (모둠 최대 5명과는 별개) */
const FACING_ROW: Record<Facing, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};

const CHARACTER_OPTIONS: CharacterOption[] = [
  { id: "dog", name: "멍멍이", sprite: "/sprites/dog_walk_sheet.svg" },
  { id: "cat", name: "고양이", sprite: "/sprites/cat_walk_sheet.svg" },
  { id: "rabbit", name: "토끼", sprite: "/sprites/rabbit_walk_sheet.svg" },
  { id: "fox", name: "여우", sprite: "/sprites/fox_walk_sheet.svg" },
];

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function randomItem() {
  return ITEM_POOL[Math.floor(Math.random() * ITEM_POOL.length)];
}

const ITEM_DROP_CHANCE = 0.1;
const MAX_ITEMS_PER_LEVEL = 3;

function shouldDropItem() {
  return Math.random() < ITEM_DROP_CHANCE;
}

function intersectsRect(entity: Rect, obstacle: Rect) {
  return !(
    entity.x + entity.width <= obstacle.x ||
    entity.x >= obstacle.x + obstacle.width ||
    entity.y + entity.height <= obstacle.y ||
    entity.y >= obstacle.y + obstacle.height
  );
}

function intersectsAnyObstacle(entity: Rect) {
  return MAP_OBSTACLES.some((obstacle) => intersectsRect(entity, obstacle));
}

function randomMonsterPosition(
  playerPos?: { x: number; y: number },
  avoidOthers: Array<{ x: number; y: number }> = [],
) {
  for (let i = 0; i < 80; i += 1) {
    const candidate = {
      x: 24 + Math.floor(Math.random() * (WORLD_WIDTH - 48)),
      y: 24 + Math.floor(Math.random() * (WORLD_HEIGHT - 48)),
    };
    const hitbox = {
      x: candidate.x - ENTITY_SIZE / 2,
      y: candidate.y - ENTITY_SIZE / 2,
      width: ENTITY_SIZE,
      height: ENTITY_SIZE,
    };
    const tooCloseToPlayer =
      playerPos != null &&
      Math.hypot(candidate.x - playerPos.x, candidate.y - playerPos.y) < 88;
    const tooCloseToPeer = avoidOthers.some(
      (o) => Math.hypot(candidate.x - o.x, candidate.y - o.y) < 56,
    );
    if (!intersectsAnyObstacle(hitbox) && !tooCloseToPlayer && !tooCloseToPeer) {
      return candidate;
    }
  }
  return { x: WORLD_WIDTH - 52, y: WORLD_HEIGHT - 52 };
}

/** 몬스터 배회: 느린 속도의 단위 방향 벡터 */
function randomMonsterVelocity() {
  const a = Math.random() * Math.PI * 2;
  const speed = 0.55 + Math.random() * 0.28;
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}

function clampMonsterVelocity(v: { vx: number; vy: number }) {
  const len = Math.hypot(v.vx, v.vy) || 1;
  const target = 0.72;
  return { vx: (v.vx / len) * target, vy: (v.vy / len) * target };
}

const MONSTER_WANDER_MS = 340;
const MONSTER_WANDER_STEP = 2.1;

type Particle = {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
};

const PARALLAX_CLOUDS = [
  { left: "5%", top: "8%", scale: 1.1, duration: 62 },
  { left: "28%", top: "14%", scale: 0.9, duration: 74 },
  { left: "54%", top: "7%", scale: 1.2, duration: 68 },
  { left: "80%", top: "12%", scale: 0.95, duration: 78 },
] as const;

const FRONT_LEAVES = [
  { left: "4%", top: "18%", delay: 0 },
  { left: "12%", top: "82%", delay: 1.2 },
  { left: "88%", top: "10%", delay: 0.8 },
  { left: "94%", top: "74%", delay: 1.7 },
] as const;

export default function StudentPage() {
  const [selectedGroup, setSelectedGroup] = useState<GroupId>(1);
  const [joinedGroup, setJoinedGroup] = useState<GroupId | null>(null);
  const [message, setMessage] = useState<string>("");
  const [nickname, setNickname] = useState<string>(
    localStorage.getItem("math4rpg_nickname") ?? "",
  );
  const [classCode, setClassCode] = useState<string>(
    localStorage.getItem("math4rpg_class_code") ?? "",
  );
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(
    localStorage.getItem("math4rpg_character") ?? "",
  );
  const [counts, setCounts] = useState<Record<number, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  });
  const [playerLevel, setPlayerLevel] = useState(1);
  const [hp, setHp] = useState(100);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [levelCorrectCount, setLevelCorrectCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<BattleQuestion | null>(null);
  const [subjectiveAnswer, setSubjectiveAnswer] = useState("");
  const [battleFeedback, setBattleFeedback] = useState("");
  const [isCleared, setIsCleared] = useState(false);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [earnedItems, setEarnedItems] = useState<string[]>([]);
  const [levelItemDrops, setLevelItemDrops] = useState<Record<number, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  });
  const [appearanceTier, setAppearanceTier] = useState(1);
  const [levelStats, setLevelStats] = useState<Record<number, LevelStats>>({
    1: { correct: 0, wrong: 0 },
    2: { correct: 0, wrong: 0 },
    3: { correct: 0, wrong: 0 },
    4: { correct: 0, wrong: 0 },
    5: { correct: 0, wrong: 0 },
    6: { correct: 0, wrong: 0 },
  });
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; tone: "success" | "info" | "warning" }>
  >([]);
  const [aiFinalReport, setAiFinalReport] = useState<AiFinalReport | null>(null);
  const [aiFinalLoading, setAiFinalLoading] = useState(false);
  const [aiFinalError, setAiFinalError] = useState("");

  const [playerPos, setPlayerPos] = useState({ x: 90, y: 120 });
  const [playerFacing, setPlayerFacing] = useState<Facing>("down");
  const [walkFrame, setWalkFrame] = useState(0);
  const [wildMonsters, setWildMonsters] = useState<WildMonster[]>(() => spawnWildMonsters());
  const [monsterFrame, setMonsterFrame] = useState(0);
  const [liveRankings, setLiveRankings] = useState<LiveRankingsBundle>(() => emptyLiveRankingsBundle());
  const [rankingTab, setRankingTab] = useState(1);
  const rankingScope: RankingScope = "class";
  const [groupMembers, setGroupMembers] = useState<GroupMemberSummary[]>([]);
  const joinedGroupRef = useRef<GroupId | null>(null);
  const playfieldRef = useRef<HTMLDivElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleFrameRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const monsterVelRef = useRef<Record<string, { vx: number; vy: number }>>({});

  useEffect(() => {
    seedMonsterVelocities(wildMonsters, monsterVelRef);
    // 최초 스폰 팩만 시드 — 배회 중 setState마다 실행하면 안 됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = particleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const initParticles = () => {
      particlesRef.current = Array.from({ length: 28 }, () => ({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        size: 1 + Math.random() * 2.4,
        vx: -0.16 + Math.random() * 0.32,
        vy: -0.22 - Math.random() * 0.35,
        alpha: 0.2 + Math.random() * 0.35,
      }));
    };

    canvas.width = WORLD_WIDTH;
    canvas.height = WORLD_HEIGHT;
    initParticles();

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -8) {
          p.y = canvas.height + 6;
          p.x = Math.random() * canvas.width;
        }
        if (p.x < -8) p.x = canvas.width + 8;
        if (p.x > canvas.width + 8) p.x = -8;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(238, 255, 210, ${p.alpha})`;
        ctx.fill();
      }
      particleFrameRef.current = window.requestAnimationFrame(draw);
    };

    particleFrameRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (particleFrameRef.current != null) {
        window.cancelAnimationFrame(particleFrameRef.current);
      }
    };
  }, []);

  const sessionUserId = useMemo(() => {
    const key = "math4rpg_user_id";
    const found = localStorage.getItem(key);
    if (found) return found;
    const generated = `u_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(key, generated);
    return generated;
  }, []);
  const sessionStartedAt = useMemo(() => Date.now(), []);

  const selectedCharacter = useMemo(
    () => CHARACTER_OPTIONS.find((c) => c.id === selectedCharacterId),
    [selectedCharacterId],
  );

  const pushToast = useCallback(
    (message: string, tone: "success" | "info" | "warning" = "info") => {
      const id = crypto.randomUUID();
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, 2500);
    },
    [],
  );

  useEffect(() => subscribeGroupCounts(setCounts), []);

  useEffect(() => {
    if (!joinedGroup) {
      setGroupMembers([]);
      return;
    }
    return subscribeGroupMembers(joinedGroup, setGroupMembers);
  }, [joinedGroup]);

  useEffect(() => {
    if (!joinedGroup || !isValidClassCode(classCode.trim())) {
      setLiveRankings(emptyLiveRankingsBundle());
      return;
    }
    return subscribeLevelRankingsByClassCode(classCode.trim(), setLiveRankings);
  }, [joinedGroup, classCode]);

  useEffect(() => {
    if (joinedGroup) setRankingTab(playerLevel);
  }, [joinedGroup, playerLevel]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - sessionStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStartedAt]);

  useEffect(() => {
    joinedGroupRef.current = joinedGroup;
  }, [joinedGroup]);

  useEffect(() => {
    return () => {
      if (joinedGroup) {
        void leaveGroup(joinedGroup, sessionUserId, nickname || "학생");
      }
    };
  }, [joinedGroup, sessionUserId, nickname]);

  useEffect(() => {
    const r = dbRef(realtimeDb, `students/${sessionUserId}`);
    return onValue(r, (snap) => {
      if (!snap.exists()) return;
      const gid = snap.val()?.groupId;
      if (joinedGroupRef.current != null && (gid === null || gid === undefined)) {
        setJoinedGroup(null);
        setMessage("교사에 의해 모둠에서 제외되었습니다.");
        pushToast("모둠에서 나왔어요.", "warning");
      }
    });
  }, [sessionUserId, pushToast]);

  const tryMove = useCallback(
    (event: KeyboardEvent) => {
      if (!joinedGroupRef.current || currentQuestion || isCleared) return;
      const step = 12;
      let dx = 0;
      let dy = 0;
      let nextFacing: Facing = "down";
      switch (event.code) {
        case "ArrowUp":
        case "KeyW":
          dy = -step;
          nextFacing = "up";
          break;
        case "ArrowDown":
        case "KeyS":
          dy = step;
          nextFacing = "down";
          break;
        case "ArrowLeft":
        case "KeyA":
          dx = -step;
          nextFacing = "left";
          break;
        case "ArrowRight":
        case "KeyD":
          dx = step;
          nextFacing = "right";
          break;
        default:
          return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPlayerPos((prev) => {
        const x = Math.max(
          ENTITY_SIZE / 2,
          Math.min(WORLD_WIDTH - ENTITY_SIZE / 2, prev.x + dx),
        );
        const y = Math.max(
          ENTITY_SIZE / 2,
          Math.min(WORLD_HEIGHT - ENTITY_SIZE / 2, prev.y + dy),
        );
        const hitbox = {
          x: x - ENTITY_SIZE / 2,
          y: y - ENTITY_SIZE / 2,
          width: ENTITY_SIZE,
          height: ENTITY_SIZE,
        };
        if (intersectsAnyObstacle(hitbox)) return prev;
        queueMicrotask(() => {
          setPlayerFacing(nextFacing);
          setWalkFrame((f) => (f + 1) % 3);
        });
        return { x, y };
      });
    },
    [currentQuestion, isCleared],
  );

  useEffect(() => {
    if (!joinedGroup || currentQuestion || isCleared) return;
    const onKeyDown = (e: KeyboardEvent) => {
      tryMove(e);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [joinedGroup, currentQuestion, isCleared, tryMove]);

  useEffect(() => {
    if (!joinedGroup || currentQuestion) return;
    const t = window.setTimeout(() => playfieldRef.current?.focus({ preventScroll: true }), 200);
    return () => window.clearTimeout(t);
  }, [joinedGroup, currentQuestion]);

  useEffect(() => {
    if (currentQuestion || isCleared) return;
    const timer = window.setInterval(() => {
      setMonsterFrame((frame) => (frame + 1) % 3);
    }, 220);
    return () => window.clearInterval(timer);
  }, [currentQuestion, isCleared]);

  useEffect(() => {
    if (currentQuestion || isCleared) return;
    const id = window.setInterval(() => {
      setWildMonsters((prev) =>
        prev.map((m) => {
          let v = monsterVelRef.current[m.id];
          if (!v) {
            v = randomMonsterVelocity();
            monsterVelRef.current[m.id] = v;
          }
          if (Math.random() < 0.12) {
            const turn = (Math.random() - 0.5) * 0.9;
            const cos = Math.cos(turn);
            const sin = Math.sin(turn);
            const rx = v.vx * cos - v.vy * sin;
            const ry = v.vx * sin + v.vy * cos;
            v = clampMonsterVelocity({ vx: rx, vy: ry });
            monsterVelRef.current[m.id] = v;
          }
          const vel = monsterVelRef.current[m.id] ?? v;
          const rawX = m.x + vel.vx * MONSTER_WANDER_STEP;
          const rawY = m.y + vel.vy * MONSTER_WANDER_STEP;
          const half = ENTITY_SIZE / 2;
          let nx = rawX;
          let ny = rawY;
          if (rawX < half) {
            nx = half;
            monsterVelRef.current[m.id] = {
              vx: Math.abs(vel.vx) * 0.85 + 0.08,
              vy: vel.vy + (Math.random() - 0.5) * 0.2,
            };
          } else if (rawX > WORLD_WIDTH - half) {
            nx = WORLD_WIDTH - half;
            monsterVelRef.current[m.id] = {
              vx: -Math.abs(vel.vx) * 0.85 - 0.08,
              vy: vel.vy + (Math.random() - 0.5) * 0.2,
            };
          }
          if (rawY < half) {
            ny = half;
            const cur = monsterVelRef.current[m.id] ?? vel;
            monsterVelRef.current[m.id] = {
              vx: cur.vx + (Math.random() - 0.5) * 0.2,
              vy: Math.abs(cur.vy) * 0.85 + 0.08,
            };
          } else if (rawY > WORLD_HEIGHT - half) {
            ny = WORLD_HEIGHT - half;
            const cur = monsterVelRef.current[m.id] ?? vel;
            monsterVelRef.current[m.id] = {
              vx: cur.vx + (Math.random() - 0.5) * 0.2,
              vy: -Math.abs(cur.vy) * 0.85 - 0.08,
            };
          }
          monsterVelRef.current[m.id] = clampMonsterVelocity(monsterVelRef.current[m.id] ?? vel);
          const hitbox = {
            x: nx - half,
            y: ny - half,
            width: ENTITY_SIZE,
            height: ENTITY_SIZE,
          };
          if (intersectsAnyObstacle(hitbox)) {
            monsterVelRef.current[m.id] = randomMonsterVelocity();
            return m;
          }
          return { ...m, x: nx, y: ny };
        }),
      );
    }, MONSTER_WANDER_MS);
    return () => window.clearInterval(id);
  }, [currentQuestion, isCleared]);

  useEffect(() => {
    if (!joinedGroup || currentQuestion || isCleared) return;
    const hit = wildMonsters.some(
      (m) => Math.hypot(playerPos.x - m.x, playerPos.y - m.y) < 38,
    );
    if (hit) {
      const question = pickRandomQuestion(playerLevel);
      setCurrentQuestion(question);
      setBattleFeedback("");
      setSubjectiveAnswer("");
      pushToast("몬스터를 만났어요! 문제에 도전하세요.", "info");
    }
  }, [joinedGroup, playerPos, wildMonsters, currentQuestion, playerLevel, isCleared, pushToast]);

  const handleJoin = useCallback(async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setMessage("닉네임을 먼저 입력해 주세요.");
      return;
    }
    if (!selectedCharacterId) {
      setMessage("캐릭터를 먼저 선택해 주세요.");
      return;
    }
    const code = classCode.trim();
    if (!isValidClassCode(code)) {
      setMessage("반코드는 숫자 5자리로 입력해 주세요.");
      return;
    }
    try {
      const exists = await classCodeExists(code);
      if (!exists) {
        setMessage("존재하지 않는 반코드입니다.");
        return;
      }
      localStorage.setItem("math4rpg_nickname", trimmed);
      localStorage.setItem("math4rpg_class_code", code);
      localStorage.setItem("math4rpg_character", selectedCharacterId);
      await joinGroup(selectedGroup, sessionUserId, trimmed, code);
      const persisted = await getStudentState(sessionUserId);
      if (persisted) {
        setPlayerLevel(persisted.level ?? 1);
        setLevelCorrectCount(
          Math.max(0, Math.round(((persisted.levelProgress ?? 0) / 100) * 15)),
        );
        setWrongStreak(persisted.wrongStreak ?? 0);
        setHp(persisted.hp ?? 100);
        setAppearanceTier(persisted.appearanceTier ?? 1);
        setEarnedItems(persisted.earnedItems ?? []);
      }
      setJoinedGroup(selectedGroup);
      {
        const pack = spawnWildMonsters(playerPos);
        seedMonsterVelocities(pack, monsterVelRef);
        setWildMonsters(pack);
      }
      setMessage(`${selectedGroup}모둠 입장 완료`);
      pushToast(`${selectedGroup}모둠에 입장했어요!`, "success");
    } catch (error) {
      const text = error instanceof Error ? error.message : "입장 실패";
      setMessage(text);
      pushToast(text, "warning");
    }
  }, [
    nickname,
    selectedCharacterId,
    classCode,
    selectedGroup,
    sessionUserId,
    playerPos,
    pushToast,
  ]);

  const handleLeave = async () => {
    if (!joinedGroup) return;
    await leaveGroup(joinedGroup, sessionUserId, nickname || "학생");
    setJoinedGroup(null);
    setMessage(`${joinedGroup}모둠에서 퇴장했습니다.`);
    pushToast("모둠에서 나왔어요.", "info");
  };

  const handleAnswer = (submitted: string) => {
    if (!currentQuestion) return;
    const isCorrect =
      normalizeAnswer(submitted) === normalizeAnswer(currentQuestion.answer);
    const nextAttempts = totalAttempts + 1;
    setTotalAttempts(nextAttempts);

    if (isCorrect) {
      setLevelStats((prev) => ({
        ...prev,
        [playerLevel]: {
          correct: prev[playerLevel].correct + 1,
          wrong: prev[playerLevel].wrong,
        },
      }));
      const nextCorrect = levelCorrectCount + 1;
      const nextTotalCorrect = totalCorrect + 1;
      setLevelCorrectCount(nextCorrect);
      setTotalCorrect(nextTotalCorrect);
      setWrongStreak(0);
      const levelDropCount = levelItemDrops[playerLevel] ?? 0;
      const canDropByLevel = levelDropCount < MAX_ITEMS_PER_LEVEL;
      const droppedItem = canDropByLevel && shouldDropItem() ? randomItem() : null;
      if (droppedItem) {
        setEarnedItems((prev) => [...prev, droppedItem]);
        setLevelItemDrops((prev) => ({
          ...prev,
          [playerLevel]: (prev[playerLevel] ?? 0) + 1,
        }));
      }
      const nextTier = Math.min(6, Math.floor(nextTotalCorrect / 5) + 1);
      setAppearanceTier(nextTier);
      setBattleFeedback(
        droppedItem
          ? `정답! 몬스터 처치 성공 (+${droppedItem}) / ${currentQuestion.explanation}`
          : canDropByLevel
            ? `정답! 몬스터 처치 성공 (이번에는 아이템 없음) / ${currentQuestion.explanation}`
            : `정답! 몬스터 처치 성공 (이 레벨 아이템은 최대 ${MAX_ITEMS_PER_LEVEL}개 획득 완료) / ${currentQuestion.explanation}`,
      );
      pushToast(
        droppedItem
          ? `정답! ${droppedItem} 획득`
          : canDropByLevel
            ? "정답! 이번에는 아이템이 드랍되지 않았어요."
            : `정답! 이 레벨 아이템은 최대 ${MAX_ITEMS_PER_LEVEL}개까지 획득할 수 있어요.`,
        "success",
      );
      {
        const pack = spawnWildMonsters(playerPos);
        seedMonsterVelocities(pack, monsterVelRef);
        setWildMonsters(pack);
      }
      if (joinedGroup) {
        void logBattleEvent({
          type: "BATTLE_CORRECT",
          userId: sessionUserId,
          userName: nickname || "학생",
          classCode: classCode.trim(),
          groupId: joinedGroup,
          extra: {
            questionId: currentQuestion.id,
            level: playerLevel,
            lesson: currentQuestion.lesson,
            questionType: currentQuestion.type,
            questionKind: currentQuestion.questionKind ?? "computation",
            achievementStandard: currentQuestion.achievementStandard,
          },
        });
      }

      if (nextCorrect >= 15) {
        if (playerLevel < 6) {
          const nextLevel = playerLevel + 1;
          setPlayerLevel((prev) => prev + 1);
          setLevelCorrectCount(0);
          setHp((prev) => Math.min(100, prev + 10));
          setBattleFeedback("레벨업 성공! 다음 차시 문제로 진행합니다.");
          if (joinedGroup) {
            void logBattleEvent({
              type: "LEVEL_UP",
              userId: sessionUserId,
              userName: nickname || "학생",
              classCode: classCode.trim(),
              groupId: joinedGroup,
              extra: { level: nextLevel },
            });
          }
        } else {
          setIsCleared(true);
          setBattleFeedback("만렙입니다! 레벨6 목표 15문항을 달성했습니다.");
          if (joinedGroup) {
            void logBattleEvent({
              type: "GAME_CLEAR",
              userId: sessionUserId,
              userName: nickname || "학생",
              classCode: classCode.trim(),
              groupId: joinedGroup,
              extra: { level: 6 },
            });
          }
        }
      }
    } else {
      setLevelStats((prev) => ({
        ...prev,
        [playerLevel]: {
          correct: prev[playerLevel].correct,
          wrong: prev[playerLevel].wrong + 1,
        },
      }));
      const nextWrong = wrongStreak + 1;
      setWrongStreak(nextWrong);
      setHp((prev) => Math.max(0, prev - 20));
      setBattleFeedback(
        `오답! 데미지 -20 / 정답: ${currentQuestion.answer.replaceAll("...", " ... ")}`,
      );
      pushToast("오답! 체력이 줄었어요.", "warning");
      if (joinedGroup) {
        void logBattleEvent({
          type: "BATTLE_WRONG",
          userId: sessionUserId,
          userName: nickname || "학생",
          classCode: classCode.trim(),
          groupId: joinedGroup,
          extra: {
            questionId: currentQuestion.id,
            level: playerLevel,
            lesson: currentQuestion.lesson,
            questionType: currentQuestion.type,
            questionKind: currentQuestion.questionKind ?? "computation",
            achievementStandard: currentQuestion.achievementStandard,
          },
        });
      }

      if (nextWrong >= 3) {
        if (playerLevel > 1) {
          const nextLevel = playerLevel - 1;
          setPlayerLevel((prev) => prev - 1);
          setLevelCorrectCount(0);
          setWrongStreak(0);
          setBattleFeedback("오답 3회로 레벨 다운되었습니다.");
          if (joinedGroup) {
            void logBattleEvent({
              type: "LEVEL_DOWN",
              userId: sessionUserId,
              userName: nickname || "학생",
              classCode: classCode.trim(),
              groupId: joinedGroup,
              extra: { level: nextLevel },
            });
          }
        } else {
          setWrongStreak(0);
          setBattleFeedback("오답 3회지만 레벨1은 다운그레이드되지 않습니다.");
        }
      }
    }
    setCurrentQuestion(null);
    setSubjectiveAnswer("");
  };

  const achievement = getAchievementByLevel(playerLevel);
  const lesson = getLessonByLevel(playerLevel);
  const progressPercent = Math.min(100, Math.round((levelCorrectCount / 15) * 100));
  const recentAccuracy =
    totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100);
  const totalWrong = totalAttempts - totalCorrect;

  useEffect(() => {
    if (!joinedGroup) return;
    void syncStudentBattleState({
      userId: sessionUserId,
      userName: nickname || "학생",
      classCode: classCode.trim(),
      groupId: joinedGroup,
      level: playerLevel,
      levelProgress: progressPercent,
      recentAccuracy,
      wrongStreak,
      hp,
      appearanceTier,
      earnedItems,
    });
  }, [
    joinedGroup,
    sessionUserId,
    nickname,
    classCode,
    playerLevel,
    progressPercent,
    recentAccuracy,
    wrongStreak,
    hp,
    appearanceTier,
    earnedItems,
  ]);

  const displayMembers = useMemo((): GroupMemberSummary[] => {
    if (!joinedGroup) return [];
    let list: GroupMemberSummary[] =
      groupMembers.length > 0
        ? [...groupMembers]
        : [{ userId: sessionUserId, userName: nickname.trim() || "나", joinedAt: 0 }];
    if (!list.some((m) => m.userId === sessionUserId)) {
      list.push({
        userId: sessionUserId,
        userName: nickname.trim() || "나",
        joinedAt: Date.now(),
      });
    }
    list.sort((a, b) => a.joinedAt - b.joinedAt);
    return list;
  }, [joinedGroup, groupMembers, sessionUserId, nickname]);

  const partySize = displayMembers.length;

  const rankingRows: LevelRankingEntry[] = useMemo(() => {
    const lv = rankingTab;
    if (rankingScope === "class") return liveRankings.classByLevel[lv] ?? [];
    if (rankingScope === "myGroup" && joinedGroup != null) {
      return liveRankings.perGroupByLevel[lv]?.[joinedGroup] ?? [];
    }
    return [];
  }, [liveRankings, rankingTab, rankingScope, joinedGroup]);

  const rankingSubLine = useMemo(() => {
    const lesson = getLessonByLevel(rankingTab);
    if (rankingScope === "class") {
      return `같은 반 · 레벨 ${rankingTab} (차시 ${lesson}) · 반 전체 상위`;
    }
    if (rankingScope === "myGroup" && joinedGroup != null) {
      return `${joinedGroup}모둠 안 · 레벨 ${rankingTab} (차시 ${lesson})`;
    }
    return `모둠별 · 레벨 ${rankingTab} (차시 ${lesson})`;
  }, [rankingScope, rankingTab, joinedGroup]);

  const canAttemptJoin = useMemo(
    () =>
      nickname.trim().length > 0 &&
      Boolean(selectedCharacterId) &&
      isValidClassCode(classCode.trim()),
    [nickname, selectedCharacterId, classCode],
  );

  const forestScene = (
    <>
      <div className="game-layer game-layer--back" aria-hidden>
        <div className="game-map-backdrop" />
        <div className="game-parallax-hills game-parallax-hills--far" />
        <div className="game-parallax-hills game-parallax-hills--mid" />
        <div className="game-parallax-clouds">
          {PARALLAX_CLOUDS.map((cloud, idx) => (
            <span
              key={`cloud-${idx}`}
              className="game-parallax-cloud"
              style={
                {
                  "--cloud-left": cloud.left,
                  "--cloud-top": cloud.top,
                  "--cloud-scale": cloud.scale,
                  "--cloud-duration": `${cloud.duration}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className="game-layer game-layer--mid" aria-hidden>
        <div className="game-map-path" />
        <div className="game-map-decor">
          <span className="game-map-tree" style={{ left: 22, top: 198 }} />
          <span className="game-map-tree game-map-tree--pine" style={{ left: 598, top: 42 }} />
          <span className="game-map-tree" style={{ left: 520, top: 228 }} />
          <span className="game-map-flower" style={{ left: 110, top: 268 }} />
          <span className="game-map-flower game-map-flower--pink" style={{ left: 380, top: 288 }} />
          <span className="game-map-flower game-map-flower--yellow" style={{ left: 250, top: 52 }} />
          <span className="game-map-flower" style={{ left: 470, top: 118 }} />
          <span className="game-map-bush" style={{ left: 44, top: 88 }} />
          <span className="game-map-bush" style={{ left: 560, top: 168 }} />
        </div>
        <div className="game-tiles" />
        {MAP_OBSTACLES.map((obstacle, index) => (
          <div
            key={`${obstacle.x}-${obstacle.y}-${index}`}
            className="map-obstacle"
            style={{
              left: `${obstacle.x}px`,
              top: `${obstacle.y}px`,
              width: `${obstacle.width}px`,
              height: `${obstacle.height}px`,
            }}
          />
        ))}
      </div>

      <canvas ref={particleCanvasRef} className="game-particle-canvas" aria-hidden />
      {selectedCharacter && (
        <motion.div
          className="player-sprite"
          style={{ left: `${playerPos.x}px`, top: `${playerPos.y}px` }}
          animate={walkFrame === 1 ? { scaleY: [1, 0.9, 1.08, 1] } : { scaleY: [1, 1.03, 1] }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div
            className="sprite-body sprite-player"
            style={{
              backgroundImage: `url(${selectedCharacter.sprite})`,
              backgroundPosition: `${-walkFrame * ENTITY_SIZE}px ${
                -FACING_ROW[playerFacing] * ENTITY_SIZE
              }px`,
            }}
          />
        </motion.div>
      )}
      {wildMonsters.map((m, idx) => (
        <div key={m.id} className="monster-sprite" style={{ left: `${m.x}px`, top: `${m.y}px` }}>
          <div
            className="sprite-body sprite-monster"
            style={{
              backgroundImage: `url(${m.sprite})`,
              backgroundPositionX: `${-monsterFrame * ENTITY_SIZE}px`,
              animationDelay: `${idx * 0.12}s`,
              animationDuration: `${0.85 + (idx % 5) * 0.1}s`,
            }}
          />
        </div>
      ))}

      <div className="game-layer game-layer--front" aria-hidden>
        {FRONT_LEAVES.map((leaf, idx) => (
          <span
            key={`front-leaf-${idx}`}
            className="game-front-leaf"
            style={
              {
                left: leaf.left,
                top: leaf.top,
                "--leaf-delay": `${leaf.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </>
  );

  return (
    <>
      <div className="student-page-layout">
        <aside className="student-page-col student-page-col--side">
      <section className="page-card forest-hub-card">
        <div className="forest-ac-title" aria-hidden>
          <span className="forest-ac-title__tile forest-ac-title__tile--pink">숲</span>
          <span className="forest-ac-title__tile forest-ac-title__tile--blue">마</span>
          <span className="forest-ac-title__tile forest-ac-title__tile--mint">을</span>
        </div>
        <p className="forest-ac-tagline">수학과 함께하는 작은 마을이에요</p>

        <div className="forest-ac-villager-row" role="group" aria-label="캐릭터 선택">
          {CHARACTER_OPTIONS.map((character, idx) => (
            <button
              key={character.id}
              type="button"
              className={`ac-villager-tile ${AC_VILLAGER_TILE_MOD[idx % AC_VILLAGER_TILE_MOD.length]} ${
                selectedCharacterId === character.id ? "ac-villager-tile--picked" : ""
              }`}
              onClick={() => setSelectedCharacterId(character.id)}
              aria-pressed={selectedCharacterId === character.id}
            >
              <span
                className="ac-villager-tile__portrait"
                style={{
                  backgroundImage: `url(${character.sprite})`,
                  backgroundPosition: `0px ${-FACING_ROW.down * ENTITY_SIZE}px`,
                }}
              />
              <span className="ac-villager-tile__name">{character.name}</span>
            </button>
          ))}
        </div>

        <motion.div
          className="item-warehouse"
          aria-label="아이템 창고"
          initial={{ opacity: 0.92, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div className="item-warehouse__head">
            <span className="item-warehouse__icon" aria-hidden>
              📦
            </span>
            아이템 창고
          </div>
          <p className="item-warehouse__note">획득한 장비는 여기 칸에만 표시돼요. 캐릭터 스프라이트 위에는 얹지 않아요.</p>
          <div className="item-warehouse__grid">
            {Array.from({ length: ITEM_WAREHOUSE_SLOTS }, (_, i) => {
              const label = earnedItems[i];
              return (
                <div
                  key={`wh-${i}`}
                  className={`item-warehouse-slot${label ? " item-warehouse-slot--filled" : ""}`}
                >
                  {label ? (
                    <span className="item-warehouse-slot__text">{label}</span>
                  ) : (
                    <span className="item-warehouse-slot__empty">빈 칸</span>
                  )}
                </div>
              );
            })}
          </div>
          {earnedItems.length > ITEM_WAREHOUSE_SLOTS ? (
            <p className="item-warehouse__more">+{earnedItems.length - ITEM_WAREHOUSE_SLOTS}개 더 있어요</p>
          ) : null}
        </motion.div>

        {!joinedGroup ? (
          <div className="forest-gate-form">
            <label className="forest-gate-field">
              <span className="forest-gate-label">닉네임</span>
              <input
                className="forest-gate-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="이름을 적어 주세요"
                autoComplete="nickname"
              />
            </label>
            <label className="forest-gate-field">
              <span className="forest-gate-label">반코드</span>
              <input
                className="forest-gate-input forest-gate-input--code"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="5자리"
                inputMode="numeric"
              />
            </label>
            <label className="forest-gate-field forest-gate-field--select">
              <span className="forest-gate-label">모둠</span>
              <select
                className="forest-gate-select"
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(Number(e.target.value) as GroupId)}
              >
                <option value={1}>1모둠 ({counts[1]}/5)</option>
                <option value={2}>2모둠 ({counts[2]}/5)</option>
                <option value={3}>3모둠 ({counts[3]}/5)</option>
                <option value={4}>4모둠 ({counts[4]}/5)</option>
                <option value={5}>5모둠 ({counts[5]}/5)</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="forest-hub-status">
            <p className="forest-hub-status__line">
              <strong>{selectedCharacter?.name ?? "—"}</strong> · {joinedGroup}모둠 참가 중 · Lv{playerLevel}{" "}
              (차시 {lesson}) · HP {hp}
            </p>
            <button type="button" className="forest-hub-leave-btn" onClick={() => void handleLeave()}>
              모둠에서 나가기
            </button>
          </div>
        )}

        <details className="forest-prep-details">
          <summary>상세 상태 보기</summary>
          <div className="forest-prep-detail-grid">
            <p>
              성취수준:{" "}
              <span className="badge" style={{ backgroundColor: ACHIEVEMENT_COLORS[achievement] }}>
                {achievement}
              </span>
            </p>
            <p>
              레벨 성취율: {progressPercent}% ({levelCorrectCount}/15)
            </p>
            <p>최근 정답률: {recentAccuracy}%</p>
            <p>캐릭터 외형 단계: {appearanceTier}단계</p>
          </div>
        </details>
        {message ? <p className="forest-prep-msg">{message}</p> : null}
        {!joinedGroup ? (
          <p className="forest-ac-hint">
            오른쪽 숲 미리보기에 포커스 후 <strong>Enter</strong>로도 입장할 수 있어요.
          </p>
        ) : null}
      </section>

      <section className="page-card student-summary-card">
        <h3>활동 요약</h3>
        <p className="student-summary-meta">
          총 활동 {formatDuration(elapsedSec)} · 시도 {totalAttempts} · 정답 {totalCorrect} · 정답률{" "}
          {recentAccuracy}%
        </p>
        <table className="student-table student-summary-table">
          <thead>
            <tr>
              <th>레벨</th>
              <th>차시</th>
              <th>정답</th>
              <th>오답</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <tr key={level}>
                <td>{level}</td>
                <td>{getLessonByLevel(level)}</td>
                <td>{levelStats[level].correct}</td>
                <td>{levelStats[level].wrong}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {isCleared ? (
        <section className="page-card student-clear-card">
          <h3>만렙 종료</h3>
          <p>
            총 풀이 {totalAttempts} / 정답 {totalCorrect} / 오답 {totalWrong} · {formatDuration(elapsedSec)}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button
              type="button"
              disabled={aiFinalLoading}
              onClick={async () => {
                try {
                  setAiFinalLoading(true);
                  setAiFinalError("");
                  const report = await generateAiFinalReport({
                    studentName: nickname.trim() || "학생",
                    level: playerLevel,
                    elapsedSec,
                    totalAttempts,
                    totalCorrect,
                    totalWrong,
                    accuracy: recentAccuracy,
                    earnedItems,
                    levelStats: Object.fromEntries(
                      Object.entries(levelStats).map(([k, v]) => [k, { correct: v.correct, wrong: v.wrong }]),
                    ),
                  });
                  setAiFinalReport(report);
                } catch (error) {
                  setAiFinalError(
                    error instanceof Error ? error.message : "AI 최종 보고서 생성에 실패했습니다.",
                  );
                } finally {
                  setAiFinalLoading(false);
                }
              }}
            >
              {aiFinalLoading ? "AI 보고서 생성 중..." : "AI 최종 보고서 만들기"}
            </button>
          </div>
          {aiFinalError ? <p style={{ color: "#b91c1c", marginTop: 8 }}>{aiFinalError}</p> : null}
          {aiFinalReport ? (
            <div style={{ marginTop: 10, borderTop: "1px solid #dde7c8", paddingTop: 10 }}>
              <h4 style={{ margin: "0 0 6px" }}>{aiFinalReport.title}</h4>
              <p>{aiFinalReport.overview}</p>
              <p>
                <strong>성장 포인트:</strong> {aiFinalReport.achievementHighlights.join(" / ")}
              </p>
              <p>
                <strong>다음 목표:</strong> {aiFinalReport.nextGoals.join(" / ")}
              </p>
              <p>
                <strong>가정 안내:</strong> {aiFinalReport.parentGuide}
              </p>
              <div style={{ marginTop: 10 }}>
                <p style={{ margin: "0 0 6px" }}>
                  <strong>{aiFinalReport.finalCharacter.title}</strong>
                </p>
                <p style={{ margin: "0 0 8px" }}>{aiFinalReport.finalCharacter.description}</p>
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(aiFinalReport.finalCharacter.svg)}`}
                  alt="AI 최종 캐릭터"
                  style={{
                    width: 220,
                    height: 220,
                    borderRadius: 12,
                    border: "1px solid #cfe0b0",
                    background: "#fff",
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      </aside>

        <div className="student-page-col student-page-col--play" role="main">
          <section
            className={`page-card student-game-card${joinedGroup ? " student-game-card--with-ranking" : ""}`}
          >
            <div className="student-play-viewport">
        <div className="game-section-wrap">
          <div className="game-section-main">
            <h3>숲 마을 탐험</h3>
            {!joinedGroup ? (
              <div className="game-preview-shell">
                <div
                  ref={playfieldRef}
                  tabIndex={0}
                  role="application"
                  aria-label="숲 마을 미리보기"
                  className="game-world game-world--preview"
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLDivElement).focus({ preventScroll: true });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void handleJoin();
                  }}
                >
                  {forestScene}
                </div>
                <div className="ac-enter-dock">
                  <button
                    type="button"
                    className="ac-enter-btn"
                    onClick={() => void handleJoin()}
                    disabled={!canAttemptJoin}
                  >
                    <span className="ac-enter-btn__key" aria-hidden>
                      ⏎
                    </span>
                    <span className="ac-enter-btn__label">를 눌러 숲으로 입장</span>
                  </button>
                  <p className="ac-enter-sub">닉네임·반코드·캐릭터를 준비한 뒤 눌러 주세요</p>
                </div>
              </div>
            ) : (
            <div className="party-layout party-layout--solo">
              {partySize >= 2 ? (
                <div className="party-roster" aria-label="모둠 인원">
                  <div className="party-roster-row">
                    <span className="party-roster-label">모둠</span>
                    {displayMembers.map((m) => (
                      <span
                        key={m.userId}
                        className={
                          m.userId === sessionUserId
                            ? "party-roster-chip party-roster-chip--me"
                            : "party-roster-chip"
                        }
                      >
                        {m.userName}
                        {m.userId === sessionUserId ? " · 조작 중" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="party-slot party-slot--me">
                <div className="party-slot-head">
                  <span className="party-slot-badge">나</span>
                  <span className="party-slot-name">
                    {displayMembers.find((m) => m.userId === sessionUserId)?.userName?.trim() ||
                      nickname.trim() ||
                      "나"}
                  </span>
                </div>
                <div className="party-game-scale party-game-scale--solo">
                  <div
                    ref={playfieldRef}
                    tabIndex={0}
                    role="application"
                    aria-label="숲 마을 플레이 영역"
                    className="game-world game-world--solo"
                    onPointerDown={(e) => {
                      (e.currentTarget as HTMLDivElement).focus({ preventScroll: true });
                    }}
                  >
                    {forestScene}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
            </div>
            {joinedGroup ? (
              <motion.aside
                className="live-ranking-panel live-ranking-panel--dock"
                aria-label="실시간 레벨별 랭킹"
                initial={{ opacity: 0.9, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              >
                <div className="live-ranking-head">실시간 랭킹</div>
                <div className="live-ranking-scopes" aria-label="랭킹 범위">
                  <span className="live-ranking-fixed-scope">전원 랭킹 (반 전체)</span>
                </div>
                <p className="live-ranking-sub">{rankingSubLine}</p>
                <div className="live-ranking-tabs" role="tablist" aria-label="게임 레벨">
                  {[1, 2, 3, 4, 5, 6].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      role="tab"
                      aria-selected={rankingTab === lv}
                      className={rankingTab === lv ? "active" : ""}
                      onClick={() => setRankingTab(lv)}
                    >
                      Lv{lv}
                    </button>
                  ))}
                </div>
                {currentQuestion ? (
                  <div className="battle-dialog battle-dialog--in-ranking">
                    <p className="battle-achievement">
                      학습 목표{" "}
                      <strong>
                        {STUDENT_ACHIEVEMENT_LABEL[currentQuestion.achievementStandard] ??
                          "현재 문제의 학습 목표를 확인해요"}
                      </strong>
                      {currentQuestion.questionKind && currentQuestion.questionKind !== "computation"
                        ? ` · ${
                            currentQuestion.questionKind === "estimate"
                              ? "어림"
                              : currentQuestion.questionKind === "principle"
                                ? "원리"
                                : ""
                          }`
                        : null}
                    </p>
                    {currentQuestion.situation ? (
                      <p className="battle-situation">{currentQuestion.situation}</p>
                    ) : null}
                    <p>
                      [{currentQuestion.type === "objective" ? "객관식" : "주관식"}]{" "}
                      {currentQuestion.prompt}
                    </p>
                    {currentQuestion.type === "objective" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(currentQuestion.choices ?? []).map((choice) => (
                          <button key={choice} type="button" onClick={() => handleAnswer(choice)}>
                            {choice}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          value={subjectiveAnswer}
                          onChange={(e) => setSubjectiveAnswer(e.target.value)}
                          placeholder={
                            currentQuestion.level === 6
                              ? "예: 12 ... 3 (몫 ... 나머지)"
                              : "정답 입력"
                          }
                          style={{ padding: "8px 10px", borderRadius: 10 }}
                        />
                        <button type="button" onClick={() => handleAnswer(subjectiveAnswer)}>
                          제출
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                <ol className="live-ranking-list live-ranking-list--dock-wide">
                  {rankingRows.length === 0 ? (
                    <li className="live-ranking-empty">이 레벨에 아직 순위가 없어요.</li>
                  ) : (
                    rankingRows.map((row, idx) => (
                      <li
                        key={row.userId}
                        className={row.userId === sessionUserId ? "is-me" : undefined}
                      >
                        <span className="rank-num">{idx + 1}</span>
                        <span className="rank-name">{row.name}</span>
                        <span className="rank-pct">{row.levelProgress}%</span>
                        <span className="rank-meta" title={row.online ? "접속 중" : "오프라인"}>
                          {row.groupId == null ? "미참가" : `${row.groupId}모둠`}{" "}
                          {row.online ? "●" : "○"}
                        </span>
                      </li>
                    ))
                  )}
                </ol>
                <details className="game-help-details game-help-details--in-ranking">
                  <summary>조작 안내</summary>
                  <NpcBubble speaker="콩돌">
                    캐릭터는 위·아래·좌·우 4방향으로 걷고, 방향키(또는 WASD)로 이동해 몬스터를 만나면
                    전투가 시작돼요! (플레이 영역을 한 번 누른 뒤 이동해 보세요.)
                  </NpcBubble>
                </details>
              </motion.aside>
            ) : null}
        {isCleared ? <p>축하합니다! 만렙 달성으로 게임이 종료되었습니다.</p> : null}
        {battleFeedback && <p style={{ marginTop: 10 }}>{battleFeedback}</p>}
          </section>
        </div>
      </div>

      <div className="toast-stack">
        {toasts.map((toast) => (
          <CuteToast key={toast.id} message={toast.message} tone={toast.tone} />
        ))}
      </div>
    </>
  );
}
