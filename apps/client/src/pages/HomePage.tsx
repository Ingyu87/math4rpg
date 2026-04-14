import { Link } from "react-router-dom";

export default function HomePage() {
  return (
    <section className="page-card">
      <h2>숲 마을 입장</h2>
      <p>
        귀여운 동물 친구들과 함께 모험하며 곱셈과 나눗셈 문제를 풀어보세요.
        학생 화면에서는 모둠 입장과 전투를, 관리자 화면에서는 반 활동 관제를
        확인할 수 있습니다.
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <Link to="/student">학생 화면 보기</Link>
        <Link to="/admin">관리자 화면 보기</Link>
      </div>
    </section>
  );
}
