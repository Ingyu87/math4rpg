import { useEffect, useMemo, useState } from "react";
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
  isValidClassCode,
  subscribeLevelRankingsByClassCode,
  type LevelRankingEntry,
} from "../services/classCode";
import {
  getLessonByLevel,
  normalizeAnswer,
  pickRandomQuestion,
} from "../services/battleQuestions";

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

const ITEM_POOL = [
  "별 목걸이",
  "하트 배지",
  "리본 모자",
  "반짝 망토",
  "무지개 안경",
  "토끼 귀 장식",
];

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

function randomMonsterPosition(playerPos?: { x: number; y: number }) {
  for (let i = 0; i < 50; i += 1) {
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
      playerPos &&
      Math.hypot(candidate.x - playerPos.x, candidate.y - playerPos.y) < 88;
    if (!intersectsAnyObstacle(hitbox) && !tooCloseToPlayer) {
      return candidate;
    }
  }
  return { x: WORLD_WIDTH - 52, y: WORLD_HEIGHT - 52 };
}

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

  const [playerPos, setPlayerPos] = useState({ x: 90, y: 120 });
  const [playerFacing, setPlayerFacing] = useState<Facing>("down");
  const [walkFrame, setWalkFrame] = useState(0);
  const [monsterPos, setMonsterPos] = useState(randomMonsterPosition());
  const [monsterFrame, setMonsterFrame] = useState(0);
  const [levelRankings, setLevelRankings] = useState<Record<number, LevelRankingEntry[]>>({
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  });
  const [rankingTab, setRankingTab] = useState(1);
  const [groupMembers, setGroupMembers] = useState<GroupMemberSummary[]>([]);

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

  const pushToast = (message: string, tone: "success" | "info" | "warning" = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2500);
  };

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
      setLevelRankings({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });
      return;
    }
    return subscribeLevelRankingsByClassCode(classCode.trim(), setLevelRankings);
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
    return () => {
      if (joinedGroup) {
        void leaveGroup(joinedGroup, sessionUserId, nickname || "학생");
      }
    };
  }, [joinedGroup, sessionUserId, nickname]);

  useEffect(() => {
    if (!joinedGroup || currentQuestion || isCleared) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const step = 12;
      let dx = 0;
      let dy = 0;
      let nextFacing: Facing = playerFacing;
      const key = event.key.toLowerCase();
      if (key === "arrowup" || key === "w") {
        dy = -step;
        nextFacing = "up";
      }
      if (key === "arrowdown" || key === "s") {
        dy = step;
        nextFacing = "down";
      }
      if (key === "arrowleft" || key === "a") {
        dx = -step;
        nextFacing = "left";
      }
      if (key === "arrowright" || key === "d") {
        dx = step;
        nextFacing = "right";
      }
      if (dx === 0 && dy === 0) return;
      event.preventDefault();
      setPlayerFacing(nextFacing);
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
        setWalkFrame((frame) => (frame + 1) % 3);
        return { x, y };
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [joinedGroup, currentQuestion, isCleared]);

  useEffect(() => {
    if (!joinedGroup || currentQuestion || isCleared) return;
    const timer = window.setInterval(() => {
      setMonsterFrame((frame) => (frame + 1) % 3);
    }, 220);
    return () => window.clearInterval(timer);
  }, [joinedGroup, currentQuestion, isCleared]);

  useEffect(() => {
    if (!joinedGroup || currentQuestion || isCleared) return;
    const dx = playerPos.x - monsterPos.x;
    const dy = playerPos.y - monsterPos.y;
    const collided = Math.sqrt(dx * dx + dy * dy) < 28;
    if (collided) {
      const question = pickRandomQuestion(playerLevel);
      setCurrentQuestion(question);
      setBattleFeedback("");
      setSubjectiveAnswer("");
      pushToast("몬스터를 만났어요! 문제에 도전하세요.", "info");
    }
  }, [joinedGroup, playerPos, monsterPos, currentQuestion, playerLevel, isCleared]);

  const handleJoin = async () => {
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
      setMonsterPos(randomMonsterPosition(playerPos));
      setMessage(`${selectedGroup}모둠 입장 완료`);
      pushToast(`${selectedGroup}모둠에 입장했어요!`, "success");
    } catch (error) {
      const text = error instanceof Error ? error.message : "입장 실패";
      setMessage(text);
      pushToast(text, "warning");
    }
  };

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
      const newItem = randomItem();
      setEarnedItems((prev) => [...prev, newItem]);
      const nextTier = Math.min(6, Math.floor(nextTotalCorrect / 5) + 1);
      setAppearanceTier(nextTier);
      setBattleFeedback(
        `정답! 몬스터 처치 성공 (+${newItem}) / ${currentQuestion.explanation}`,
      );
      pushToast(`정답! ${newItem} 획득`, "success");
      setMonsterPos(randomMonsterPosition(playerPos));
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
      setBattleFeedback(`오답! 데미지 -20 / 정답: ${currentQuestion.answer}`);
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
  const isPartySplit = Boolean(joinedGroup && partySize >= 2);

  const forestScene = (
    <>
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
      {selectedCharacter && (
        <div
          className="player-sprite"
          style={{ left: `${playerPos.x}px`, top: `${playerPos.y}px` }}
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
        </div>
      )}
      <div
        className="monster-sprite"
        style={{ left: `${monsterPos.x}px`, top: `${monsterPos.y}px` }}
      >
        <div
          className="sprite-body sprite-monster"
          style={{
            backgroundImage: "url('/sprites/slime_walk_strip.svg')",
            backgroundPositionX: `${-monsterFrame * ENTITY_SIZE}px`,
          }}
        />
      </div>
    </>
  );

  return (
    <>
      <section className="page-card">
        <h2>캐릭터 선택</h2>
        <div className="character-select-grid">
          {CHARACTER_OPTIONS.map((character) => (
            <button
              key={character.id}
              type="button"
              className={`character-card ${selectedCharacterId === character.id ? "selected" : ""}`}
              onClick={() => setSelectedCharacterId(character.id)}
            >
              <div
                className="character-portrait"
                style={{
                  backgroundImage: `url(${character.sprite})`,
                  backgroundPosition: `0px ${-FACING_ROW.down * ENTITY_SIZE}px`,
                }}
              />
              <div>{character.name}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="page-card">
        <h2>숲 마을 입장 준비</h2>
        <p>현재 캐릭터: {selectedCharacter ? selectedCharacter.name : "미선택"}</p>
        <p>모둠: {joinedGroup ? `${joinedGroup}모둠` : "미참가"}</p>
        <p>레벨: {playerLevel} (차시 {lesson})</p>
        <p>
          성취수준:
          <span className="badge" style={{ backgroundColor: ACHIEVEMENT_COLORS[achievement] }}>
            {achievement}
          </span>
        </p>
        <p>HP: {hp}</p>
        <p>오답 누적: {wrongStreak}/3</p>
        <p>레벨 성취율: {progressPercent}% ({levelCorrectCount}/15)</p>
        <p>최근 정답률: {recentAccuracy}%</p>
        <p>캐릭터 외형 단계: {appearanceTier}단계</p>
        <p>보유 아이템: {earnedItems.length === 0 ? "없음" : earnedItems.join(", ")}</p>
        <hr style={{ border: "1px solid #efe7ff", margin: "14px 0" }} />
        <h3>모둠 입장 (RTDB)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="학생 닉네임"
            style={{ padding: "8px 10px", borderRadius: 10, minWidth: 180 }}
            disabled={Boolean(joinedGroup)}
          />
          <input
            value={classCode}
            onChange={(e) => setClassCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder="반코드 5자리"
            style={{ padding: "8px 10px", borderRadius: 10, width: 140 }}
            disabled={Boolean(joinedGroup)}
          />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(Number(e.target.value) as GroupId)}
            style={{ padding: "8px 10px", borderRadius: 10 }}
            disabled={Boolean(joinedGroup)}
          >
            <option value={1}>1모둠 ({counts[1]}/5)</option>
            <option value={2}>2모둠 ({counts[2]}/5)</option>
            <option value={3}>3모둠 ({counts[3]}/5)</option>
            <option value={4}>4모둠 ({counts[4]}/5)</option>
            <option value={5}>5모둠 ({counts[5]}/5)</option>
          </select>
          <button type="button" onClick={handleJoin} disabled={Boolean(joinedGroup)}>
            입장
          </button>
          <button type="button" onClick={handleLeave} disabled={!joinedGroup}>
            퇴장
          </button>
          <strong>현재 상태: {joinedGroup ? `${joinedGroup}모둠 참가중` : "미참가"}</strong>
        </div>
        {message && <p style={{ marginTop: 8 }}>{message}</p>}
      </section>

      <section className="page-card">
        <div className="game-section-wrap">
          {joinedGroup ? (
            <aside className="live-ranking-panel" aria-label="실시간 레벨별 랭킹">
              <div className="live-ranking-head">실시간 랭킹</div>
              <p className="live-ranking-sub">
                같은 반 · 게임 레벨 {rankingTab} (차시 {getLessonByLevel(rankingTab)})
              </p>
              <div className="live-ranking-tabs" role="tablist">
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
              <ol className="live-ranking-list">
                {(levelRankings[rankingTab] ?? []).length === 0 ? (
                  <li className="live-ranking-empty">이 레벨에 아직 순위가 없어요.</li>
                ) : (
                  (levelRankings[rankingTab] ?? []).map((row, idx) => (
                    <li
                      key={row.userId}
                      className={row.userId === sessionUserId ? "is-me" : undefined}
                    >
                      <span className="rank-num">{idx + 1}</span>
                      <span className="rank-name">{row.name}</span>
                      <span className="rank-pct">{row.levelProgress}%</span>
                      <span className="rank-meta" title={row.online ? "접속 중" : "오프라인"}>
                        {row.groupId}모둠 {row.online ? "●" : "○"}
                      </span>
                    </li>
                  ))
                )}
              </ol>
            </aside>
          ) : null}
          <h3>숲 마을 탐험</h3>
          <NpcBubble speaker="콩돌">
            캐릭터는 위·아래·좌·우 4방향으로 걷고, 모둠은 최대 5칸까지 화면을 나눠 보여요. 혼자면 숲이 크게 펼쳐지고, 친구가 들어올 때마다 시트가 늘어나요. 방향키(또는 WASD)로 이동해 몬스터를 만나면 전투가 시작돼요!
          </NpcBubble>
          {!joinedGroup ? (
            <div className="game-world game-world--preview">{forestScene}</div>
          ) : (
            <div
              className={`party-layout ${
                isPartySplit
                  ? `party-layout--split party-layout--n${Math.min(partySize, 5)}`
                  : "party-layout--solo"
              }`}
            >
              {displayMembers.map((m) => (
                <div
                  key={m.userId}
                  className={`party-slot ${m.userId === sessionUserId ? "party-slot--me" : ""}`}
                >
                  <div className="party-slot-head">
                    <span className="party-slot-badge">{m.userId === sessionUserId ? "나" : "친구"}</span>
                    <span className="party-slot-name">{m.userName}</span>
                  </div>
                  {m.userId === sessionUserId ? (
                    <div
                      className={
                        isPartySplit ? "party-game-scale" : "party-game-scale party-game-scale--solo"
                      }
                    >
                      <div
                        className={`game-world ${isPartySplit ? "game-world--party-slot" : "game-world--solo"}`}
                      >
                        {forestScene}
                      </div>
                    </div>
                  ) : (
                    <div className="party-peer-placeholder">
                      <span className="party-peer-leaf" aria-hidden>
                        🌿
                      </span>
                      <p className="party-peer-title">{m.userName}</p>
                      <p className="party-peer-note">같은 모둠 · 이 기기에서는 내 숲만 조작해요</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {currentQuestion && (
          <div className="battle-dialog">
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
                  placeholder="정답 입력"
                  style={{ padding: "8px 10px", borderRadius: 10 }}
                />
                <button type="button" onClick={() => handleAnswer(subjectiveAnswer)}>
                  제출
                </button>
              </div>
            )}
          </div>
        )}
        {isCleared ? <p>축하합니다! 만렙 달성으로 게임이 종료되었습니다.</p> : null}
        {battleFeedback && <p style={{ marginTop: 10 }}>{battleFeedback}</p>}
      </section>

      <section className="page-card">
        <h3>활동 요약 리포트</h3>
        <p>총 활동 시간: {formatDuration(elapsedSec)}</p>
        <p>
          전체 시도: {totalAttempts} / 전체 정답: {totalCorrect} / 전체 정답률:{" "}
          {recentAccuracy}%
        </p>
        <table className="student-table">
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

      {isCleared && (
        <section className="page-card">
          <h3>만렙 종료 리포트</h3>
          <p>
            최종 레벨: <strong>6 (확장)</strong>
          </p>
          <p>
            총 풀이 {totalAttempts}문항 / 정답 {totalCorrect}문항 / 오답 {totalWrong}문항
          </p>
          <p>총 플레이 시간: {formatDuration(elapsedSec)}</p>
          <p>최종 캐릭터 외형 단계: {appearanceTier}단계</p>
          <p>획득 아이템/장신구: {earnedItems.length === 0 ? "없음" : earnedItems.join(", ")}</p>
        </section>
      )}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <CuteToast key={toast.id} message={toast.message} tone={toast.tone} />
        ))}
      </div>
    </>
  );
}
