# M08 · Client bên ngoài

Client dùng cùng sản phẩm, số dư PayvokeVault và trạng thái với web. [S03](../specs/03-mcp-client.md) chốt MCP local qua stdio để ứng dụng AI sử dụng, phụ thuộc buyer API/payment core; không bắt buộc phải hoàn thành toàn bộ UI web mới xây adapter. Không có số dư riêng cho client; mỗi invocation mới vẫn có khoản giữ tiền riêng.

MCP cung cấp tools tĩnh để tìm sản phẩm, xem commands/parameters, tạo phiên, chuẩn bị quote, submit, đọc trạng thái/kết quả và tiếp tục invocation. Provider slash command không phải MCP prompt, không mặc định host hiện slash UI. Mỗi phiên vẫn chỉ một agent/tool; kind quyết định giao diện web có chat hay không.

Buyer đăng nhập bằng ví để cấp cho client quyền có thời hạn theo workspace và hành động: tìm sản phẩm, đọc dữ liệu, chuẩn bị lần gọi, gửi yêu cầu trả phí hoặc xem kết quả. Client không nhận khóa ví chính. Muốn trả phí, client cần khóa phiên riêng được buyer đăng ký trong PayvokeVault và quyền gửi yêu cầu trong Payvoke; cả hai đều có thể thu hồi.

MVP bridge giữ spend key local, pairing qua web đăng nhập ví để nhận scoped API token; token không phải grant onchain. S03 yêu cầu local quote approval ngoài model trước khi chi, không nhận `confirmed:true` từ tool argument làm consent. Remote MCP giữ khóa buyer/remote paid submit chưa thuộc MVP; không tự chuyển khóa lên server để tiện triển khai.

Buyer cấp hoặc thay đổi giới hạn chi onchain qua ví trên web. Sau đó client có quyền phù hợp ký chứng từ x402 bằng khóa phiên khi buyer gửi yêu cầu, không bật ví chính mỗi lần. Client phải hiện giá, input và số dư còn lại; nếu chưa có quyền chi hoặc không đủ tiền, nó đưa buyer về web để nạp tiền hoặc cập nhật giới hạn. Client x402 bên ngoài phải triển khai scheme riêng của Payvoke.

Buyer có thể chuẩn bị trên client rồi xem kết quả ở cả hai nơi. Gửi lại cùng thao tác không thu thêm tiền hoặc phát thêm event. Client có thể hiển thị tool không dùng LLM và file qua quyền tải riêng. Nếu không hỗ trợ một bước bắt buộc, client chuyển buyer về web.

Thu hồi quyền chặn thao tác mới từ client, không xóa tin nhắn, khoản đã trả hoặc quyền hoàn. Payvoke lưu lịch sử client nào đã thao tác trên tài khoản.
