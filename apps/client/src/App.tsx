import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import AppShell from "./components/layout/AppShell";
import AdminPage from "./pages/AdminPage";
import HomePage from "./pages/HomePage";
import StudentPage from "./pages/StudentPage";

function App() {
  return (
    <AppShell>
      <div className="app-routes-root">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </AppShell>
  );
}

export default App;
