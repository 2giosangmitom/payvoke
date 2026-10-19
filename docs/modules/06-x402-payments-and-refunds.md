# M06 · Thanh toán theo lần gọi

Buyer nạp USDC vào [PayvokeVault](10-payvoke-vault.md) trên Avalanche Fuji C-Chain (chain ID 43113, `eip155:43113`). **Mỗi lần gọi phải thanh toán qua x402** từ số dư đó. Buyer không phải mở ví để ký lại: khóa phiên đã được buyer cấp quyền ký chứng từ cho từng yêu cầu. Số dư là USDC có thể rút, không phải lượt sử dụng.

[S02](../specs/02-x402-and-vault.md) chốt scheme/payload/EIP-712/ABI và recovery; [S01](../specs/01-api-and-provider-protocol.md) chốt quote/invocation endpoints. Invocation mới từ chat, form hay MCP đều cùng luồng này. Polling, trả lời questionId và revision đúng phạm vi không tạo khoản thu mới. Với `upfront`, facilitator `settle` phải kiểm tra đầy đủ vì core không gọi `/verify` trong luồng chuẩn.

## Thu tiền

M03 chốt chức năng, giá USDC, phiên bản điều khoản và dữ liệu sẽ chia sẻ. Gateway trả HTTP `402` cùng `PAYMENT-REQUIRED` cho yêu cầu đó: giá, USDC Fuji, PayvokeVault và hạn thanh toán. Client kiểm tra báo giá rồi ký chứng từ bằng khóa phiên, gắn với ví buyer, mã yêu cầu, báo giá và thời hạn; Payvoke không giữ khóa riêng này. [Luồng HTTP x402](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md).

Client gửi lại yêu cầu cùng `PAYMENT-SIGNATURE`. Facilitator do Payvoke vận hành kiểm tra chứng từ và gọi PayvokeVault để giữ đúng số USDC của lần gọi. Contract tự xác minh chữ ký khóa phiên, hạn mức, thời hạn, số dư và mã yêu cầu chưa dùng. Gateway trả `PAYMENT-RESPONSE` cùng mã yêu cầu; chỉ phát event cho M04 sau khi giao dịch trên Fuji được xác nhận. Thiếu USDC, vượt giới hạn hoặc đã thu hồi khóa thì không chạy.

## x402

Scheme x402 riêng của Payvoke dùng luồng `upfront`: facilitator gọi `settle` để khóa tiền trong vault **trước** khi gateway nhận xử lý. Xác nhận thanh toán là khoản giữ đã ghi onchain; trả provider hoặc hoàn tiền là bước nghiệp vụ sau đó. Scheme này phải có mô tả công khai, client và facilitator triển khai đúng cùng một cách, và khai báo hỗ trợ trên `eip155:43113`. Nó không phải x402 `exact` và client x402 thông thường không tự hỗ trợ. [Đặc tả x402 v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md).

Một mã yêu cầu chỉ được trừ một lần. Gửi lại chứng từ trả về trạng thái cũ, không tạo lần chạy mới. Nếu tiền đã được giữ mà Payvoke mất phản hồi, hệ thống đối chiếu trên Fuji rồi phát một event logic. Trạng thái chưa rõ không được tự thu thêm. Buyer thấy lịch sử nạp, trừ, hoàn, rút và số dư khả dụng.

## Hoàn tiền và payout

Tiền của lần gọi nằm trong khoản đang giữ cho đến khi hết thời hạn giao/tranh chấp theo điều khoản. M09 quyết định hoàn toàn bộ hoặc một phần; M06 trả phần đó về số dư khả dụng của đúng ví buyer. Buyer có thể rút từ số dư này. Phần còn lại mới chia thành phí Payvoke và khoản provider được rút; phí chỉ tính trên phần không hoàn. Không cho payout sớm hơn thời hạn hoàn nếu chưa có nguồn dự phòng.

Payvoke đối chiếu tổng tiền trong vault với số dư buyer, khoản đang giữ và khoản provider/Payvoke chưa rút. Ghi riêng giao dịch onchain và trạng thái nghiệp vụ; không xem báo cáo từ trình duyệt là bằng chứng tiền đã chuyển. Quyền duyệt hoàn và quyền thực hiện payout tách nhau.

Trước khi bật thanh toán, phải chốt tỷ lệ/trần phí nền tảng, thời hạn giữ tiền, nguồn xử lý hoàn muộn và đặc tả scheme x402 cho PayvokeVault. Chính sách gas ở M10. Kiểm thử chứng từ sai/hết hạn/thu hồi, thu trùng, hai yêu cầu đồng thời, mất phản hồi sau giao dịch, rút trong lúc thu và hoàn sau payout.
