# M01 · Danh tính và quyền truy cập

Một ví đã xác minh tương ứng một tài khoản. Tài khoản có thể vừa mua vừa bán; quyền operator được cấp riêng.

## Đăng nhập

Người dùng kết nối ví trên Avalanche Fuji C-Chain và ký yêu cầu đăng nhập có thời hạn, dùng một lần, gắn với Payvoke và Fuji. Chữ ký này chỉ tạo phiên đăng nhập; quyền chi từ PayvokeVault là bước riêng. Buyer dùng ví đăng ký khóa phiên với hạn mức, thời hạn và quyền thu hồi; khóa phiên tạo chứng từ x402 khi buyer gửi yêu cầu mà không bật ví lần nữa. Ví ở mạng khác phải chuyển sang Fuji trước khi đăng nhập hoặc nạp tiền.

Không có email, mật khẩu hay đăng nhập mạng xã hội. Đổi ví là đổi tài khoản: lịch sử, sản phẩm và quyền operator không tự chuyển. Phiên hết hạn thì ký lại bằng ví cũ.

Số dư và quyền chi gắn với ví đăng nhập. Đổi ví hoặc thiết bị trước khi gửi yêu cầu thì buyer phải dùng đúng khóa phiên đã cấp hoặc tạo khóa mới bằng ví của mình. Lần gọi đã trả, quyền xem kết quả và tranh chấp vẫn thuộc ví cũ; tiền hoàn về số dư của ví đó trong PayvokeVault.

## Phân quyền

Buyer chỉ xem workspace, tin nhắn và file của mình. Provider chỉ nhận dữ liệu buyer chọn gửi. API key của provider cho phép kết nối, không thay phiên đăng nhập ví.

Operator cũng đăng nhập bằng ví. Quyền xét duyệt, hỗ trợ, tranh chấp và tài chính được cấp, thu hồi và ghi lịch sử riêng. Tài khoản bị khóa không tạo giao dịch mới nhưng vẫn cần lối hỗ trợ cho khoản đã trả.

Mất ví không đủ căn cứ để chuyển tài khoản sang ví mới. Phải chốt chính sách xử lý trước khi bật thanh toán.
