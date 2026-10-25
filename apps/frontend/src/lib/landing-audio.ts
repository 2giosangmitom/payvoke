// One shared player for the landing. The music card drives it; the hero field
// reads it every frame. Two sources feed the picture:
//
//  1. A timeline analysed ahead of time (scripts/analyse-track.mjs) — sixteen
//     bands at 15 fps plus the beats. It starts moving the moment the page is
//     open, because browsers will not let a page listen to audio until there
//     has been a gesture. A silent clock walks through it, looping.
//  2. Once the sound is on, the track is heard live through a Web Audio
//     analyser: thirty-two auto-ranged bands and an onset detector, so the
//     field shows exactly what is playing. Turning the sound off goes back to
//     the timeline at the track's position.
//
// The module outlives the music card, so navigation back to the landing
// keeps the field in step with the track.

export const TRACK = {
  title: "A Little Idea",
  artist: "Payvoke Radio",
  src: "/audio/a-litte-idea.opus",
  art: "/audio/a-litte-idea.svg",
} as const;

export type MusicState = "muted" | "loading" | "playing" | "failed";

export type AudioSnapshot = {
  state: MusicState;
  /** The sound is on, or on its way. */
  on: boolean;
  /** The sound has been asked for at least once this visit. */
  started: boolean;
  duration: number;
  error: boolean;
};

type Listener = () => void;

type Timeline = {
  duration: number;
  fps: number;
  bands: number;
  spectrum: string;
  beats: number[][];
};

export const BANDS = 32;
const LOW_HZ = 50;
const HIGH_HZ = 10000;
const FFT_SIZE = 2048;
/** Bands below this one count as the low end, where the beats live. */
const LOW_BANDS = 12;
/** Decibels the picture spans, from silence to the loudest a band gets. */
const DB_FLOOR = -90;
/** How much of the live reading reaches the picture. */
const LIVE_GAIN = 0.9;
/** And how much of the timeline does, while the sound is off. */
const MUTED_GAIN = 0.6;
/** A beat must clear the recent average by this much... */
const BEAT_RATIO = 1.6;
/** ...and be at least this share of the hardest hit of the last seconds. */
const BEAT_FLOOR = 0.3;
/** How much of the hardest hit is kept each frame: about six seconds. */
const PEAK_MEMORY = 0.996;
/** Two beats cannot land closer than this, in ms. */
const BEAT_GAP_MS = 220;
/** Frames of onset history the threshold is judged against. */
const HISTORY = 48;

let snapshot: AudioSnapshot = {
  state: "muted",
  on: false,
  started: false,
  duration: 0,
  error: false,
};
const listeners = new Set<Listener>();

function emit(next: Partial<AudioSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

/** The timeline, fetched once. The hero asks for it on mount. */
let timeline: Timeline | null = null;
let timelineLoading: Promise<Timeline> | null = null;
let frames: Uint8Array | null = null;

/** The silent clock: when position zero was, in performance.now() ms. */
let clockZero: number | null = null;
/** While paused, the position the clock is held at. */
let pausedAt: number | null = null;
/** Where the timeline was last read, for beats between reads. */
let timelineAt = -1;

let element: HTMLAudioElement | null = null;
let attached: { audio: HTMLAudioElement; release: () => void } | null = null;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let routed: HTMLAudioElement | null = null;
let freq = new Float32Array(0);
let bins: Array<[from: number, to: number]> = [];
let touched = false;

// Per-band running floor and peak, so each band swings across its whole range
// whatever the mix, and the onset detector's memory.
const floor = new Float32Array(BANDS);
const peak = new Float32Array(BANDS).fill(0.3);
const rawNow = new Float32Array(BANDS);
const previous = new Float32Array(BANDS);
const history = new Float32Array(HISTORY);
let historyAt = 0;
let fluxPeak = 1;
let lastSampleAt = -1;
let lastBeatAt = -Infinity;
let lastFlux = 0;
let lastFluxMean = 0;
const meterBands = new Float32Array(BANDS);

function loadTimeline(): Promise<Timeline> {
  timelineLoading ??= import("@/src/data/track.json").then((module) => {
    timeline = module.default as unknown as Timeline;
    const raw = atob(timeline.spectrum);
    frames = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) frames[i] = raw.charCodeAt(i);
    emit({ duration: timeline.duration });
    return timeline;
  });
  return timelineLoading;
}

