import { useState } from "react";
import { appImageSrc } from "@/src/features/apps/api";
import { cn } from "@/src/lib/utils";

/** An agent's picture, or its initial on a jade tint when it has none. */
export function AgentAvatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = appImageSrc(imageUrl);
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center text-lg justify-center overflow-hidden bg-primary-soft text-primary select-none",
        className,
      )}
    >
      {src && failed !== src ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : (
        <span aria-hidden="true" className="leading-none font-semibold uppercase">
          {name.trim().charAt(0) || "?"}
        </span>
      )}
    </span>
  );
}
