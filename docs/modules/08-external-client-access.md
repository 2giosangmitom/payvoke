# M08 · Client bên ngoài

Client dùng cùng sản phẩm, số dư PayvokeVault và trạng thái với web, triển khai sau luồng web. Không có số dư riêng cho client; mỗi lần gọi vẫn có khoản trừ tiền riêng.

Buyer đăng nhập bằng ví để cấp cho client quyền có thời hạn theo workspace và hành động: tìm sản phẩm, đọc dữ liệu, chuẩn bị lần gọi, gửi yêu cầu trả phí hoặc xem kết quả. Client không nhận khóa ví chính. Muốn trả phí, client cần khóa phiên riêng được buyer đăng ký trong PayvokeVault và quyền gửi yêu cầu trong Payvoke; cả hai đều có thể thu hồi.

Buyer cấp hoặc thay đổi giới hạn chi onchain qua ví trên web. Sau đó client có quyền phù hợp ký chứng từ x402 bằng khóa phiên khi buyer gửi yêu cầu, không bật ví chính mỗi lần. Client phải hiện giá, input và số dư còn lại; nếu chưa có quyền chi hoặc không đủ tiền, nó đưa buyer về web để nạp tiền hoặc cập nhật giới hạn. Client x402 bên ngoài phải triển khai scheme riêng của Payvoke.

Buyer có thể chuẩn bị trên client rồi xem kết quả ở cả hai nơi. Gửi lại cùng thao tác không thu thêm tiền hoặc phát thêm event. Client có thể hiển thị tool không dùng LLM và file qua quyền tải riêng. Nếu không hỗ trợ một bước bắt buộc, client chuyển buyer về web.

Thu hồi quyền chặn thao tác mới từ client, không xóa tin nhắn, khoản đã trả hoặc quyền hoàn. Payvoke lưu lịch sử client nào đã thao tác trên tài khoản.
