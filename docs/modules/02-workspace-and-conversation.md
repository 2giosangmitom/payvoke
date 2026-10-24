# M02 · Thread chat và hội thoại

M02 lưu thread, tin nhắn, câu hỏi, revision, tham số và file của buyer. M04 gửi bản sao dữ liệu buyer chọn cho provider; event không thay thế lịch sử. Mọi app dùng chung một giao diện chat; provider phân biệt hành vi bằng command. Schema và luồng xử lý được quy định ở [S01](../specs/01-api-and-provider-protocol.md).

## Một danh sách thread, nhiều app

Mỗi thread gắn bất biến với một buyer và đúng một app. Buyer có thể mở thread từ store, từ Studio hoặc từ danh sách thread bên trái. Danh sách này trộn mọi app giống hộp thư hội thoại, có search, đổi tên và archive. Đổi app phải mở thread mới; không thêm nhiều app vào cùng một đoạn chat.

Thread không khóa mọi lần gọi vào một revision vĩnh viễn. Khi provider sửa command, quote mới dùng revision hiện hành; invocation cũ vẫn dùng revision đã chốt.

## Soạn, chọn command và gửi

Composer hỗ trợ hai cách nhập:

- Gõ free text: map vào tham số vị trí của command đang chọn, mặc định là `defaultCommand`.
- Gõ `/`: mở palette command của chính app. Nếu command không có tham số vị trí, form arguments mở ra trước khi tạo quote.

Backend không thực thi raw slash text. UI chuyển lựa chọn thành `commandId + arguments`; server validate schema, availability và quyền trước khi trả quote. Chưa xác nhận quote thì input chỉ là draft, không phát event hoặc thu tiền.

Buyer xem giá, số dư còn lại, command revision và dữ liệu gửi trước khi chạy. Quote hiển thị thành card ghim ngay trên composer; card này có thể thu gọn nhưng không đổi giao thức x402/vault.

Trong invocation đang mở, câu trả lời tham chiếu `questionId` hoặc revision trong phạm vi không thu thêm. Tin nhắn tự phát khác hoặc đổi mục tiêu tạo quote/lần gọi mới, không được gắn nhãn miễn phí tùy ý. MVP chỉ cho một invocation đang thực thi/chờ xử lý trong mỗi thread; trạng thái tiền được giữ/tranh chấp vẫn tách khỏi trạng thái công việc.

App offline không nhận quote mới nhưng thread cũ vẫn đọc được, kể cả khi app bị suspend hoặc archive. Buyer không mất lịch sử đã trả tiền.

## Lịch sử và streaming

Payvoke lưu người gửi, thứ tự, nội dung, command revision và invocation liên quan cho mỗi tin nhắn. Nội dung có thể là văn bản, dữ liệu có cấu trúc hoặc tham chiếu file. Báo cáo provider gửi lại không tạo tin trùng. Tiến độ tạm thời được lưu riêng với kết quả cuối đã được M05 kiểm tra. Tải lại trang phải khôi phục đúng lịch sử, không tạo lần chạy mới.

**Chat stream theo [S04](../specs/04-ag-ui-a2ui-streaming.md):** frontend nhận `TEXT_MESSAGE_START/CONTENT/END` qua AG-UI SSE và render chữ tăng dần trong thread. Widget A2UI được frontend nhận dưới dạng `ACTIVITY_SNAPSHOT` (`activityType:"a2ui-surface"`, `content.a2ui_operations`) để chèn/cập nhật card, bảng, chart hoặc question form theo catalog được duyệt. Mất kết nối phải khôi phục snapshot và cursor, không nhân đôi delta hoặc gửi lại lời nhắn tính phí. Streaming chỉ là bản xem trước; chat còn hiển thị trạng thái VERIFYING/DELIVERED từ API nghiệp vụ.

## File và quyền chia sẻ

File tải lên nằm riêng tư cho đến khi buyer chọn gửi trong một lần gọi. Payvoke kiểm tra quyền sở hữu, loại file, kích thước và chính sách an toàn. Provider nhận thông tin file cùng quyền tải có thời hạn, chỉ cho yêu cầu đó.

Trước khi xác nhận, buyer thấy chính xác tin nhắn, phần lịch sử và file sẽ gửi. Payvoke lấy dữ liệu đã lưu, không tin danh sách file hoặc lịch sử do trình duyệt tự khai báo. File và nội dung động không được hiển thị như nội dung tin cậy.
