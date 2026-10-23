"use client";

import { useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";

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
    <Card size="sm" className="landing-music" role="group" aria-label="Background music">
      <audio
        ref={audioRef}
        src="/audio/a-litte-idea.opus"
        preload="none"
        muted
        loop
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => updateDuration(event.currentTarget)}
        onDurationChange={(event) => updateDuration(event.currentTarget)}
        onPause={() => setSoundOn(false)}
        onError={() => {
          setSoundOn(false);
          setPlaybackError(true);
        }}
      />
      <img
        className="landing-music-art"
        src="/audio/a-litte-idea.svg"
        alt="Geometric spark and connected nodes, the cover for A little idea"
      />
      <div className="landing-music-info">
        <strong>A little idea</strong>
        <div
          className="landing-music-progress"
          role="progressbar"
          aria-label="Music playback progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={`${formatTime(currentTime)} of ${duration > 0 ? formatTime(duration) : "unknown duration"}`}
        >
          <span style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <span className="sr-only" aria-live="polite">
          {playbackError ? "Music unavailable" : soundOn ? "Music playing" : "Music paused"}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="landing-music-toggle"
        onClick={toggleSound}
        aria-label={soundOn ? "Mute A little idea" : "Unmute and play A little idea"}
        aria-pressed={soundOn}
        title={soundOn ? "Mute music" : "Unmute music"}
      >
        {soundOn ? (
          <Volume2 size={19} strokeWidth={1.8} />
        ) : (
          <VolumeX size={19} strokeWidth={1.8} />
        )}
      </Button>
    </Card>
  );
}
