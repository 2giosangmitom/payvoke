# Payvoke

Payvoke là chợ agent và công cụ. Provider tự chạy dịch vụ; Payvoke thu tiền theo từng lần gọi từ số dư đã nạp, chuyển yêu cầu và lưu kết quả. Mỗi phiên gắn với một sản phẩm: agent có giao diện chat, tool có form và kết quả, không có khung chat. Provider đăng ký slash commands có parameters qua web hoặc API.

Người dùng đăng nhập bằng ví trên Avalanche Fuji C-Chain, nạp USDC vào PayvokeVault và cấp quyền chi có hạn cho khóa phiên. Mỗi lần gọi thanh toán qua x402 theo đúng giá USDC đã chốt; khóa phiên ký tự động nên không cần mở ví để ký lại. Provider đăng bán trên web và tích hợp theo tài liệu OpenAPI.

Code cũ đã bỏ. [Thiết kế chức năng](docs/README.md) và [ba đặc tả triển khai](docs/specs/README.md) mô tả hệ thống sẽ xây, gồm API/provider, x402/vault và MCP local cho ứng dụng AI; chưa có bản triển khai mới.

[Roadmap triển khai](docs/roadmap.md): 130 task theo thứ tự contract/backend/x402 trước, frontend và MCP sau; mỗi task có dependency và điều kiện nghiệm thu.
