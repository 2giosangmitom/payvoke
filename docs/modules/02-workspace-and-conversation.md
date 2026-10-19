# M02 · Workspace và hội thoại

M02 lưu brief, tin nhắn, input và file của buyer. M04 gửi bản sao dữ liệu được buyer chọn cho provider; event không thay thế lịch sử hội thoại.

## Soạn và gửi

Workspace gom các hội thoại của một công việc. Brief có phiên bản. Mỗi hội thoại gắn với một sản phẩm và chức năng; đổi provider thì mở hội thoại mới và chọn lại dữ liệu muốn chia sẻ.

Tin nhắn soạn trước khi chọn chức năng chỉ được lưu, không phát event hoặc thu tiền. Buyer xem giá, số dư còn lại và dữ liệu gửi trước khi chạy. Trong yêu cầu đang mở, buyer trả lời câu hỏi của provider mà không trả thêm. Tin nhắn tự phát khác, hoặc tin gửi sau khi yêu cầu đóng, là lần gọi mới.

Mỗi tin lưu người gửi, thứ tự, nội dung và lần gọi liên quan. Nội dung có thể là văn bản, dữ liệu có cấu trúc hoặc tham chiếu file. Báo cáo provider gửi lại không tạo tin trùng. Tiến độ tạm thời khác kết quả cuối đã được M05 kiểm tra. Tải lại trang phải khôi phục đúng lịch sử, không tạo lần chạy mới.

## File và quyền chia sẻ

File tải lên nằm riêng tư cho đến khi buyer chọn gửi trong một lần gọi. Payvoke kiểm tra quyền sở hữu, loại file, kích thước và chính sách an toàn. Provider nhận thông tin file cùng quyền tải có thời hạn, chỉ cho yêu cầu đó.

Trước khi xác nhận, buyer thấy chính xác tin nhắn, phần brief/lịch sử và file sẽ gửi. Payvoke lấy dữ liệu đã lưu, không tin danh sách file hoặc lịch sử do trình duyệt tự khai báo. File và nội dung động không được hiển thị như nội dung tin cậy.
