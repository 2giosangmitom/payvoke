# M06 · Thanh toán theo lần gọi

Buyer nạp USDC vào [PayvokeVault](10-payvoke-vault.md) trên Avalanche Fuji C-Chain (chain ID 43113, `eip155:43113`). Mỗi lần gọi phải thanh toán qua x402 từ số dư đó. Client dùng khóa phiên đã được buyer cấp quyền để ký chứng từ cho từng yêu cầu; buyer không phải mở ví chính để ký lại. Số dư là USDC có thể rút, không phải lượt sử dụng.

[S02](../specs/02-x402-and-vault.md) chốt scheme/payload/EIP-712/ABI và recovery; [S01](../specs/01-api-and-provider-protocol.md) chốt quy tắc quote/invocation (route lấy từ code). Invocation mới từ chat, form hay MCP đều cùng luồng này. Polling, trả lời questionId và revision đúng phạm vi không tạo khoản thu mới. Với `upfront`, facilitator `settle` phải kiểm tra đầy đủ vì core không gọi `/verify` trong luồng chuẩn.

## Thu tiền

M03 chốt chức năng, giá USDC, phiên bản điều khoản và dữ liệu sẽ chia sẻ. Gateway trả HTTP `402` cùng `PAYMENT-REQUIRED` cho yêu cầu đó: giá, USDC Fuji, PayvokeVault và hạn thanh toán. Client kiểm tra báo giá rồi ký chứng từ bằng khóa phiên, gắn với ví buyer, mã yêu cầu, báo giá và thời hạn; Payvoke không giữ khóa riêng này. [Luồng HTTP x402](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md).

Client gửi lại yêu cầu cùng `PAYMENT-SIGNATURE`. Facilitator do Payvoke vận hành kiểm tra chứng từ và gọi PayvokeVault để giữ đúng số USDC của lần gọi. Contract tự xác minh chữ ký khóa phiên, hạn mức, thời hạn, số dư và mã yêu cầu chưa dùng. Gateway trả `PAYMENT-RESPONSE` cùng mã yêu cầu; chỉ phát event cho M04 sau khi giao dịch trên Fuji được xác nhận. Thiếu USDC, vượt giới hạn hoặc đã thu hồi khóa thì không chạy.

## x402

Scheme x402 riêng của Payvoke dùng luồng `upfront`: facilitator gọi `settle` để khóa tiền trong vault trước khi gateway nhận xử lý. Xác nhận thanh toán là khoản giữ đã ghi onchain; trả provider hoặc hoàn tiền là bước nghiệp vụ sau đó. Scheme này phải có mô tả công khai, client và facilitator triển khai cùng đặc tả, và khai báo hỗ trợ trên `eip155:43113`. Nó không phải x402 `exact` và client x402 thông thường không tự hỗ trợ. [Đặc tả x402 v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md).

Một mã yêu cầu chỉ được trừ một lần. Gửi lại chứng từ trả về trạng thái cũ, không tạo lần chạy mới. Nếu tiền đã được giữ mà Payvoke mất phản hồi, hệ thống đối chiếu trên Fuji rồi phát một event logic. Trạng thái chưa rõ không được tự thu thêm. Buyer thấy lịch sử nạp, trừ, hoàn, rút và số dư khả dụng.

## Hoàn tiền và payout

Tiền của lần gọi nằm trong khoản đang giữ cho đến khi finance worker quyết định theo policy tự động (S02 §8.5): hoàn toàn bộ khi lỗi, không giao hoặc giao trễ; M06 trả về số dư khả dụng của đúng ví buyer và buyer có thể rút từ số dư này. Giao đúng hạn và đã hết review window thì giải ngân: phần còn giữ chia thành phí Payvoke và khoản provider được rút; phí chỉ tính trên phần không hoàn. Không payout sớm hơn `releaseNotBefore`.

Payvoke đối chiếu tổng tiền trong vault với số dư buyer, khoản đang giữ và khoản provider/Payvoke chưa rút. Ghi riêng giao dịch onchain và trạng thái nghiệp vụ; không xem báo cáo từ trình duyệt là bằng chứng tiền đã chuyển. Khóa ký quyết định (approver) và khóa gửi giao dịch (executor) tách nhau.

Trước khi bật thanh toán, phải chốt tỷ lệ/trần phí nền tảng, thời hạn giữ tiền, nguồn xử lý hoàn muộn và đặc tả scheme x402 cho PayvokeVault. Chính sách gas ở M10. Kiểm thử chứng từ sai/hết hạn/thu hồi, thu trùng, hai yêu cầu đồng thời, mất phản hồi sau giao dịch, rút trong lúc thu và hoàn sau payout.

## Đối chiếu với nghiên cứu bảo mật x402

Bốn nghiên cứu độc lập năm 2026 kiểm tra x402 thực tế và đều tìm thấy lỗ hổng ở facilitator/SDK công khai: 49 vi phạm trên 15 facilitator lớn [P1], các lỗi thay resource, settle trùng, overdraft và từ chối settle [P2], năm tấn công thực hiện được trên local chain, testnet và endpoint thật [P3], và 40 phát hiện hình thức mới qua Tamarin [P4]. Scheme `payvoke-vault` được thiết kế để chặn các lớp lỗi này:

| Lớp lỗi trong nghiên cứu                       | Cách Payvoke chặn                                                                   | Trạng thái |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| Báo thành công khi chưa settle (Free Shopping) | Chỉ `HELD` sau receipt + event + finalized read; pending trả receipt, không success | Local      |
| Chữ ký dùng cho resource khác                  | Chữ ký gắn `invocationKey`, quote, input/terms/policy hash                          | Local      |
| Settle trùng khi request đồng thời             | CAS durable theo invocation; contract consume-once                                  | Local      |
| Overdraft allowance (`upto`)                   | Không dùng `upto`; cap grant cộng dồn atomic trong `reserveHold`                    | Local      |
| Gas abuse, calldata tùy ý                      | Trần gas/phí, ngân sách cửa sổ; signer chỉ ký `reserveHold` trên đúng vault         | Local      |
| Settle không kiểm tra lại sau verify           | `settle` chạy lại toàn bộ checks                                                    | Local      |
| Header bị replay/cache                         | Chỉ `RELAYER_ROLE` settle được; response `no-store`                                 | Local      |
| Lộ PII trong metadata thanh toán [P5]          | Header chỉ có ID/hash và mô tả cố định; prompt/file không qua facilitator           | Local      |
| Payment vô nghĩa kinh tế                       | `grossAmount` dương, trong cap và không thấp hơn giá sàn của policy                 | Local      |

"Local" nghĩa là đã có test chạy trên PGlite/PostgreSQL và Hardhat node chain ID 43113, chưa phải bằng chứng Fuji. Các ca trên được gom thành **conformance suite** (R01) theo mã SR1–SR8 của [P1], F1–F4 của [P2] và M1–M6 của [P3]; chạy bằng `bun run --cwd apps/api test:conformance`, mỗi quy tắc có ít nhất một ca âm tính và suite fail nếu thiếu ca. Bảng đầy đủ: [S02 §11](../specs/02-x402-and-vault.md#11-đối-chiếu-nghiên-cứu-bảo-mật-x402) và [nghiên cứu agentic payments](../research/agentic-payments-literature.md#1-bảo-mật-facilitator-và-scheme-x402).
