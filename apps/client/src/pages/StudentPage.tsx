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
  syncStudentBattleState,
} from "../services/groupSession";
import { classCodeExists, isValidClassCode } from "../services/classCode";
import {
  getLessonByLevel,
  normalizeAnswer,
  pickRandomQuestion,
} from "../services/battleQuestions";

type LevelStats = {
  correct: number;
  wrong: number;
};

const ITEM_POOL = [
  "별 목걸이",
  "하트 배지",
  "리본 모자",
  "반짝 망토",
  "무지개 안경",
  "토끼 귀 장식",
];

const CHARACTER_OPTIONS = [
  { id: "dog", name: "멍멍이", emoji: "🐶" },
  { id: "cat", name: "고양이", emoji: "🐱" },
  { id: "rabbit", name: "토끼", emoji: "🐰" },
  { id: "fox", name: "여우", emoji: "🦊" },
];

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function randomItem() {
  return ITEM_POOL[Math.floor(Math.random() * ITEM_POOL.length)];
}

function randomMonsterPosition() {
  return {
    x: 60 + Math.floor(Math.random() * 520),
    y: 70 + Math.floor(Math.random() * 220),
  };
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

  const [playerPos, setPlayerPos] = useState({ x: 80, y: 120 });
  const [monsterPos, setMonsterPos] = useState(randomMonsterPosition());

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
      const step = 16;
      setPlayerPos((prev) => {
        let x = prev.x;
        let y = prev.y;
        if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") y -= step;
        if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") y += step;
        if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") x -= step;
        if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") x += step;
        return {
          x: Math.max(20, Math.min(600, x)),
          y: Math.max(20, Math.min(300, y)),
        };
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [joinedGroup, currentQuestion, isCleared]);

  useEffect(() => {
    if (!joinedGroup || currentQuestion || isCleared) return;
    const dx = playerPos.x - monsterPos.x;
    const dy = playerPos.y - monsterPos.y;
    const collided = Math.sqrt(dx * dx + dy * dy) < 34;
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
      setMonsterPos(randomMonsterPosition());
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
      setMonsterPos(randomMonsterPosition());
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
              <div className="character-emoji">{character.emoji}</div>
              <div>{character.name}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="page-card">
        <h2>숲 마을 입장 준비</h2>
        <p>현재 캐릭터: {selectedCharacter ? `${selectedCharacter.emoji} ${selectedCharacter.name}` : "미선택"}</p>
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
        <h3>숲 마을 탐험</h3>
        <NpcBubble speaker="콩돌">
          방향키(또는 WASD)로 이동해서 몬스터를 만나면 문제 전투가 시작돼요!
        </NpcBubble>
        <div className="game-world">
          <div className="game-grass" />
          {selectedCharacter && (
            <div
              className="player-sprite"
              style={{ left: `${playerPos.x}px`, top: `${playerPos.y}px` }}
            >
              {selectedCharacter.emoji}
            </div>
          )}
          <div
            className="monster-sprite"
            style={{ left: `${monsterPos.x}px`, top: `${monsterPos.y}px` }}
          >
            👾
          </div>
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
