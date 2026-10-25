# M04 · Kết nối provider

Provider tự chạy app và worker của mình. Payvoke lưu yêu cầu, phát event qua kết nối do provider mở và nhận báo cáo qua API; Payvoke không gọi vào máy chủ provider. Payvoke xử lý x402 ở phía buyer; provider không cần tích hợp x402. Provider tích hợp theo tài liệu OpenAPI, không cần SDK.

[S01](../specs/01-api-and-provider-protocol.md) quy định protocol MVP. Provider mở SSE với API key theo app; event có invocation, runId, command, version và effective arguments. Provider gửi ACK và report qua HTTP. Cursor không thay thế ACK; khi reconnect, Payvoke phát lại cùng event ID. [S04](../specs/04-ag-ui-a2ui-streaming.md) bổ sung kênh provider **stream AG-UI text/OpenUI widget vào Payvoke**, rồi Payvoke phát AG-UI SSE sang buyer. Khi triển khai cần sinh và kiểm tra OpenAPI artifact; hiện mới có đặc tả.

## Kết nối

Provider tạo ứng dụng và API key cho dịch vụ của mình. Dịch vụ chủ động kết nối, xác thực và gửi tín hiệu sống. Trang sản phẩm hiển thị online/offline. Online chỉ xác nhận kết nối còn sống, không bảo đảm provider đủ worker hoặc đã bắt đầu xử lý.

Provider có thể đổi, giới hạn hoặc thu hồi key. Key bị thu hồi không nhận event và không gửi báo cáo mới; trách nhiệm với yêu cầu đã trả tiền vẫn còn.

## Yêu cầu và event

M04 phát event sau khi M06 xác nhận tiền đã quyết toán. Event chứa định danh yêu cầu, ví buyer và thông tin hồ sơ được phép chia sẻ, tin nhắn hoặc input có cấu trúc, ngữ cảnh đã chọn, metadata ảnh/file và quyền tải tạm thời. Provider không phải gọi lại để lấy nội dung yêu cầu; file lớn tải qua quyền riêng.

Payvoke lưu event trước khi phát. Provider xác nhận đã nhận rồi tự xử lý. Nếu mất kết nối, Payvoke phát lại event chưa được xác nhận với cùng định danh; provider phải chống chạy trùng, nhất là khi công cụ gây tác động bên ngoài. ACK không có nghĩa đã hoàn thành. Một ứng dụng chỉ thấy yêu cầu của mình; event không chứa phiên đăng nhập, chữ ký ví, chứng từ thanh toán hoặc file chưa được chọn.

Provider chủ động gửi tiến độ, câu hỏi, kết quả, lỗi hoặc trạng thái chưa rõ. Payvoke kiểm tra key, thứ tự và tính trùng; gửi lại cùng báo cáo không tạo bản ghi mới. Buyer trả lời câu hỏi trong cùng yêu cầu, M04 phát event tiếp theo mà không thu thêm tiền. Yêu cầu hủy được phát cho provider, nhưng Payvoke không thể ép tiến trình bên họ dừng.

Với app chat, **token/chunk đi qua stream ingress NDJSON riêng theo runId** thay vì một report HTTP cho mỗi token. Gateway xác thực provider và trạng thái run, persist/dedupe chunk theo streamSequence và chỉ sau commit mới chiếu AG-UI event cho buyer. Provider gửi `CUSTOM payvoke.openui` chứa statement OpenUI Lang; gateway kiểm tra catalog/component/action và phát `ACTIVITY_SNAPSHOT openui-surface` chứa `source` tích lũy trên buyer SSE. Mất kết nối provider nối lại từ committed cursor; buyer nối lại theo thread cursor/snapshot. Kết thúc AG-UI run không có thẩm quyền chuyển tiền hoặc xác nhận giao kết quả.

Trạng thái kết nối tách khỏi trạng thái yêu cầu: chờ kết nối, đã phát, đã nhận, đang xử lý, chờ buyer, đang kiểm tra, đã giao, thất bại hoặc chưa rõ. Provider báo xong chỉ chuyển sang bước kiểm tra của M05.

Nếu provider offline sau thanh toán, yêu cầu vẫn được lưu và buyer thấy hạn xử lý. Nếu provider đã ACK rồi mất kết nối, Payvoke không tự tạo một lần chạy khác. Quá hạn mà không có kết quả thì M09 xử lý tranh chấp hoặc hoàn tiền.
