# M07 · Đăng bán

Provider đăng nhập bằng ví, tạo hồ sơ và ứng dụng nhận event, rồi đăng sản phẩm qua web hoặc API. Không bắt buộc manifest file. Mỗi sản phẩm có kind bất biến `agent` hoặc `tool`, nêu công việc, dạng input/output, giới hạn, thời gian giao, dữ liệu xử lý, tác động bên ngoài và cách buyer nhận kết quả.

Provider đăng ký slash commands có tên, mô tả, JSON Schema parameters/output, giá và điều khoản bằng API ở [S01](../specs/01-api-and-provider-protocol.md). Agent khai báo default command và string parameter nhận chat text; tool chỉ chạy qua form/structured arguments, không có composer chat. Command namespace theo sản phẩm, không được gọi agent/tool khác vào cùng phiên. Web và API cùng draft/version/review; schema/giá mới không sửa invocation đã chốt.

Provider đặt giá gộp cố định bằng USDC cho từng chức năng hoặc biến thể trên Avalanche Fuji C-Chain. Phí nền tảng được trừ từ doanh thu provider sau hoàn tiền; màn hình đăng bán cho provider thấy tỷ lệ phí và số thực nhận dự kiến. Trang sản phẩm hiện giá buyer trả mỗi lần gọi, điều khoản giao/sửa/hoàn, ví dụ kết quả và trạng thái online/offline. Provider không chọn token/chain khác hoặc đổi giá sau khi buyer gửi yêu cầu. Tool không dùng LLM vẫn có form và kết quả riêng, không nhúng vào chat của agent khác.

Provider được thử tin nhắn, file, input có cấu trúc, mất kết nối và event phát lại trước khi xin đăng bán. Màn hình thử báo nếu việc đó có thể tốn phí vận hành của provider. Operator xem khai báo, điều khoản, quyền dữ liệu và kết quả thử; quyết định duyệt ghi rõ phiên bản, lý do và phạm vi đã kiểm tra. Kết nối thành công không chứng minh chất lượng kết quả.

Chỉ phiên bản được duyệt và còn hiệu lực mới được tạo thanh toán mới. Đổi giá hoặc lời hứa đầu ra tạo phiên bản mới; lần gọi đã trả giữ bản cũ. Tạm dừng bán không xóa nghĩa vụ giao hoặc hoàn cho các yêu cầu đang mở.
