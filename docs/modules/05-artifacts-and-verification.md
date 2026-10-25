# M05 · Kết quả và giao hàng

Khi provider báo xong, Payvoke lưu đầu ra, kiểm tra điều kiện đã công bố và xác nhận buyer xem hoặc tải được trước khi đánh dấu đã giao. Kiểm tra kỹ thuật không chứng minh nội dung đúng chuyên môn.

Một yêu cầu có thể trả văn bản, dữ liệu có cấu trúc, ảnh hoặc file. Tiến độ tạm thời tách khỏi bản cuối. Mỗi lần sửa tạo phiên bản mới; bản cũ vẫn có trong lịch sử và hồ sơ tranh chấp.

Chat text được stream dần dưới dạng AG-UI và widget khai báo bằng OpenUI theo [S04](../specs/04-ag-ui-a2ui-streaming.md) là **bản xem trước**. Kết thúc `TEXT_MESSAGE_END` hoặc `RUN_FINISHED` chưa phải bằng chứng giao hàng. Report `result` chứa output theo schema và có thể tham chiếu OpenUI presentation đã kiểm tra catalog/permissions; chỉ M05 quyết định `VERIFYING → DELIVERED`. Nếu verification không đạt, UI phải hiển thị trạng thái thất bại/chờ sửa của preview; không dùng nó làm artifact chính thức hay dấu mốc review/payout.

File phải gắn với đúng ứng dụng và yêu cầu. Payvoke kiểm tra loại, kích thước, dữ liệu nhận đủ, khả năng mở và an toàn theo chính sách. URL bất kỳ do provider gửi không tự được coi là file đã giao. Bản thiếu hoặc nguy hiểm bị từ chối/cách ly.

Điều khoản sản phẩm quy định đầu ra và phép kiểm tra. Văn bản cần hiển thị an toàn; dữ liệu có cấu trúc phải đúng dạng; file phải đọc được. Nếu đầu ra thiếu hoặc kho file lỗi, yêu cầu chưa được đánh dấu đã giao và hạn buyer xem xét không được trôi trong lúc họ không truy cập được.

Khi giao, M05 ghi phiên bản và thời điểm; buyer có thể chấp nhận, yêu cầu sửa trong phạm vi đã trả tiền hoặc mở tranh chấp. Hết hạn xem xét chỉ được coi là hoàn tất theo điều khoản đã công bố, khác với việc buyer chủ động chấp nhận. Sửa vượt phạm vi cần lần gọi mới.

Quyền tải kiểm tra người xem ở mỗi lần truy cập. Link tạm thời không đưa lên trang công khai hoặc nhật ký phân tích. File được giữ theo thời hạn đã hứa; tranh chấp có thể tạm ngăn xóa.

## Mức bằng chứng trước khi giải ngân (đề xuất)

> Trạng thái: đề xuất từ nghiên cứu 25/10/2026, chưa có trong S01 bắt buộc và chưa có implementation. Hiện finance chỉ release khi có quan sát verifier tin cậy/thủ công (PAY-13 **Partial** trong [payment-acceptance](../payment-acceptance.md)).

TessPay [P7] và RAILS [P8] cùng chỉ ra rằng escrow chỉ an toàn khi quyết định giải ngân dựa trên bằng chứng có cấp độ rõ ràng, không phải trên lời provider tự báo. Payvoke đã có hình dạng "verify-then-pay": hold → `VERIFYING` → `DELIVERED` → quyết định finance có approver tách khỏi executor. Phần còn thiếu là định nghĩa _bằng chứng nào đủ_.

Đề xuất áp dụng thang bằng chứng của RAILS, rút gọn cho MVP:

| Lớp    | Nghĩa trong Payvoke                                                                 | Ví dụ                                                    |
| ------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `SELF` | Provider tự báo `result`                                                            | Report `result` chưa kiểm tra                            |
| `SIGN` | Output khớp `outputSchema`, gắn đúng app/invocation/artifactVersion, do key app gửi | Kết quả JSON đã qua verifier schema hiện có              |
| `REC`  | Biên nhận từ hệ thống không có lợi ích: file `READY` có checksum, buyer tải được    | Object storage xác nhận checksum; log truy cập của buyer |
| `WIT`  | Người có quyền xác nhận                                                             | Buyer chấp nhận; operator duyệt trong dispute            |
| `ATT`  | Attestation từ môi trường thực thi được tin cậy                                     | Ngoài MVP                                                |

`REC` và `WIT` không so sánh trực tiếp được: một bên chứng minh dữ liệu đã đến, bên kia chứng minh người nhận đồng ý.

Cách áp dụng:

1. Command revision khai báo `terms.verification.minEvidence` (mặc định `SIGN` cho output văn bản/JSON, `REC` khi có file). Thay đổi là revision mới, như mọi điều khoản khác (R03).
2. Mỗi artifact version lưu mức bằng chứng đạt được và một **Evidence Envelope**: hash của output, danh sách file/checksum, thời điểm giao do platform ghi, các quan sát verifier. Hash envelope là giá trị dùng cho `evidenceHash` khi buyer mở dispute onchain.
3. Finance chỉ tạo quyết định release khi mức đạt được ≥ `minEvidence` và đã qua `releaseNotBefore` theo S02. Thiếu bằng chứng trước `resolveBy` thì chuyển resolver/refund, không release (R04).

Thang này không chứng minh nội dung đúng chuyên môn; nó chỉ bảo đảm tiền không được giải ngân dựa trên bằng chứng yếu hơn mức đã hứa với buyer lúc ký quote. Chi tiết: [nghiên cứu agentic payments](../research/agentic-payments-literature.md#2-verify-then-pay-và-bằng-chứng-giao-hàng).
