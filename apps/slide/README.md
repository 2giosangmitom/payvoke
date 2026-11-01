# Payvoke pitch deck

Slide pitch Payvoke của Team Firefly (~12 phút, 23 trang, chia 4 phần) viết bằng [open-slide](https://open-slide.dev). Toàn bộ deck nằm trong [slides/payvoke-pitch/index.tsx](./slides/payvoke-pitch/index.tsx), theme sáng Osaka Jade theo [DESIGN.md](../../DESIGN.md), bố cục kỹ thuật, kẻ mảnh, không lưới nền; font Be Vietnam Pro cho tiếng Việt và JetBrains Mono cho nhãn. Thuật ngữ kỹ thuật (Offer, Quote, Escrow, Vault, Run, Risk Check…) giữ tiếng Anh, phần diễn giải dùng tiếng Việt. Lời thoại cho từng trang nằm trong export `notes` và hiện trong presenter view; mỗi note có thời lượng, lời nói, dấu `[→]` cho từng bước hiện, và mục "Nếu bị hỏi" để dự phòng Q&A.

```sh
bun run --cwd apps/slide dev      # http://localhost:5173, F để trình chiếu
bun run --cwd apps/slide build    # SPA tĩnh trong dist/
bun run --cwd apps/slide preview  # xem bản build
```
