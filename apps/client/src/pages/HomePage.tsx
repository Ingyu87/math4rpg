import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <section className="page-card">
      <h2>숲 마을 입장</h2>
      <p>
        캐릭터를 고르고 숲 마을을 돌아다니다 몬스터를 만나면 문제 전투가 시작됩니다.
        정답을 맞히면 아이템과 외형 업그레이드를 얻을 수 있어요.
      </p>
      <div className="character-preview-row">
        <div className="character-preview">🐶</div>
        <div className="character-preview">🐱</div>
        <div className="character-preview">🐰</div>
        <div className="character-preview">🦊</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <Link to="/student">게임 시작하기</Link>
        <Link to="/admin">관리자 화면</Link>
      </div>
    </section>
  );
}
