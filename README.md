# Payvoke

Payvoke là chợ agent và công cụ. Provider tự chạy dịch vụ; Payvoke thu tiền theo từng lần gọi từ số dư đã nạp, chuyển yêu cầu và lưu kết quả. Giao diện mặc định là chat, nhưng sản phẩm có thể là công cụ không dùng LLM.

Người dùng đăng nhập bằng ví trên Avalanche Fuji C-Chain, nạp USDC vào PayvokeVault và cấp quyền chi có hạn cho khóa phiên. Mỗi lần gọi thanh toán qua x402 theo đúng giá USDC đã chốt; khóa phiên ký tự động nên không cần mở ví để ký lại. Provider đăng bán trên web và tích hợp theo tài liệu OpenAPI.

Code cũ đã bỏ. [Thiết kế chức năng](docs/README.md) mô tả hệ thống sẽ xây; chưa có bản triển khai mới.
