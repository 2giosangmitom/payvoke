# M02 · Workspace và phiên sử dụng

M02 lưu brief, phiên sử dụng, tin nhắn, parameters và file của buyer. M04 gửi bản sao dữ liệu được buyer chọn cho provider; event không thay thế lịch sử. Phiên agent có hội thoại; phiên tool có form và lịch sử chạy, không có composer chat. Chi tiết schema/luồng ở [S01](../specs/01-api-and-provider-protocol.md).

## Soạn và gửi

Workspace gom các phiên sử dụng của một công việc. Brief có phiên bản. Mỗi phiên gắn bất biến với đúng một sản phẩm và kind agent/tool, có thể dùng các command đã đăng ký của chính sản phẩm đó. Đổi sản phẩm/provider phải mở phiên mới và chọn lại dữ liệu muốn chia sẻ; không thêm nhiều agent vào cùng đoạn chat.

Agent có composer và slash palette. Tin nhắn thường map vào string parameter của default command; slash command map thành commandId và arguments có schema, không thực thi raw text. Tool hiển thị form theo schema; chọn slash command của tool mở phiên tool, không hiện composer. Chưa xác nhận quote thì input chỉ là draft, không phát event hoặc thu tiền.

Buyer xem giá, số dư còn lại và dữ liệu gửi trước khi chạy. Trong invocation đang mở, câu trả lời tham chiếu questionId hoặc revision trong phạm vi không thu thêm. Tool nhận câu hỏi qua form; agent có thể trả lời trong chat. Tin nhắn tự phát khác hoặc đổi mục tiêu tạo quote/lần gọi mới, không được gắn nhãn miễn phí tùy ý. MVP chỉ một invocation đang thực thi/chờ xử lý trong mỗi phiên; trạng thái tiền được giữ/tranh chấp vẫn tách khỏi trạng thái công việc.

Mỗi tin lưu người gửi, thứ tự, nội dung và lần gọi liên quan. Nội dung có thể là văn bản, dữ liệu có cấu trúc hoặc tham chiếu file. Báo cáo provider gửi lại không tạo tin trùng. Tiến độ tạm thời khác kết quả cuối đã được M05 kiểm tra. Tải lại trang phải khôi phục đúng lịch sử, không tạo lần chạy mới.

## File và quyền chia sẻ

File tải lên nằm riêng tư cho đến khi buyer chọn gửi trong một lần gọi. Payvoke kiểm tra quyền sở hữu, loại file, kích thước và chính sách an toàn. Provider nhận thông tin file cùng quyền tải có thời hạn, chỉ cho yêu cầu đó.

Trước khi xác nhận, buyer thấy chính xác tin nhắn, phần brief/lịch sử và file sẽ gửi. Payvoke lấy dữ liệu đã lưu, không tin danh sách file hoặc lịch sử do trình duyệt tự khai báo. File và nội dung động không được hiển thị như nội dung tin cậy.
