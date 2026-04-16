import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function HomePage() {
  const navigate = useNavigate();
  const [classCode, setClassCode] = useState<string>(localStorage.getItem("math4rpg_class_code") ?? "");
  const [errorMessage, setErrorMessage] = useState("");

  const handleStartGame = () => {
    const code = classCode.trim();
    if (!/^\d{5}$/.test(code)) {
      setErrorMessage("반코드는 숫자 5자리로 입력해 주세요.");
      return;
    }
    localStorage.setItem("math4rpg_class_code", code);
    localStorage.setItem("math4rpg_user_mode", "student");
    navigate("/student");
  };

  return (
    <div className="home-entry-shell">
      <section className="page-card home-entry-card">
        <div className="home-ac-title" aria-hidden>
          <span className="home-ac-title__tile home-ac-title__tile--pink">숲</span>
          <span className="home-ac-title__tile home-ac-title__tile--blue">마</span>
          <span className="home-ac-title__tile home-ac-title__tile--mint">을</span>
        </div>
        <p className="home-entry-tagline">곱셈·나눗셈과 함께하는 모험</p>

        <p className="home-entry-lead">
          캐릭터를 고르고 숲을 돌아다니다 몬스터를 만나면 문제 전투가 시작돼요. 정답을 맞히면 아이템 창고에
          전리품이 쌓여요.
        </p>

        <div className="home-char-strip" aria-hidden>
          <span className="home-char-tile home-char-tile--a">🐶</span>
          <span className="home-char-tile home-char-tile--b">🐱</span>
          <span className="home-char-tile home-char-tile--c">🐰</span>
          <span className="home-char-tile home-char-tile--d">🦊</span>
        </div>

        <label className="home-code-field">
          <span className="home-code-field__label">반코드 입력</span>
          <input
            className="home-code-input"
            value={classCode}
            onChange={(e) => {
              setClassCode(e.target.value.replace(/\D/g, "").slice(0, 5));
              setErrorMessage("");
            }}
            placeholder="숫자 5자리"
            inputMode="numeric"
          />
        </label>
        {errorMessage ? <p className="home-code-error">{errorMessage}</p> : null}

        <div className="home-actions">
          <button type="button" className="home-start-btn" onClick={handleStartGame}>
            <span className="home-start-btn__key" aria-hidden>
              ▶
            </span>
            <span className="home-start-btn__label">게임 시작하기</span>
          </button>
          <Link to="/admin" className="home-admin-btn">
            관리자 화면
          </Link>
        </div>
      </section>
    </div>
  );
}
