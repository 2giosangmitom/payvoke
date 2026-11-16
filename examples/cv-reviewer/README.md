# CV Reviewer

Agent mẫu Payvoke dùng Bun, TypeScript, Mastra và OpenRouter. Người mua gửi CV,
nhận báo cáo review bằng tiếng Việt trong chat và một CV PDF đã cải thiện câu chữ,
bố cục, giữ ngôn ngữ chính của bản gốc (tiếng Việt hoặc tiếng Anh).

Thông tin gợi ý khi tạo listing trong Studio:

- **Name:** CV Mentor
- **Description:** Review CV chi tiết bằng tiếng Việt, chỉ ra điểm mạnh và phần cần cải thiện. Nhận thêm CV PDF được chỉnh sửa câu chữ và bố cục, giữ ngôn ngữ và thông tin của bản gốc. Hỗ trợ PDF, DOCX và TXT.

## Chạy agent

Tạo **một app riêng** trong Payvoke Studio và lấy app ID, API key của app đó.
Agent đăng ký toàn bộ command bằng `overwriteCommands`, vì vậy không dùng chung
app ID với `csv-analyst` hoặc `job-finder`.

Từ thư mục gốc repository:

```powershell
bun install --filter cv-reviewer --ignore-scripts
cd examples/cv-reviewer
Copy-Item .env.example .env
```

Điền `PAYVOKE_APP_ID`, `PAYVOKE_KEY` và `OPENROUTER_API_KEY` trong `.env`, rồi chạy:

```sh
bun start
```

`PAYVOKE_API_URL` có thể trỏ về deployment local hoặc server riêng. SSE là heartbeat:
agent hiện khả dụng khi kết nối feed đang mở. Không cần mở cổng HTTP cho agent.

Giá mặc định `PRICE_REVIEW_CV=150000`, tương đương **0,15 USDC**. Giá được hiển thị
trong offer và phải đáp ứng giá sàn của deployment; lỗi `PRICE_BELOW_FLOOR` cần tăng
biến này. `MODEL`, `FALLBACK_MODELS` (phân tách bằng dấu phẩy) và `MODEL_RETRIES`
có thể điều chỉnh như các examples khác. Free model có thể bị rate limit; nếu
không tạo được sản phẩm hợp lệ, agent báo thất bại để Payvoke xử lý hoàn tiền.

## Luồng người mua

1. Dùng `/review_cv`, đính kèm một CV trực tiếp, hoặc trò chuyện để mở form tải CV.
2. Có thể thêm `goal` tối đa 500 ký tự, ví dụ: “Làm phần kinh nghiệm ngắn gọn hơn”.
3. Agent tạo offer. Việc đọc CV và review chỉ bắt đầu sau thanh toán, khi nhận `invocation.ready`.
4. Agent hiển thị tiến độ đọc CV, review, tạo PDF và upload. Sau khi hoàn tất, báo cáo xuất hiện trong chat cùng tệp `cv-improved-v1.pdf`.
5. Người mua có một lần yêu cầu chỉnh sửa trên cùng CV. Agent dùng CV gốc và phản hồi để tạo lại báo cáo cùng `cv-improved-v2.pdf`.

Lệnh `/review_cv` gồm `file` bắt buộc và `goal` tùy chọn. Delivery là
300 giây, review window 1.800 giây, evidence `REC`. Agent không tìm việc, nhận JD,
tự ứng tuyển hoặc đảm bảo vượt qua hệ thống ATS.

## Lệnh tức thì `/quick_review` (x402, không cần chat)

`/quick_review` là lệnh **instant** giá cố định **0,50 USDC** (`instantAmount: "500000"`,
`maxAmount` bằng giá này). Tham số:

| Tên       | Kiểu   | Bắt buộc | Mô tả                                            |
| --------- | ------ | -------- | ------------------------------------------------ |
| `cv_text` | STRING | Có       | Nội dung CV dạng văn bản, tối đa 12.000 ký tự    |
| `goal`    | STRING | Không    | Vị trí mục tiêu hoặc trọng tâm, tối đa 500 ký tự |

Người mua (người hoặc agent khác) thuê trực tiếp qua x402, không qua chat hay offer:
`POST /v1/x402/apps/:appId/commands/quick_review` với body `{ "arguments": { "cv_text": "..." } }`
và header `Idempotency-Key`. Lần gọi đầu nhận `402` kèm quote; ký authorization rồi gửi lại
với `PAYMENT-SIGNATURE`. Tiền được giữ trong PayvokeVault và chỉ trả khi giao hàng.

Agent nhận thẳng `invocation.ready` (không có tệp), chấm điểm CV trên thang 100 và đưa ra
đúng 3 sửa đổi cụ thể bằng tiếng Việt (model trả object theo schema Zod, thử lại một lần
nếu sai). Không tạo PDF. Báo cáo được stream vào thread và upload thành
`cv-quick-review.md` để đạt evidence `REC`; lỗi đầu vào, model hoặc upload đều gửi
`failed` và hoàn tiền tự động. Delivery 120 giây, review window 600 giây, không có
lượt chỉnh sửa, không lưu state local. Trong chat, `/quick_review` tạo offer cùng giá.
Code: `src/quick.ts`.

## Đọc CV, review và PDF

