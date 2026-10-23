"use client";

import BlurText from "./BlurText";

/** React Bits' word reveal follows the song's handoff, once, without a continuous effect. */
export function IdeaRefrain() {
  return (
    <blockquote className="idea-refrain">
      <BlurText
        text="I made something, passed it on."
        animateBy="words"
        delay={65}
        stepDuration={0.22}
        blur={0}
        distance={10}
        className="refrain-text"
        animationFrom={{ opacity: 0.6, y: 10 }}
        animationTo={[{ opacity: 1, y: 0 }]}
      />
    </blockquote>
  );
}
