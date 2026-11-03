import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import lyrics from "../data/lyrics.json";
import { ramp } from "../lib/motion";
import { sans } from "../lib/theme";

// The sung line, small and quiet at the very bottom of the frame.

type Line = { text: string; start: number; end: number };
const LINES = (lyrics as { lines: Line[] }).lines;

export const Lyrics = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const line = LINES.find((l) => t >= l.start - 0.2 && t < l.end + 0.4);
  if (!line) return null;
  const k = Math.min(
    ramp(t, line.start - 0.2, line.start + 0.1),
    1 - ramp(t, line.end + 0.1, line.end + 0.4),
  );
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 18 }}>
      <span
        style={{
          fontFamily: sans,
          fontSize: 26,
          fontWeight: 500,
          color: "#ffffffdd",
          opacity: k,
          textShadow: "0 1px 3px #000, 0 0 14px #000a",
        }}
      >
        {line.text}
      </span>
    </AbsoluteFill>
  );
};
