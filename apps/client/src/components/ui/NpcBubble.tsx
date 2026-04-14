import type { PropsWithChildren } from "react";

interface NpcBubbleProps extends PropsWithChildren {
  speaker?: string;
}

export default function NpcBubble({ speaker = "숲 안내원", children }: NpcBubbleProps) {
  return (
    <div className="npc-bubble">
      <div className="npc-name">{speaker}</div>
      <div>{children}</div>
    </div>
  );
}