/** Split the live spectrum into logarithmic bands, low to high. */
function layoutBands(sampleRate: number) {
  const binHz = sampleRate / FFT_SIZE;
  const count = FFT_SIZE / 2;
  bins = [];
  for (let b = 0; b < BANDS; b++) {
    const lo = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (b / BANDS);
    const hi = LOW_HZ * (HIGH_HZ / LOW_HZ) ** ((b + 1) / BANDS);
    const from = Math.min(count - 1, Math.max(1, Math.round(lo / binHz)));
    const to = Math.min(count, Math.max(from + 1, Math.round(hi / binHz)));
    bins.push([from, to]);
  }
}

function wire(audio: HTMLAudioElement) {
  if (!context) {
    context = new AudioContext();
    analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    // No smoothing in the analyser: a kick's attack must arrive whole. The
    // picture is smoothed by whoever draws it.
    analyser.smoothingTimeConstant = 0;
    freq = new Float32Array(analyser.frequencyBinCount);
    layoutBands(context.sampleRate);
    analyser.connect(context.destination);
  }
  if (routed !== audio) {
    context.createMediaElementSource(audio).connect(analyser!);
    routed = audio;
  }
}

function setState(state: MusicState) {
  if (snapshot.state === state && snapshot.on === (state === "playing" || state === "loading"))
    return;
  emit({
    state,
    on: state === "playing" || state === "loading",
    error: state === "failed",
  });
}

/** Seconds into the track by the silent clock, looping. */
function clockPosition(now: number) {
  if (pausedAt !== null) return pausedAt;
  if (!timeline) return 0;
  clockZero ??= now;
  // A still frame may ask for time zero after the clock has already started.
  return (Math.max(0, now - clockZero) / 1000) % timeline.duration;
}

/** Where the track is, live or held, in seconds. */
function position(now: number) {
  if (element && !element.paused) return element.currentTime;
  return clockPosition(now);
}

/** Whether the track itself is running, and so can be read live. */
function live() {
  return snapshot.state === "playing" && element !== null && !element.paused && analyser !== null;
}

export type MusicSample = {
  /** The bands, 0..1, low to high. Reused each frame. */
  bands: Float32Array;
  /** A beat that landed this frame, 0..1 by strength, else 0. */
  beat: number;
};

const sample: MusicSample = { bands: new Float32Array(BANDS), beat: 0 };

/** The timeline's bands at a position, spread from sixteen to thirty-two. */
function timelineBands(at: number, out: Float32Array) {
  if (!timeline || !frames) {
    out.fill(0);
    return;
  }
  const n = timeline.bands;
  const total = frames.length / n;
  if (total < 2) {
    out.fill(0);
    return;
  }
  const f = at * timeline.fps;
  const a = Math.floor(f) % total;
  const b = (a + 1) % total;
  const mix = f - Math.floor(f);
  for (let i = 0; i < BANDS; i++) {
    // Each output band sits between two timeline bands.
    const between = ((i + 0.5) / BANDS) * n - 0.5;
    const lo = Math.max(0, Math.min(n - 1, Math.floor(between)));
    const hi = Math.min(n - 1, lo + 1);
    const t = Math.max(0, Math.min(1, between - lo));
    const early = frames[a * n + lo] * (1 - t) + frames[a * n + hi] * t;
    const late = frames[b * n + lo] * (1 - t) + frames[b * n + hi] * t;
    out[i] = ((early * (1 - mix) + late * mix) / 255) * MUTED_GAIN;
  }
}

