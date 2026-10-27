# M03 · Giá mỗi lần gọi

Bot của provider báo giá gộp bằng USDC cho từng lần gọi qua **offer có cấu trúc**; command chỉ khai trần giá tùy chọn và điều khoản. Buyer chấp nhận offer thì Payvoke phát quote với đúng số tiền đó, sau khi kiểm tra giá sàn và trần. Parameters được validate và áp default trước khi chốt quote; giá không tăng ngầm theo token hay thời gian chạy, và mọi quote đều là một số tiền chính xác trước khi ký. Giá lưu bằng đơn vị nhỏ nhất của USDC (6 chữ số thập phân), không dùng số thực để tính tiền. Mỗi yêu cầu mới trừ đúng giá từ PayvokeVault; nạp USDC không phải mua số lượt. Phí nền tảng khấu trừ từ phần provider được nhận, không cộng thêm vào giá buyer đã thấy. Chi phí chạy, token hay thời gian xử lý của provider không làm đổi giá đã chốt. [Quote API S01](../specs/01-api-and-provider-protocol.md), [hash/điều khoản S02](../specs/02-x402-and-vault.md).

Trang sản phẩm cho thấy giá USDC trên Avalanche Fuji C-Chain, đầu vào/đầu ra, hạn giao, phạm vi sửa và điều kiện hoàn. Trước khi gửi, buyer thấy giá của yêu cầu, số dư còn lại sau khi trừ và dữ liệu sẽ chia sẻ. Không chọn số lượng lượt, token hoặc blockchain.

M03 lưu phiên bản giá và điều khoản khi buyer bắt đầu lần gọi. Giá mới chỉ áp dụng cho lần gọi mới. Báo giá hết hạn thì buyer phải xem giá lại; khoản đã trừ hợp lệ vẫn gắn với giá ban đầu.

Một lần gọi có một định danh, một chức năng/provider và một khoản trừ tiền. M06 xác nhận tiền trước khi M04 phát event. Buyer trả lời câu hỏi của provider hoặc yêu cầu sửa trong phạm vi đã hứa mà không trả thêm. Đổi mục tiêu hoặc tự gửi lệnh mới tạo khoản trừ mới nếu đủ số dư và còn trong giới hạn chi.

Làm mới trang, gửi lại thao tác, tải file hoặc nhận event phát lại không thu thêm tiền. Một khoản trừ không mở hai lần chạy. Khi sản phẩm bị dừng hoặc provider offline, Payvoke chặn yêu cầu mới theo chính sách bán hàng.

Trước khi trừ tiền, buyer có thể bỏ yêu cầu. Sau khi trừ, hủy chỉ là đề nghị dừng; M09 quyết định sửa hoặc hoàn theo điều khoản, M06 xử lý tiền. Không tự chạy lại yêu cầu nếu provider có thể đã thực hiện tác động bên ngoài.

## Vì sao giá chốt trước khi ký

Ling et al. [P2] chứng minh rằng với dịch vụ có tính toán ẩn (thinking tokens), không cách tính giá chỉ theo output nào vừa công bằng với buyer trung thực vừa chống được việc provider thổi phồng phần ẩn; khoảng thao túng họ ước tính là 35–3.213× trên 10 model. Giá chốt trong quote trước khi chạy loại bỏ hẳn đòn bẩy này: bot báo giá trên phạm vi đã trao đổi, buyer thấy và ký trước, nên provider không thể làm hoá đơn tăng bằng cách "nghĩ nhiều hơn". Cũng vì vậy Payvoke không có scheme kiểu `upto` (trả tối đa rồi quyết toán số thực tế) và không gặp lỗi allowance overdraft mà paper mô tả.

Giá quá nhỏ vẫn có rủi ro: Payvoke trả gas cho `reserveHold` và release, nên một command giá vài atomic USDC có thể tốn gas hơn giá trị thu được. Vì vậy policy deployment có **giá sàn mỗi command** (`minGrossAmount`, atomic USDC) so với chi phí gas ước tính (R02, quy tắc SR5 của [P1]). Command dưới sàn không tạo được revision; nâng sàn sau đó thì revision cũ dưới sàn không nhận quote mới. Con số sàn thực tế cho Fuji vẫn phải được chủ dự án duyệt cùng policy (T089). Chi tiết: [nghiên cứu agentic payments](../research/agentic-payments-literature.md).
