# M08 · Client bên ngoài

Client dùng cùng sản phẩm, số dư PayvokeVault và trạng thái với web. [S03](../specs/03-mcp-client.md) chốt MCP local qua stdio để ứng dụng AI sử dụng, phụ thuộc buyer API/payment core; không bắt buộc phải hoàn thành toàn bộ UI web mới xây adapter. Không có số dư riêng cho client; mỗi invocation mới vẫn có khoản giữ tiền riêng.

MCP cung cấp tools tĩnh để tìm app, xem command/options, tạo thread, chuẩn bị quote, submit, đọc trạng thái/kết quả và tiếp tục invocation. Provider slash command không phải MCP prompt, không mặc định host hiện slash UI. Mỗi thread gắn một app; mọi app dùng chung giao diện chat, command không có tham số vị trí mở form.

Buyer đăng nhập bằng ví để cấp cho client quyền có thời hạn theo app và hành động: tìm app, đọc dữ liệu, chuẩn bị lần gọi, gửi yêu cầu trả phí hoặc xem kết quả. Client không nhận khóa ví chính. Muốn trả phí, client cần khóa phiên riêng được buyer đăng ký trong PayvokeVault và quyền gửi yêu cầu trong Payvoke; cả hai đều có thể thu hồi.

Trong MVP, bridge giữ khóa chi trên máy buyer và pairing qua web đăng nhập ví để nhận API token có scope giới hạn. Token không thay thế grant onchain. S03 yêu cầu buyer duyệt quote qua CLI local ngoài model trước khi chi; `confirmed:true` trong tool argument không được coi là sự đồng ý. Remote MCP giữ khóa buyer và remote paid submit nằm ngoài MVP; không chuyển khóa lên server.

Buyer cấp hoặc thay đổi giới hạn chi onchain qua ví trên web. Sau đó client có quyền phù hợp ký chứng từ x402 bằng khóa phiên khi buyer gửi yêu cầu, không bật ví chính mỗi lần. Client phải hiện giá, input và số dư còn lại; nếu chưa có quyền chi hoặc không đủ tiền, nó đưa buyer về web để nạp tiền hoặc cập nhật giới hạn. Client x402 bên ngoài phải triển khai scheme riêng của Payvoke.

Buyer có thể chuẩn bị trên client rồi xem kết quả ở cả hai nơi. Gửi lại cùng thao tác không thu thêm tiền hoặc phát thêm event. Client có thể hiển thị kết quả dạng form và file qua quyền tải riêng. Nếu không hỗ trợ một bước bắt buộc, client chuyển buyer về web.

Thu hồi quyền chặn thao tác mới từ client, không xóa tin nhắn, khoản đã trả hoặc quyền hoàn. Payvoke lưu lịch sử client nào đã thao tác trên tài khoản.

## Gợi ý theo ngân sách và prompt injection

Red-team AP2 [P12] cho thấy mandate có chữ ký chỉ bảo đảm _thực thi_ đúng; nội dung mô tả sản phẩm vẫn thao túng được _quyết định_ của agent (100% thành công trong thử nghiệm xếp hạng). Điều này củng cố hai quy tắc đã có của S03: approval chi tiền nằm ngoài model, và mô tả command/output provider là dữ liệu không tin cậy. Bridge không chuyển mô tả app thành chỉ dẫn cho model, và không xếp hạng app theo văn bản provider tự viết.

402Pilot [P10] đề xuất một lớp quyết định phía buyer chọn provider dưới áp lực ngân sách ví. Payvoke có thể thêm tính năng tương tự ở dạng **tư vấn** (R07): khi buyer hoặc AI host tìm app, bridge/store trả kèm gợi ý dựa trên rating đã xác minh, giá command và hạn mức grant còn lại trong kỳ. Gợi ý không được tự tạo quote, tự ký hoặc thay bước approve-quote ngoài model. Chi tiết: [nghiên cứu agentic payments](../research/agentic-payments-literature.md#3-phía-buyer-ra-quyết-định-gian-lận-prompt-injection).
