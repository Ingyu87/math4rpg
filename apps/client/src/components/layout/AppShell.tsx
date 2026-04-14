import type { PropsWithChildren } from "react";
import { Link, useLocation } from "react-router-dom";

function NavItem({ to, label }: { to: string; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      style={{ outline: isActive ? "2px solid #6d55a8" : "none" }}
    >
      {label}
    </Link>
  );
}

export default function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">곱셈 나눗셈 수학 RPG</h1>
          <p className="app-subtitle">숲 마을에서 즐기는 곱셈 나눗셈 모험</p>
        </div>
        <nav className="nav-links">
          <NavItem to="/" label="홈" />
          <NavItem to="/admin" label="관리자 화면" />
        </nav>
      </header>
      {children}
    </div>
  );
}
