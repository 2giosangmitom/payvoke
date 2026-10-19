# Thiết kế Payvoke

Payvoke kết nối buyer với provider tự vận hành agent hoặc công cụ. Buyer nạp USDC vào PayvokeVault rồi trả theo từng lần gọi mà không ký lại. Payvoke không chạy phần mềm của provider: hệ thống phát event qua kết nối do provider mở và nhận kết quả qua API.

Đăng nhập bằng ví; blockchain duy nhất là Avalanche Fuji C-Chain. Mỗi phiên sử dụng gắn cố định một sản phẩm: **agent có chat/composer và slash commands; tool có form parameters, trạng thái và kết quả, không có composer chat**. Không bắt buộc tool dùng LLM. Provider có API đăng ký commands có schema tham số; không trộn agent/tool khác vào cùng phiên.

Trang này là tổng quan chức năng, không phải bằng chứng đã triển khai. [Đặc tả triển khai](specs/README.md) chốt API/provider event, scheme x402/vault và MCP; [GLOSSARY](../GLOSSARY.md) thống nhất thuật ngữ.

## Luồng chính

1. Provider kết nối SSE bằng API key, đăng ký slash commands và schema parameters qua web/API; chỉ bản được duyệt được bán với giá USDC cố định mỗi lần gọi.
2. Buyer kết nối ví, nạp USDC vào PayvokeVault và cấp quyền chi có hạn cho khóa phiên; sau đó chọn chức năng, nội dung và file sẽ chia sẻ.
3. Mỗi lần buyer gửi yêu cầu mới đi qua x402: client ký chứng từ bằng khóa phiên, Payvoke quyết toán khoản trừ đúng giá trong vault rồi mới phát event cho provider. Gửi lại cùng thao tác không trừ thêm tiền hoặc chạy thêm lần nữa.
4. Provider tự xử lý rồi gửi tiến độ, câu hỏi hoặc kết quả về Payvoke. Payvoke lưu, kiểm tra và giao kết quả cho buyer.
5. Buyer yêu cầu sửa trong phạm vi đã trả tiền hoặc mở tranh chấp; tiền hoàn trả vào số dư có thể rút.

## Module

| Module                                                          | Phạm vi                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| [M01 · Danh tính](modules/01-identity-and-access.md)            | Ví, phiên đăng nhập, quyền truy cập                                |
| [M02 · Phiên sử dụng](modules/02-workspace-and-conversation.md) | Agent chat, tool form, workspace và dữ liệu chia sẻ                |
| [M03 · Giá](modules/03-per-use-pricing.md)                      | Giá và phạm vi từng lần gọi                                        |
| [M04 · Provider](modules/04-provider-requests-and-gateway.md)   | Kết nối, event, báo cáo, trạng thái                                |
| [M05 · Kết quả](modules/05-artifacts-and-verification.md)       | Đầu ra, kiểm tra, giao hàng, sửa                                   |
| [M06 · Thanh toán](modules/06-x402-payments-and-refunds.md)     | x402, thu theo lần gọi, hoàn tiền, đối soát                        |
| [M07 · Đăng bán](modules/07-provider-publishing.md)             | Trang sản phẩm, phiên bản, xét duyệt                               |
| [M08 · Client ngoài](modules/08-external-client-access.md)      | MCP local dùng cùng buyer API và x402; quyền API/chi riêng         |
| [M09 · Vận hành](modules/09-reputation-and-operations.md)       | Đánh giá, tranh chấp, sự cố                                        |
| [M10 · PayvokeVault](modules/10-payvoke-vault.md)               | Nạp/rút USDC, giới hạn chi, phí nền tảng, giữ tiền và trả provider |

Tài sản thanh toán đã chốt: USDC testnet trên Fuji. Mỗi lần gọi bắt buộc qua x402 với scheme riêng cho PayvokeVault; Payvoke phải triển khai client và facilitator tương ứng. Trước khi bật giao dịch, cần chốt tỷ lệ/trần phí và thời hạn giữ tiền. Scheme riêng không tự tương thích với client hoặc facilitator x402 bên ngoài.
