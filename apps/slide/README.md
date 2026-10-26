# Payvoke pitch deck

Slide pitch Payvoke (5–7 phút) viết bằng [Slidev](https://sli.dev). Nội dung nằm trong [slides.md](./slides.md), theme sáng theo [DESIGN.md](../../DESIGN.md) trong [styles/index.css](./styles/index.css).

```sh
pnpm --filter @payvoke/slide dev     # http://localhost:3030, presenter mode ở /presenter
pnpm --filter @payvoke/slide build   # SPA tĩnh trong dist/
pnpm --filter @payvoke/slide export  # PDF, cần playwright-chromium
```
