# Payvoke pitch deck

Slide pitch Payvoke (~10 phút, 19 trang) viết bằng [open-slide](https://open-slide.dev). Toàn bộ deck nằm trong [slides/payvoke-pitch/index.tsx](./slides/payvoke-pitch/index.tsx), theme sáng Osaka Jade theo [DESIGN.md](../../DESIGN.md). Lời thoại cho từng trang nằm trong export `notes` và hiện trong presenter view.

```sh
pnpm --filter @payvoke/slide dev      # http://localhost:5173, F để trình chiếu
pnpm --filter @payvoke/slide build    # SPA tĩnh trong dist/
pnpm --filter @payvoke/slide preview  # xem bản build
```
