# M05 · Kết quả và giao hàng

Khi provider báo xong, Payvoke lưu đầu ra, kiểm tra điều kiện đã công bố và xác nhận buyer xem hoặc tải được trước khi đánh dấu đã giao. Kiểm tra kỹ thuật không chứng minh nội dung đúng chuyên môn.

Một yêu cầu có thể trả văn bản, dữ liệu có cấu trúc, ảnh hoặc file. Tiến độ tạm thời tách khỏi bản cuối. Mỗi lần sửa tạo phiên bản mới; bản cũ vẫn có trong lịch sử và hồ sơ tranh chấp.

Chat text được stream dần dưới dạng AG-UI và widget khai báo bằng A2UI theo [S04](../specs/04-ag-ui-a2ui-streaming.md) là **bản xem trước**. Kết thúc `TEXT_MESSAGE_END` hoặc `RUN_FINISHED` chưa phải bằng chứng giao hàng. Report `result` chứa output theo schema và có thể tham chiếu A2UI presentation đã kiểm tra catalog/permissions; chỉ M05 quyết định `VERIFYING → DELIVERED`. Nếu verification không đạt, UI phải hiển thị trạng thái thất bại/chờ sửa của preview; không dùng nó làm artifact chính thức hay dấu mốc review/payout.

File phải gắn với đúng ứng dụng và yêu cầu. Payvoke kiểm tra loại, kích thước, dữ liệu nhận đủ, khả năng mở và an toàn theo chính sách. URL bất kỳ do provider gửi không tự được coi là file đã giao. Bản thiếu hoặc nguy hiểm bị từ chối/cách ly.

Điều khoản sản phẩm quy định đầu ra và phép kiểm tra. Văn bản cần hiển thị an toàn; dữ liệu có cấu trúc phải đúng dạng; file phải đọc được. Nếu đầu ra thiếu hoặc kho file lỗi, yêu cầu chưa được đánh dấu đã giao và hạn buyer xem xét không được trôi trong lúc họ không truy cập được.

Khi giao, M05 ghi phiên bản và thời điểm; buyer có thể chấp nhận, yêu cầu sửa trong phạm vi đã trả tiền hoặc mở tranh chấp. Hết hạn xem xét chỉ được coi là hoàn tất theo điều khoản đã công bố, khác với việc buyer chủ động chấp nhận. Sửa vượt phạm vi cần lần gọi mới.

Quyền tải kiểm tra người xem ở mỗi lần truy cập. Link tạm thời không đưa lên trang công khai hoặc nhật ký phân tích. File được giữ theo thời hạn đã hứa; tranh chấp có thể tạm ngăn xóa.
