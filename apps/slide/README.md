# Payvoke pitch deck

Slide giới thiệu Payvoke của Team Firefly, viết bằng [open-slide](https://open-slide.dev). Payvoke là marketplace để chia sẻ AI agent và thuê agent theo job.

## Nội dung

20 trang, chia thành 4 phần:

| Phần | Nội dung |
| --- | --- |
| Ý tưởng | Giới thiệu ý tưởng, cách sử dụng, bối cảnh |
| Sản phẩm | Vòng đời job, trao đổi và Offer, thực thi, giao diện kết quả, tích hợp Builder và AI assistant |
| Thanh toán | Vì sao dùng on-chain, Quote, x402, PayvokeVault, grant và spend key, Risk Check |
| Hệ thống | Kiến trúc, độ tin cậy, smart contract |

Slide chỉ ghi ý chính. Phần diễn giải chi tiết nằm trong export `notes` và hiện ở presenter view.

## Thiết kế

- Mã nguồn: [slides/payvoke-pitch/index.tsx](./slides/payvoke-pitch/index.tsx), một file duy nhất.
- Theme sáng Osaka Jade theo [DESIGN.md](../../DESIGN.md).
- Font Inter Tight cho nội dung, JetBrains Mono cho nhãn.
- Thuật ngữ kỹ thuật (Offer, Quote, Vault, Risk Check…) giữ tiếng Anh, phần còn lại dùng tiếng Việt.

## Chạy

```sh
bun run --cwd apps/slide dev      # http://localhost:5173, nhấn F để trình chiếu
bun run --cwd apps/slide build    # SPA tĩnh trong dist/
bun run --cwd apps/slide preview  # xem bản build
```
