# M07 · Đăng bán và vận hành app

Provider đăng nhập bằng ví, tạo app và quản lý app đó trong Studio. Không bắt buộc manifest file. Mỗi app nêu công việc, command, dạng input, giới hạn, thời gian giao, dữ liệu xử lý, tác động bên ngoài và cách buyer nhận kết quả.

## App và visibility

Một app có tên, mô tả, payout address, visibility và danh sách command. Không còn `kind` agent/tool; mọi app đều dùng chung thread chat. App `PUBLIC` chưa archive xuất hiện trong store; app suspend vẫn hiển thị unavailable để giữ star nhưng không nhận quote/thread mới. App `PRIVATE` chỉ owner thấy và chat. Owner có thể đổi visibility bất cứ lúc nào mà không phá thread cũ.

Bot của provider đăng ký slash command (tên, mô tả, options gồm cả field file, điều khoản, trần giá tùy chọn) **chỉ qua API** ở [S01](../specs/01-api-and-provider-protocol.md), thường bằng một lệnh ghi đè cả danh sách như Discord. Studio chỉ hiển thị command. Command namespace theo app. Free text và slash command của buyer đều là interaction miễn phí gửi cho bot; bot trả lời bằng tin nhắn, form hoặc offer, và giá luôn đến từ offer.

Mỗi lần sửa schema, trần giá hoặc điều khoản tạo một command revision mới. Revision là bất biến; quote đã phát hành ghim revision cũ, nên thay đổi không ảnh hưởng invocation đang chạy hoặc lịch sử.

## API key và presence

Provider worker dùng bearer API key để đọc event, ACK, gửi report, stream AG-UI và ghi command. Mỗi app có tối đa một key active. Tạo key mới thu hồi key cũ trong cùng transaction; secret chỉ hiện một lần và backend chỉ lưu hash. Owner quản lý app bằng phiên đăng nhập ví mà không cần API key.

Worker gửi heartbeat qua kết nối event. Availability được suy ra, không do provider tự đặt: app phải `ACTIVE`, có default command và heartbeat trong 45 giây gần nhất. Mất heartbeat đưa app về offline; buyer vẫn đọc thread cũ nhưng không tạo quote mới.

## Giá, trạng thái và tạm dừng

Provider đặt giá gộp cố định bằng USDC cho từng command trên Avalanche Fuji C-Chain. Phí nền tảng được trừ từ doanh thu provider sau hoàn tiền; Studio hiển thị tỷ lệ phí và số thực nhận dự kiến. Trang app trong store hiển thị giá buyer trả mỗi lần gọi, điều khoản giao/sửa/hoàn, command và trạng thái online/offline. Provider không chọn token/chain khác hoặc đổi giá sau khi buyer gửi yêu cầu.

Provider có thể suspend, activate hoặc archive app:

- **Suspend** chặn quote và thread mới; app vẫn nằm trong store ở trạng thái unavailable để giữ star, còn thread cũ vẫn đọc được.
- **Activate** đưa app trở lại khi heartbeat đã có.
- **Archive** ẩn app khỏi Studio/store nhưng giữ lịch sử thread và biên nhận thanh toán.

Dừng bán không xóa nghĩa vụ giao hoặc hoàn cho các yêu cầu đang mở. Kết nối thành công không chứng minh chất lượng kết quả.