/** The strongest timeline beat in (from, to], or 0. Handles the loop. */
function timelineBeat(from: number, to: number): number {
  if (!timeline) return 0;
  let best = 0;
  const hit = (lo: number, hi: number) => {
    for (const [at, strength] of timeline!.beats) {
      if (at > hi) break;
      if (at > lo && strength > best) best = strength;
    }
  };
  if (to >= from) hit(from, to);
  else {
    hit(from, timeline.duration);
    hit(-1, to);
  }
  return best;
}

/** A band's level from the analyser's current frame, auto-ranged. */
function liveBand(b: number) {
  const [from, to] = bins[b];
  let power = 0;
  for (let k = from; k < to; k++) if (freq[k] > DB_FLOOR) power += 10 ** (freq[k] / 10);
  const db = power > 0 ? 10 * Math.log10(power / (to - from)) : DB_FLOOR;
  const raw = Math.max(0, Math.min(1, (db - DB_FLOOR) / -DB_FLOOR));
  return { raw, level: (raw - floor[b]) / Math.max(0.15, peak[b] - floor[b]) };
}

export const landingAudio = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,

  /** Start fetching the pre-analysed timeline (the hero calls this on mount). */
  prime() {
    if (typeof window !== "undefined") void loadTimeline();
  },

  attach(audio: HTMLAudioElement) {
    if (attached?.audio === audio) return;
    if (attached) attached.release();
    element = audio;

    const sync = () => {
      void loadTimeline();
      const duration = timeline?.duration ?? (Number.isFinite(audio.duration) ? audio.duration : 0);
      if (duration && duration !== snapshot.duration) emit({ duration });
    };
    const onPlay = () => setState("loading");
    const onPlaying = () => setState("playing");
    const onPause = () => {
      if (snapshot.state === "playing" || snapshot.state === "loading") {
        pausedAt = audio.currentTime;
        clockZero = performance.now() - pausedAt * 1000;
        setState("muted");
      }
    };
    const onError = () => setState("failed");

    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("durationchange", sync);
    // `play` arrives before the sound does; `playing` is the one that means it.
    audio.addEventListener("play", onPlay);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);

    attached = {
      audio,
      release: () => {
        audio.removeEventListener("loadedmetadata", sync);
        audio.removeEventListener("durationchange", sync);
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("error", onError);
      },
    };

    // Metadata may have loaded during hydration, before these listeners existed.
    sync();
    setState(audio.paused ? "muted" : "playing");
  },

  /** A detached media element keeps playing, so the card stops it on unmount. */
  detach(audio: HTMLAudioElement) {
    if (attached?.audio === audio) {
      attached.release();
      attached = null;
    }
    if (!audio.paused) {
      // Hold the silent clock where the sound stopped, not where it would
      // have reached while the page was elsewhere.
      pausedAt = audio.currentTime;
      clockZero = performance.now() - pausedAt * 1000;
      audio.pause();
    }
    if (element === audio) element = null;
    setState("muted");
  },

  async toggle() {
    if (!element) return;
    if (snapshot.state === "playing" || snapshot.state === "loading") {
      element.pause();
      return;
    }
    try {
      wire(element);
      if (context!.state === "suspended") await context!.resume();
      const first = !touched;
      touched = true;
      // The page has been walking the timeline silently; pressing play starts
      // the track from the top (or from where a scrub left it), not part way
      // through because the tab happened to be open for a while.
      const start = first ? (pausedAt ?? 0) : (pausedAt ?? clockPosition(performance.now()));
      try {
        element.currentTime = Math.max(
          0,
          Math.min(start, timeline ? timeline.duration - 0.5 : start),
        );
      } catch {
        // The clip has not told us its duration yet; it starts from zero.
      }
      clockZero = performance.now() - element.currentTime * 1000;
      pausedAt = null;
      setState("loading");
      emit({ started: true });
      await element.play();
    } catch {
      setState("failed");
      emit({ started: true });
    }
  },

  seek(seconds: number) {
    const duration = timeline?.duration ?? element?.duration ?? 0;
    const at = Math.max(0, Math.min(duration ? duration - 0.5 : seconds, seconds));
    if (element) {
      try {
        element.currentTime = at;
      } catch {
        // Metadata has not arrived yet; the clock still holds the position.
      }
    }
    clockZero = performance.now() - at * 1000;
    if (!live() && snapshot.state !== "loading") pausedAt = at;
    timelineAt = at;
    // A hand on the range is intent enough: show the position it picked.
    if (!snapshot.started) emit({ started: true });
  },

  /** Where the track is, in seconds. */
  get time() {
    return position(performance.now());
  },
  get duration() {
    return timeline?.duration ?? 0;
  },
  /** How far through the track, 0..1. */
  get progress() {
    const duration = timeline?.duration ?? 0;
    return duration ? position(performance.now()) / duration : 0;
  },

  /**
   * What the track is doing this frame: heard live when the sound is on, read
   * from the timeline when it is off. `now` is the rAF clock.
   */
  sample(now: number): MusicSample {
    if (!live()) {
      const at = position(now);
      timelineBands(at, sample.bands);
      sample.beat = timelineAt < 0 ? 0 : timelineBeat(timelineAt, at);
      timelineAt = at;
      lastSampleAt = -1;
      return sample;
    }
    timelineAt = -1;

    // Exact decibels per bin, so a loud bass never clips flat.
    analyser!.getFloatFrequencyData(freq);

    // Each band: the loudness of its bins in dB, placed between the quietest
    // and the loudest the band has recently been.
    for (let b = 0; b < BANDS; b++) {
      const { raw } = liveBand(b);
      rawNow[b] = raw;
      peak[b] = Math.max(peak[b] * 0.9993, raw, 0.2);
      floor[b] = Math.min(raw, floor[b] + (peak[b] - floor[b]) * 0.003);
      const span = Math.max(0.15, peak[b] - floor[b]);
      sample.bands[b] = Math.max(0, Math.min(1, (raw - floor[b]) / span)) * LIVE_GAIN;
    }

    // A beat: the low end got louder by more than it has been doing lately.
    let beat = 0;
    const stale = lastSampleAt < 0 || now - lastSampleAt > 200;
    let flux = 0;
    for (let b = 0; b < LOW_BANDS; b++) {
      flux += Math.max(0, rawNow[b] - previous[b]);
      previous[b] = rawNow[b];
    }
    flux /= LOW_BANDS;
    if (stale) {
      history.fill(0);
      flux = 0;
      lastFlux = 0;
    }
    let mean = 0;
    for (let i = 0; i < HISTORY; i++) mean += history[i];
    mean /= HISTORY;
    history[historyAt] = flux;
    historyAt = (historyAt + 1) % HISTORY;
    fluxPeak = Math.max(fluxPeak * PEAK_MEMORY, flux, 0.01);
    if (
      !stale &&
      lastFlux > flux &&
      lastFlux > lastFluxMean * BEAT_RATIO &&
      lastFlux > fluxPeak * BEAT_FLOOR &&
      now - lastBeatAt >= BEAT_GAP_MS
    ) {
      beat = Math.min(1, lastFlux / fluxPeak);
      lastBeatAt = now;
    }
    lastFlux = flux;
    lastFluxMean = mean;
    lastSampleAt = now;
    sample.beat = beat;
    return sample;
  },

  /** Four coarse levels for the card's meter, without disturbing the sampler. */
  meter(out: Float32Array) {
    const per = BANDS / out.length;
    if (!live()) {
      timelineBands(position(performance.now()), meterBands);
      for (let m = 0; m < out.length; m++) {
        let level = 0;
        for (let b = Math.floor(m * per); b < Math.floor((m + 1) * per); b++)
          level = Math.max(level, meterBands[b]);
        out[m] = level;
      }
      return;
    }
    analyser!.getFloatFrequencyData(freq);
    for (let m = 0; m < out.length; m++) {
      let level = 0;
      for (let b = Math.floor(m * per); b < Math.floor((m + 1) * per); b++)
        level = Math.max(level, liveBand(b).level);
      out[m] = Math.max(0, Math.min(1, level)) * LIVE_GAIN;
    }
  },
};
