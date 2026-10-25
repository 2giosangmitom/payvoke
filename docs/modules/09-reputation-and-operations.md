# M09 · Đánh giá và vận hành

Buyer đánh giá một lần gọi đã trả tiền và được giao kết quả. Đánh giá gắn với phiên bản sản phẩm; sửa đánh giá giữ lịch sử cần thiết. Trang sản phẩm tách mẫu do provider đăng khỏi đánh giá buyer và hiện số lượng đánh giá. Dấu hiệu tự mua hoặc đánh giá phối hợp được chuyển kiểm duyệt, không xóa bằng chứng giao hàng.

## Không phân xử chất lượng

Payvoke không có quy trình tranh chấp. Chất lượng nội dung khó kiểm chứng khách quan và chi phí xét duyệt thủ công vượt xa giá một lần gọi, nên chất lượng dựa vào uy tín provider và đánh giá của buyer. Phần tiền chỉ xử lý những gì kiểm chứng được: finance worker tự hoàn toàn bộ khi provider báo lỗi, không giao hoặc giao trễ, và tự giải ngân khi kết quả đạt mức bằng chứng tối thiểu đúng hạn và đã hết review window (S02 §8.5). Buyer không hài lòng về chất lượng thì đánh giá thấp hoặc ngừng dùng app.

## Sự cố

Operator có thể dừng bán, khóa key lộ, giữ payout và thông báo người bị ảnh hưởng. Mọi hành động có người thực hiện, lý do, thời điểm và điều kiện mở lại. Quyền đọc dữ liệu buyer có phạm vi và thời hạn; không âm thầm đăng nhập thay buyer.

Provider offline thì dừng yêu cầu mới theo chính sách, nhưng vẫn theo dõi hạn giao của yêu cầu đã trả. Nếu kết quả chưa rõ, điều tra trước khi phát lại; nếu thiếu nguồn hoàn, dừng bán để khoản nợ không tăng. Khi mất dữ liệu, khôi phục lịch sử và đối chiếu PayvokeVault trên Fuji trước khi mở lại. Quyền duyệt sản phẩm và các khóa tài chính tự động (approver, executor) tách riêng.

## Chỉ số đáng tin và chống thao túng (đề xuất)

Đo lường trên Base [P6] cho thấy số settlement x402 là chỉ số dễ làm giả nhất: 21,20% là thanh toán giả và 63,78% là thanh toán nội bộ trong cụm ví liên kết, vì facilitator trả gas. Payvoke cũng trả gas cho `reserveHold`, nên cùng rủi ro áp dụng. Đề xuất (R05):

- Store không hiển thị tổng số invocation thô làm chỉ số uy tín. Thay vào đó hiển thị số **buyer độc lập** có invocation đã `DELIVERED` và đã qua `releaseNotBefore`, loại trừ ví owner và payout address của chính app.
- Điểm rating gắn với command revision và tính theo posterior có chiết khấu thời gian (như cập nhật Beta của LEGIT [P13]) thay vì trung bình thô, để vài đánh giá mới không lấn át lịch sử và đánh giá cũ dần mất trọng lượng.
- Cân nhắc yêu cầu provider đặt cọc USDC trước khi xuất hiện trong xếp hạng công khai (R06). LEGIT [P13] chỉ ra deposit buộc kẻ tấn công Sybil phải khoá vốn tỷ lệ với số danh tính. Xếp hạng store không dựa trên văn bản provider tự viết để tránh steering [P3, P12].

## Phân loại tự động incident (đề xuất)

Agentic Commerce Bench [P11] đo giá trung vị một giao dịch agent là 0,007 USD; một lần review thủ công tốn gấp 143 lần giá trị đó. Paper cũng chia tín hiệu gian lận theo mức quan sát L0–L4. Với Payvoke, giá cố định đã chặn kiểu "tính cao hơn giá niêm yết"; tín hiệu hữu ích còn lại nằm ở lịch sử provider (L3) và policy grant của buyer (L4). Đề xuất (R08): tính tự động các tín hiệu như tỷ lệ `FAILED`/`UNKNOWN`, tỷ lệ hoàn tiền và revision theo app, câu hỏi bất thường xin thêm dữ liệu; operator xem xét dừng bán app khi tín hiệu vượt ngưỡng được duyệt. Tín hiệu không thay đổi quyết định hoàn/giải ngân của từng lần gọi. Chi tiết: [nghiên cứu agentic payments](../research/agentic-payments-literature.md).
