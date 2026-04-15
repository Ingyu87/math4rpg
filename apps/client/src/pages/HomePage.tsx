import { Link } from "react-router-dom";

export default function HomePage() {
  return (
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

      <div className="home-actions">
        <Link to="/student" className="home-start-btn">
          <span className="home-start-btn__key" aria-hidden>
            ▶
          </span>
          <span className="home-start-btn__label">게임 시작하기</span>
        </Link>
        <Link to="/admin" className="home-admin-btn">
          관리자 화면
        </Link>
      </div>
    </section>
  );
}
