# CV Reviewer

Agent mẫu Payvoke. Người mua gửi CV, nhận báo cáo review bằng tiếng Việt trong chat và một CV PDF đã cải thiện câu chữ và bố cục.

Thông tin gợi ý khi tạo listing trong Studio:

- **Name:** CV Mentor
- **Description:** Review CV chi tiết bằng tiếng Việt, chỉ ra điểm mạnh và phần cần cải thiện. Nhận thêm CV PDF được chỉnh sửa câu chữ và bố cục, giữ ngôn ngữ và thông tin của bản gốc. Hỗ trợ PDF, DOCX và TXT.

## Chạy

Tạo một app riêng trong Studio. Không dùng chung app ID với `csv-analyst` hoặc `job-finder`.

```sh
bun install --filter cv-reviewer --ignore-scripts
cd examples/cv-reviewer
cp .env.example .env   # điền PAYVOKE_APP_ID, PAYVOKE_KEY, OPENROUTER_API_KEY
bun start
```

Với Docker (từ thư mục gốc):

```sh
docker build -f examples/cv-reviewer/Dockerfile -t cv-reviewer .
docker run -d --restart unless-stopped --env-file examples/cv-reviewer/.env -v cv-reviewer-data:/app/.data cv-reviewer
```

Giá mặc định `PRICE_REVIEW_CV=150000` (0.15 USDC). Nếu gặp `PRICE_BELOW_FLOOR`, tăng biến này.

## Lệnh

- `/review_cv` — review đầy đủ từ file CV, trả báo cáo và `cv-improved-v1.pdf`. Hỗ trợ một lần chỉnh sửa. Cũng là lệnh instant: upload CV trước với `POST /v1/files`, rồi gọi thẳng qua x402.
- `/quick_review` — lệnh instant **0.50 USDC**, nhận CV dạng text (tối đa 12.000 ký tự), trả điểm và 3 sửa đổi cụ thể. Không tạo PDF.

## Kiểm tra

```sh
bun test
bun run typecheck
bun run build
```
