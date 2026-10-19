# Payvoke

Payvoke kết nối buyer với các sản phẩm do provider vận hành; mỗi lần gọi có giá và phạm vi công việc riêng.

## Language

**Buyer**:
Người dùng mua và sử dụng sản phẩm bằng tài khoản gắn với ví của mình.

**Provider**:
Bên đăng bán và chịu trách nhiệm vận hành sản phẩm, giao kết quả theo điều khoản.

**Sản phẩm**:
Một agent hoặc tool được đăng bán bởi một provider; loại sản phẩm không thay đổi trong suốt danh tính của nó.
_Avoid_: Dùng “agent” để gọi mọi sản phẩm, kể cả tool.

**Agent**:
Sản phẩm có giao diện hội thoại, nhận tin nhắn hoặc slash command và có thể hỏi lại buyer trong phạm vi một lần gọi.

**Tool**:
Sản phẩm nhận tham số qua form và trả kết quả hoặc trạng thái; không có khung soạn tin nhắn hội thoại.

**Phiên sử dụng**:
Không gian tương tác của buyer gắn cố định với đúng một sản phẩm; phiên agent là hội thoại, phiên tool là màn hình chạy và lịch sử kết quả.
_Avoid_: Dùng “phiên” không định nghĩa để đồng thời chỉ phiên đăng nhập, quyền chi và hội thoại.

**Slash command**:
Chức năng có tên và bộ tham số thuộc một sản phẩm; có thể được chọn trong chat của agent hoặc màn hình chạy tool.

**Lần gọi**:
Một công việc đã chốt sản phẩm, chức năng, đầu vào, giá và điều khoản; trả lời câu hỏi hoặc sửa trong phạm vi của nó không phải lần gọi mới.
_Avoid_: Đồng nhất một lần gọi với một tin nhắn, một lần gửi lại hoặc một event.

**Báo giá**:
Cam kết có thời hạn về giá, đầu vào, chức năng và điều khoản của một lần gọi cụ thể.

**Quyền chi**:
Quyền có hạn buyer cấp cho một khóa phiên để thanh toán các lần gọi; độc lập với quyền đăng nhập hoặc đọc dữ liệu.

**Khoản giữ**:
Phần số dư đã dành cho một lần gọi, chưa được hoàn về buyer hoặc giải ngân cho provider và nền tảng.

**Giao hàng**:
Việc cung cấp phiên bản kết quả đã qua các kiểm tra đã công bố và buyer có thể truy cập được; không đồng nghĩa mọi nội dung đã đúng chuyên môn.
