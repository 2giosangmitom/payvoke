import { useEffect, useState, type ComponentType } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import {
  AssistantScene,
  BuilderScene,
  Caption,
  EndScene,
  RiskScene,
  SettleScene,
  ThreadScene,
  X402Scene,
} from "@/src/remotion/launch/scenes";
import { IntroScene } from "@/src/remotion/launch/intro";
import { Region, clamp, glide } from "@/src/remotion/launch/stage";
import { DURATION, FPS, beats, scenes, type SceneId } from "@/src/remotion/launch/timeline";
import "./launch.css";

// The hackathon launch video: Payvoke's core flow in short narrated beats.
// Each beat puts one line of caption on the left and, on the right, the
// part of a real Payvoke page it is about (copies in screens/). Beats and
// their lengths come from script.json and timeline.ts.

const views: Record<SceneId, ComponentType> = {
  title: IntroScene,
  thread: ThreadScene,
  settle: SettleScene,
  assistant: AssistantScene,
  risk: RiskScene,
  x402: X402Scene,
  builder: BuilderScene,
  end: EndScene,
};
const cards: SceneId[] = ["title", "end"];

const IN = 16;
const OUT = 12;

/** Each scene fades up from the dark and back into it. */
function Fade({ length, children }: { length: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, IN], [0, 1], { ...clamp, easing: glide });
  const leave = interpolate(frame, [length - OUT, length], [0, 1], clamp);
  return <AbsoluteFill style={{ opacity: enter * (1 - leave), scale: 0.985 + 0.015 * enter }}>{children}</AbsoluteFill>;
}

// Music sits under the voice: up between lines, down while she speaks.
const speech = beats.map((beat) => [beat.start * FPS, (beat.start + beat.seconds) * FPS] as const);
function musicVolume(frame: number) {
  const talking = speech.some(([from, to]) => frame >= from - 6 && frame <= to + 6);
  const near = speech.reduce((best, [from, to]) => {
    const d = frame < from ? from - frame : frame > to ? frame - to : 0;
    return Math.min(best, d);
  }, Infinity);
  const duck = talking ? 1 : interpolate(near, [6, 20], [1, 0], clamp);
  const level = 0.3 - 0.2 * duck;
  const fade = interpolate(frame, [0, 20, DURATION - 60, DURATION], [0, 1, 1, 0], clamp);
  return level * fade;
}

function useFonts() {
  const [handle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    Promise.all([
      document.fonts.load('600 32px "Be Vietnam Pro"'),
      document.fonts.load('700 32px "Be Vietnam Pro"'),
      document.fonts.load('500 16px "Geist"'),
      document.fonts.load('400 16px "JetBrains Mono"'),
    ])
      .catch(() => {})
      .finally(() => continueRender(handle));
  }, [handle]);
}

export function LaunchVideo() {
  useFonts();
  return (
    <div data-mode="light" data-launch className="contents">
      <AbsoluteFill className="bg-background font-sans text-foreground antialiased">
        {scenes.map((scene) => {
          const View = views[scene.id];
          const from = Math.round(scene.start * FPS);
          const length = Math.round(scene.end * FPS) - from;
          const view = (
            <Fade length={length}>
              <View />
            </Fade>
          );
          return (
            <Sequence key={scene.id} from={from} durationInFrames={length} name={scene.id}>
              {cards.includes(scene.id) ? view : <Region>{view}</Region>}
            </Sequence>
          );
        })}
        {beats
          .filter((beat) => !cards.includes(beat.scene))
          .map((beat, i, list) => {
            const from = Math.round((beat.start - 0.25) * FPS);
            const until = Math.round((list[i + 1]?.start ?? beat.end) * FPS) - 6;
            const end = Math.min(until, Math.round(beat.end * FPS));
            return <CaptionAt key={beat.id} id={beat.id} from={from} until={end} />;
          })}
        {beats.map((beat) => (
          <Sequence key={beat.id} from={Math.round(beat.start * FPS)} name={`vo ${beat.id}`} layout="none">
            <Audio src={staticFile(`launch/vo/${beat.id}.wav`)} />
          </Sequence>
        ))}
        <Audio src={staticFile("launch/music.wav")} volume={musicVolume} />
      </AbsoluteFill>
    </div>
  );
}

function CaptionAt({ id, from, until }: { id: string; from: number; until: number }) {
  const frame = useCurrentFrame();
  if (frame < from || frame > until) return null;
  return <Caption id={id} from={from} until={until} />;
}

export { DURATION, FPS };
