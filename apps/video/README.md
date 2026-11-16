# A Little Idea — music video

Remotion + React Three Fiber music video for the Payvoke song (`apps/frontend/public/audio/a-litte-idea.opus`).

```sh
bun run dev      # Remotion Studio
bun run render   # out/a-little-idea.mp4
```

Render uses GPU through ANGLE/EGL (~6× faster than software). On a machine without a GPU, add `--gl=swangle`.

```sh
bunx remotion render ALittleIdea out/a-little-idea.mp4 --codec=h264 --crf=18 \
  --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k --concurrency=6
```

## When the song changes

```sh
# Beat analysis
node apps/frontend/scripts/analyse-track.mjs apps/frontend/public/audio/a-litte-idea.opus

# Word timestamps and lyric alignment
uv run --with faster-whisper python scripts/transcribe.py \
  ../frontend/public/audio/a-litte-idea.opus scripts/words.json
node scripts/align-lyrics.mjs scripts/words.json
```
