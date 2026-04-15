import { useEffect, useState, type PropsWithChildren } from "react";
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
  const { pathname } = useLocation();
  const studentLayout = pathname === "/student";
  const [userMode, setUserMode] = useState<string>(() => localStorage.getItem("math4rpg_user_mode") ?? "");

  useEffect(() => {
    setUserMode(localStorage.getItem("math4rpg_user_mode") ?? "");
  }, [pathname]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "math4rpg_user_mode") {
        setUserMode(event.newValue ?? "");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className={`app-shell${studentLayout ? " app-shell--student" : ""}`}>
      <header className="app-header">
        <div>
          <h1 className="app-title">곱셈 나눗셈 수학 RPG</h1>
          <p className="app-subtitle">곱셈나눗셈 RPG로 즐기는 수학 모험</p>
        </div>
        <nav className="nav-links">
          <NavItem to="/" label="홈" />
          {userMode !== "student" ? <NavItem to="/admin" label="관리자 화면" /> : null}
        </nav>
      </header>
      <div className={studentLayout ? "app-shell-body" : "app-shell-body app-shell-body--default"}>
        {children}
      </div>
      <footer className="app-site-footer">
        <a
          className="app-site-footer__link"
          href="https://aiworld-ig.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          © 2026 ingyu's AI world. All rights reserved.
        </a>
      </footer>
    </div>
  );
}
