# Thiết kế Payvoke

Payvoke kết nối buyer với provider tự vận hành app AI. Buyer nạp USDC vào PayvokeVault rồi trả theo từng lần gọi bằng khóa chi, không cần mở ví chính để ký lại. Provider tự chạy phần mềm; Payvoke phát event qua kết nối do provider mở và nhận kết quả qua API.

Người dùng đăng nhập bằng ví trên Avalanche Fuji C-Chain, blockchain duy nhất được hỗ trợ. Mỗi thread gắn cố định một app. Mọi app dùng chung chat/composer, danh sách thread và slash commands; app không bắt buộc dùng LLM. Provider đăng ký command có options/schema qua Studio hoặc API; free text map vào command đang chọn/default, còn command không có tham số vị trí mở form trong thread.

Trang này mô tả thiết kế chức năng, chưa xác nhận tính năng đã triển khai. [Đặc tả triển khai](specs/README.md) quy định API/provider event, scheme x402/vault, MCP local và AG-UI/OpenUI; [GLOSSARY](../GLOSSARY.md) định nghĩa thuật ngữ. Chat stream text theo AG-UI, widget OpenUI được render từ catalog Payvoke; không tích hợp MCP Apps.

[Roadmap từ đầu đến cuối](roadmap.md) chia thành 130 task trong 10 giai đoạn. Gate backend-ready yêu cầu luồng headless, recovery và tài chính trên Fuji được kiểm chứng trước khi làm frontend.

[Baseline T001](baseline.md) ghi trạng thái ngày 20/10/2026 (lịch sử); hiện trạng mới nhất ở [roadmap §2](roadmap.md#2-mốc-hiện-tại-và-layout-mục-tiêu) và [payment-acceptance](payment-acceptance.md).

[Mapping kiểm thử T002, bổ sung S04](test-mapping.md) nối yêu cầu S01–S04 với ca kiểm thử, test surface và task/milestone nghiệm thu; AG-UI/OpenUI đã có một phần suite, các nhóm còn lại vẫn là thiết kế.

[Nghiên cứu agentic payments](research/agentic-payments-literature.md) đối chiếu thiết kế với 13 paper về bảo mật x402, verify-then-pay, reputation và quyết định phía buyer; các đề xuất thành task R01–R08 trong roadmap.

## Luồng chính

1. Provider tạo app, đăng ký slash commands và command revision qua Studio/API; app `PUBLIC` và available xuất hiện trong store với giá USDC cố định mỗi lần gọi.
2. Buyer kết nối ví, nạp USDC vào PayvokeVault và cấp quyền chi có hạn cho khóa phiên; sau đó mở thread, chọn command hoặc nhập free text và chọn dữ liệu/file sẽ chia sẻ.
3. Mỗi lần buyer gửi yêu cầu mới đi qua x402: client ký chứng từ bằng khóa phiên, Payvoke quyết toán khoản trừ đúng giá trong vault rồi mới phát event cho provider. Gửi lại cùng thao tác không trừ thêm tiền hoặc chạy thêm lần nữa.
4. Provider tự xử lý rồi gửi tiến độ, câu hỏi hoặc kết quả về Payvoke. Payvoke lưu, kiểm tra và giao kết quả cho buyer.
5. Buyer yêu cầu sửa trong phạm vi đã trả tiền hoặc mở tranh chấp; tiền hoàn trả vào số dư có thể rút.

## Module

| Module                                                        | Phạm vi                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [M01 · Danh tính](modules/01-identity-and-access.md)          | Ví, phiên đăng nhập, quyền truy cập                                |
| [M02 · Thread chat](modules/02-workspace-and-conversation.md) | Một chat shell, danh sách thread, command và dữ liệu chia sẻ       |
| [M03 · Giá](modules/03-per-use-pricing.md)                    | Giá và phạm vi từng lần gọi                                        |
| [M04 · Provider](modules/04-provider-requests-and-gateway.md) | Kết nối, event, báo cáo, trạng thái                                |
| [M05 · Kết quả](modules/05-artifacts-and-verification.md)     | Đầu ra, kiểm tra, giao hàng, sửa                                   |
| [M06 · Thanh toán](modules/06-x402-payments-and-refunds.md)   | x402, thu theo lần gọi, hoàn tiền, đối soát                        |
| [M07 · Đăng bán](modules/07-provider-publishing.md)           | App, visibility, command revision, key và availability             |
| [M08 · Client ngoài](modules/08-external-client-access.md)    | MCP local dùng cùng buyer API và x402; quyền API/chi riêng         |
| [M09 · Vận hành](modules/09-reputation-and-operations.md)     | Đánh giá, tranh chấp, sự cố                                        |
| [M10 · PayvokeVault](modules/10-payvoke-vault.md)             | Nạp/rút USDC, giới hạn chi, phí nền tảng, giữ tiền và trả provider |

Tài sản thanh toán đã chốt: USDC testnet trên Fuji. Mỗi lần gọi bắt buộc qua x402 với scheme riêng cho PayvokeVault; Payvoke phải triển khai client và facilitator tương ứng. Trước khi bật giao dịch, cần chốt tỷ lệ/trần phí và thời hạn giữ tiền. Scheme riêng không tự tương thích với client hoặc facilitator x402 bên ngoài.
