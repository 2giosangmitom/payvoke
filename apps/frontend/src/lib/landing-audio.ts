// One shared player for the landing: the music card controls it and the hero
// visualizer reads its spectrum. The AnalyserNode is only created after the
// first user-initiated play, because browsers keep AudioContext suspended
// until a gesture.

type Listener = () => void;

export type AudioSnapshot = {
  playing: boolean;
  currentTime: number;
  duration: number;
  error: boolean;
};

let element: HTMLAudioElement | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let routed: HTMLAudioElement | null = null;
let snapshot: AudioSnapshot = { playing: false, currentTime: 0, duration: 0, error: false };
const listeners = new Set<Listener>();

function emit(next: Partial<AudioSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export const landingAudio = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,

  attach(audio: HTMLAudioElement) {
    if (audio === element) return;
    element = audio;
    emit({ playing: false, currentTime: 0, duration: 0, error: false });
    const sync = () =>
      emit({
        currentTime: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      });
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("durationchange", sync);
    audio.addEventListener("seeked", sync);
    audio.addEventListener("play", () => emit({ playing: true, error: false }));
    audio.addEventListener("pause", () => emit({ playing: false }));
    audio.addEventListener("error", () => emit({ playing: false, error: true }));
    // Metadata may have loaded during hydration, before these listeners existed.
    sync();
  },

  /** A detached media element keeps playing, so the player stops it on unmount. */
  detach(audio: HTMLAudioElement) {
    audio.pause();
    if (audio === element) element = null;
  },

  async toggle() {
    if (!element) return;
    if (!element.paused) {
      element.pause();
      return;
    }
    try {
      if (!context) {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.72;
        analyser.connect(context.destination);
      }
      if (routed !== element) {
        context.createMediaElementSource(element).connect(analyser!);
        routed = element;
      }
      if (context.state === "suspended") await context.resume();
      await element.play();
    } catch {
      emit({ playing: false, error: true });
    }
  },

  seek(seconds: number) {
    if (!element || !Number.isFinite(seconds)) return;
    // Loading metadata lets the first seek work before the track has played.
    if (element.preload === "none") element.preload = "metadata";
    element.currentTime = Math.max(0, Math.min(seconds, element.duration || seconds));
    emit({ currentTime: element.currentTime });
  },

  /** Live analyser while the track plays, otherwise null. */
  analyser: () => (snapshot.playing ? analyser : null),
};
