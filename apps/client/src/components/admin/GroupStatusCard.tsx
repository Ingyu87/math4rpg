import type { GroupStatus } from "../../types/game";

export default function GroupStatusCard({ group }: { group: GroupStatus }) {
  return (
    <article className="group-card">
      <strong>{group.groupId}모둠</strong>
      <p>접속: {group.onlineCount}명</p>
      <p>평균 레벨: {group.avgLevel || "-"}</p>
      <p>평균 정답률: {group.avgAccuracy || 0}%</p>
    </article>
  );
}
