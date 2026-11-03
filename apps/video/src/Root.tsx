import { Composition } from "remotion";
import { MusicVideo } from "./MusicVideo";
import { DURATION } from "./data/timeline";

// 60 fps: every animation is written in seconds, so the frame rate only
// sets how finely the video samples them.
const FPS = 60;
// The whole song (270.2 s). Keep this computed: dragging the end of the
// timeline in Studio overwrites it with a fixed number and cuts the video.
const FRAMES = Math.ceil(DURATION * FPS);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ALittleIdea"
      component={MusicVideo}
      durationInFrames={FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
