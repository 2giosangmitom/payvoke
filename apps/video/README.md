# A Little Idea — music video

Remotion + React Three Fiber music video for the Payvoke song in
`apps/frontend/public/audio/a-litte-idea.opus` (this project serves the
frontend's `public/` folder, so the song lives in one place).

```sh
bun run dev      # Remotion Studio
bun run render   # out/a-little-idea.mp4
```

## How it fits together

A little 3D story (React Three Fiber inside Remotion) set in one small
Huế, ringed by green hills so no shot ever shows a horizon
(`src/three/hue.tsx`): his street of tube houses with shop signs,
balconies and tangled power lines, the riverside square, the Perfume River
with the Trường Tiền bridge and dragon boats, the Citadel with the flag
tower and the Noon Gate, and Thiên Mụ pagoda. The map follows the real city (`src/three/hue-map.ts`): Lê Lợi along the river with Quốc Học and Hai Bà Trưng side by side, Đống Đa with Cao Thắng and Nguyễn Chí Diễu facing ĐH Khoa học, Nguyễn Trường Tộ on Hùng Vương, Nguyễn Huệ inside the Citadel, Chu Văn An and Nguyễn Tri Phương together further east; the schools and boulevards are in `src/three/hue-schools.tsx`. 3D Avalanche coins hang over the river, the bridge, the stage and the vault (`src/three/avalanche.tsx`). Everyone who takes part has a name tag (`name` on `Person`), starting with Võ Quang Chiến. The town is busy
(`src/three/hue-life.tsx`): motorbikes, a cyclo, vendors with shoulder
poles and cone hats, sidewalk cafés, chess on the square. His room is on
the first floor of a yellow two-storey house. The real Payvoke UI only ever
appears on screens in that world (his laptop, Grandma's laptop, an office
monitor over the square, a billboard by the river, the vault display):
`src/three/projector.tsx` maps the React UI onto each screen with a CSS
homography. The console home with its earnings charts is
`src/story/console-ui.tsx`.

- `src/MusicVideo.tsx` — the timeline: every scene starts on a lyric time.
- `src/story/` — the scenes: `Intro` (Huế montage with what Payvoke is → his window),
  `Bedroom` (verse 1), `StreetChorus` (chorus 1 on his street, 2 on the
  riverside square), `DanceParty` (both drops), `Desks` (the people at their screens),
  `Errands` (the robot assistant, neighbours), `Finale` (the vault in
  the Noon Gate, rooftops, bedtime).
- `src/three/` — people (`person.tsx`, posable with expressive faces),
  choreography on the song's 104 BPM grid (`dance.ts`), props, camera keys.
- `src/lib/audio.ts` — beats, bands and the beat grid.

## When the song changes

```sh
# 1. Landing analysis (bands + beats)
node apps/frontend/scripts/analyse-track.mjs apps/frontend/public/audio/a-litte-idea.opus   # from apps/frontend
# 2. Word timestamps (GPU if available) and alignment to src/data/lyrics.txt
uv run --with faster-whisper --with nvidia-cublas-cu12 --with nvidia-cudnn-cu12 \
  python scripts/transcribe.py ../frontend/public/audio/a-litte-idea.opus scripts/words.json
node scripts/align-lyrics.mjs scripts/words.json
```

Rendering uses the GPU through ANGLE/EGL (`angle-egl`), about 6× faster than software. On a machine without a GPU, add `--gl=swangle`. The composition is 1080p60; render it with:

```sh
bunx remotion render ALittleIdea out/a-little-idea.mp4 --codec=h264 --crf=18 \
  --pixel-format=yuv420p --audio-codec=aac --audio-bitrate=320k --concurrency=6
```