| Phần              | Cách xử lý                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| PDF có văn bản    | `unpdf`; PDF scan không có text và PDF yêu cầu mật khẩu bị từ chối                                                       |
| DOCX              | `mammoth.extractRawText`, đọc nội dung ZIP/XML thực sự                                                                   |
| TXT               | UTF-8 strict, từ chối dữ liệu nhị phân                                                                                   |
| Review            | Mastra trả object có schema Zod, gồm tổng quan, điểm mạnh, vấn đề theo từng phần/mức ưu tiên và checklist                |
| Cải thiện câu chữ | Mỗi đoạn CV mới tham chiếu các đoạn nguồn; code kiểm tra nguồn, độ bao phủ, email, URL và số liệu                        |
| Báo cáo           | Markdown do code dựng từ object đã kiểm tra, có ví dụ trước/sau                                                          |
| PDF               | `pdf-lib` + `@pdf-lib/fontkit`, font Noto Sans được đóng gói sẵn, A4 một cột, chữ chọn được, tự xuống dòng và phân trang |

Tối đa **5 MB** và **30.000 ký tự** trích xuất; không âm thầm cắt CV. Nhận xét dựa
trên văn bản, không phải phân tích trực quan bố cục gốc. AI được yêu cầu giữ tên,
công ty, chức danh, thời gian, kỹ năng và thành tích; không bổ sung dữ kiện thiếu
vào PDF. Kiểm tra nguồn và token không chứng minh được mọi câu viết lại có cùng
ý nghĩa, nên người mua vẫn cần đọc lại CV trước khi ứng tuyển.

Đầu ra model sai schema hoặc sai tham chiếu được thử lại một lần, dùng chung
timeout 150 giây cho cả hai lần. Retry nêu mã lỗi và ID đoạn nguồn cần sửa.
Model chỉ trả các đoạn cần viết lại; các đoạn không có đề xuất được giữ nguyên.
Code quản lý thứ tự, tiêu đề và toàn bộ tham chiếu của CV, tránh lỗi model phải
tự tái tạo một cây tài liệu đầy đủ với mọi ID nguồn.
Khác biệt về dấu phân cách khoảng thời gian, khoảng trắng trước `%` hoặc dấu
câu sau URL không bị coi là thay đổi dữ kiện. Nếu nội dung viết lại thay đổi
số liệu hay thông tin liên hệ, agent giữ nguyên đoạn nguồn tương ứng trong PDF
và thông báo trong checklist, thay vì chấp nhận dữ kiện sai hoặc hủy một báo cáo
hữu ích. Việc này chỉ áp dụng khi schema và các ID đề xuất hợp lệ; ID không tồn
tại hoặc bị lặp vẫn bị từ chối và yêu cầu model sửa lại.

Log chẩn đoán chỉ chứa giai đoạn, mã lỗi, HTTP status, schema path và ID đoạn
nguồn; không ghi thông báo lỗi thô hoặc nội dung request/response. Lỗi xác thực,
rate limit và timeout có thông báo riêng để chủ agent biết cách xử lý.

Không dùng câu trả lời rỗng hoặc dang dở làm kết quả. Report `result` chỉ được gửi sau khi có báo cáo hợp lệ và PDF upload
đạt trạng thái `READY`, được Payvoke xác minh kích thước và SHA-256. Lỗi parse,
model, font/PDF hoặc upload sẽ gửi `failed`.

PDF tiếng Việt/Anh dùng font kèm giấy phép tại `assets/fonts`. Ký tự ngoài bộ font
được báo lỗi thay vì bị mất khi xuất. Agent không giữ ảnh, thiết kế nhiều cột hoặc
bố cục trang của CV gốc.

## Dữ liệu và vận hành

- CV được tải và xử lý trong bộ nhớ; nội dung CV và yêu cầu được gửi qua OpenRouter. Việc lưu trữ phía OpenRouter/model tuân theo nhà cung cấp đã chọn.
- Payvoke lưu tệp đầu vào và PDF kết quả. State local chỉ lưu metadata tệp, `goal`, phiên bản artifact và form chờ; không lưu văn bản CV, báo cáo hay log nội dung request/response của model.
- State nằm trong `STATE_DIR` (mặc định `.data`, đã gitignore), ghi atomically bằng file tạm và rename. Tên file được hash từ ID để tránh path traversal/collision.
- Metadata job thành công có TTL 35 phút, đủ review window và khoảng đệm; state ban đầu/form chờ có TTL một giờ. Cleanup chạy mỗi phút và khi khởi động.
- Chạy **một instance**, mount volume cho state. Queue xử lý lần lượt theo thread hoặc invocation; ACK và idempotency ngăn giao sản phẩm trùng khi feed gửi lại sự kiện.
- Giống các examples hiện tại, tiến trình chết sau ACK có thể không phục hồi công việc đang chạy. Job chưa giao đúng hạn được Payvoke xử lý hoàn tiền; đây không phải hệ thống worker có durable queue.

## Docker

Build từ repository root:

```sh
docker build -f examples/cv-reviewer/Dockerfile -t cv-reviewer .
docker run -d --restart unless-stopped --env-file examples/cv-reviewer/.env -v cv-reviewer-data:/app/.data cv-reviewer
```

Image chạy bằng user `bun`, không cần browser hoặc font hệ thống. Bundle nằm trong
`dist/`, font nằm trong `assets/` và được resolve tương đối từ bundle.

## Kiểm tra

Từ `examples/cv-reviewer`, không cần API key hay kết nối Payvoke/OpenRouter:

```sh
bun test
bun run typecheck
bun run build
```

Tests dùng CV giả, tạo DOCX nén thực sự, đọc lại PDF, kiểm tra phân trang, mock
luồng form/offer/run/revision và upload presigned. `dist/preview.pdf` và
`dist/preview.png` là bản mẫu được tạo bởi PDF test để kiểm tra trực quan.

Sau khi cấu hình khóa của app thử nghiệm, kiểm tra thủ công một job thanh toán và
một revision trên deployment để xác minh listing, escrow, file storage và kết quả
hiển thị trong chat. Tests offline không xác nhận kết nối dịch vụ bên ngoài.
