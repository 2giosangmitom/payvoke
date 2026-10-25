# M05 · Kết quả và giao hàng

Khi provider báo xong, Payvoke lưu đầu ra, kiểm tra điều kiện đã công bố và xác nhận buyer xem hoặc tải được trước khi đánh dấu đã giao. Kiểm tra kỹ thuật không chứng minh nội dung đúng chuyên môn.

Một yêu cầu có thể trả văn bản, dữ liệu có cấu trúc, ảnh hoặc file. Tiến độ tạm thời tách khỏi bản cuối. Mỗi lần sửa tạo phiên bản mới; bản cũ vẫn có trong lịch sử.

Chat text được stream dần dưới dạng AG-UI và widget khai báo bằng OpenUI theo [S04](../specs/04-ag-ui-a2ui-streaming.md) là **bản xem trước**. Kết thúc `TEXT_MESSAGE_END` hoặc `RUN_FINISHED` chưa phải bằng chứng giao hàng. Report `result` chứa output theo schema và có thể tham chiếu OpenUI presentation đã kiểm tra catalog/permissions; chỉ M05 quyết định `VERIFYING → DELIVERED`. Nếu verification không đạt, UI phải hiển thị trạng thái thất bại/chờ sửa của preview; không dùng nó làm artifact chính thức hay dấu mốc review/payout.

File phải gắn với đúng ứng dụng và yêu cầu. Payvoke kiểm tra loại, kích thước, dữ liệu nhận đủ, khả năng mở và an toàn theo chính sách. URL bất kỳ do provider gửi không tự được coi là file đã giao. Bản thiếu hoặc nguy hiểm bị từ chối/cách ly.

Điều khoản sản phẩm quy định đầu ra và phép kiểm tra. Văn bản cần hiển thị an toàn; dữ liệu có cấu trúc phải đúng dạng; file phải đọc được. Nếu đầu ra thiếu hoặc kho file lỗi, yêu cầu chưa được đánh dấu đã giao và hạn buyer xem xét không được trôi trong lúc họ không truy cập được.

Khi giao, M05 ghi phiên bản và thời điểm; buyer có thể chấp nhận hoặc yêu cầu sửa trong phạm vi đã trả tiền. Hết hạn xem xét chỉ được coi là hoàn tất theo điều khoản đã công bố, khác với việc buyer chủ động chấp nhận. Sửa vượt phạm vi cần lần gọi mới.

Quyền tải kiểm tra người xem ở mỗi lần truy cập. Link tạm thời không đưa lên trang công khai hoặc nhật ký phân tích. File được giữ theo thời hạn đã hứa.

## Mức bằng chứng trước khi giải ngân

> Trạng thái 25/10/2026: đã có code và test local (R03/R04). Mức `SIGN` do verifier structured JSON ghi; `WIT`/`REC` hiện chỉ đến từ attestation thủ công có kiểm soát. `REC` tự động cho file vẫn chờ file verifier, nên PAY-13 trong [payment-acceptance](../payment-acceptance.md) vẫn là **Partial**.

TessPay [P7] và RAILS [P8] cùng chỉ ra rằng escrow chỉ an toàn khi quyết định giải ngân dựa trên bằng chứng có cấp độ rõ ràng, không phải trên lời provider tự báo. Payvoke có hình dạng "verify-then-pay": hold → `VERIFYING` → `DELIVERED` → quyết định finance có approver tách khỏi executor. Thang bằng chứng dưới đây định nghĩa _bằng chứng nào đủ_.

Thang bằng chứng, rút gọn từ RAILS cho MVP:

| Lớp    | Nghĩa trong Payvoke                                                                 | Nguồn hiện có                                          |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `SELF` | Provider tự báo `result`                                                            | Report `result` chưa kiểm tra; không bao giờ được ghi  |
| `SIGN` | Output khớp `outputSchema`, gắn đúng app/invocation/artifactVersion, do key app gửi | Verifier structured JSON của host                      |
| `REC`  | Biên nhận từ hệ thống không có lợi ích: file `READY` có checksum, buyer tải được    | Attestation thủ công; file verifier tự động chưa có    |
| `WIT`  | Người có quyền xác nhận                                                             | Attestation thủ công (buyer chấp nhận, operator duyệt) |
| `ATT`  | Attestation từ môi trường thực thi được tin cậy                                     | Ngoài MVP                                              |

Thứ tự là `SELF < SIGN < {REC, WIT} < ATT`. `REC` và `WIT` không so sánh trực tiếp được: một bên chứng minh dữ liệu đã đến, bên kia chứng minh người nhận đồng ý. Vì vậy `minEvidence: REC` không được thoả bằng `WIT`.

Quy tắc:

1. Command revision mang `terms.verification.minEvidence` (`SIGN` hoặc `REC`). Provider không khai báo thì server điền `SIGN` trước khi lưu revision, nên giá trị này luôn đi vào `termsHash`. TermsSnapshot vì vậy có `schemaVersion: 2`. Đổi mức là revision mới, như mọi điều khoản khác.
2. Mỗi quan sát giao hàng lưu mức bằng chứng đạt được và một **Evidence Envelope** bất biến, canonicalize bằng JCS: invocation, artifact version, hash output, danh sách file, thời điểm giao do platform ghi, mức bằng chứng, verifier và thời gian buyer không truy cập được. Hash của envelope tái tạo được từ bản lưu và ổn định khi replay.
3. Finance chỉ tạo và thực thi quyết định release khi mức của evidence mới nhất thoả `minEvidence` (lỗi `evidence_below_minimum`) và đã qua review window theo S02. Thiếu bằng chứng đạt chuẩn trước `deliveryDeadline` thì finance worker hoàn tiền tự động (hoặc buyer reclaim sau `resolveBy`), không release.

Thang này không chứng minh nội dung đúng chuyên môn; nó chỉ bảo đảm tiền không được giải ngân dựa trên bằng chứng yếu hơn mức đã hứa với buyer lúc ký quote. Chi tiết: [nghiên cứu agentic payments](../research/agentic-payments-literature.md#2-verify-then-pay-và-bằng-chứng-giao-hàng).
