"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function LandingMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  function updateDuration(audio: HTMLAudioElement) {
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
  }

  async function toggleSound() {
    const audio = audioRef.current;
    if (!audio) return;

    if (soundOn) {
      audio.muted = true;
      audio.pause();
      setSoundOn(false);
      return;
    }

    audio.muted = false;
    try {
      await audio.play();
      setSoundOn(true);
      setPlaybackError(false);
    } catch {
      audio.muted = true;
      setSoundOn(false);
      setPlaybackError(true);
    }
  }

  return (
    <aside className="landing-music" aria-label="Background music">
      <audio
        ref={audioRef}
        src="/audio/a-litte-idea.opus"
        preload="metadata"
        muted
        loop
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => updateDuration(event.currentTarget)}
        onDurationChange={(event) => updateDuration(event.currentTarget)}
        onPause={() => setSoundOn(false)}
      />
      <img
        className="landing-music-art"
        src="/audio/a-litte-idea.svg"
        alt="Geometric spark and connected nodes, the cover for A litte idea"
      />
      <div className="landing-music-info">
        <span className="landing-music-eyebrow">PAYVOKE RADIO / 001</span>
        <strong>A litte idea</strong>
        <div
          className="landing-music-progress"
          role="progressbar"
          aria-label="Music playback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={`${formatTime(currentTime)} of ${duration > 0 ? formatTime(duration) : "unknown duration"}`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="landing-music-meta">
          <span className={soundOn ? "is-on" : ""} aria-live="polite">
            {playbackError ? "UNAVAILABLE" : soundOn ? "PLAYING" : "MUTED"}
          </span>
          <span>
            {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : "--:--"}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="landing-music-toggle"
        onClick={toggleSound}
        aria-label={soundOn ? "Mute A litte idea" : "Unmute and play A litte idea"}
        aria-pressed={soundOn}
        title={soundOn ? "Mute music" : "Unmute music"}
      >
        {soundOn ? (
          <Volume2 size={19} strokeWidth={1.8} />
        ) : (
          <VolumeX size={19} strokeWidth={1.8} />
        )}
      </button>
    </aside>
  );
}
