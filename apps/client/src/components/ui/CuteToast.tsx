interface CuteToastProps {
  message: string;
  tone?: "success" | "info" | "warning";
}

export default function CuteToast({ message, tone = "info" }: CuteToastProps) {
  return (
    <div className={`cute-toast tone-${tone}`}>
      <span className="cute-toast-icon">{tone === "success" ? "⭐" : tone === "warning" ? "⚠️" : "🌿"}</span>
      <span>{message}</span>
    </div>
  );
}
