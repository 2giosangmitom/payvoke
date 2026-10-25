# Payvoke

Payvoke là marketplace mua bán app AI, thanh toán bằng USDC theo từng lần gọi. Mỗi app dùng chung một giao diện chat, một danh sách thread và các slash command riêng.

## Language

**Buyer**:
Người dùng mua và sử dụng app bằng tài khoản gắn với ví của mình.

**Provider**:
Bên đăng bán và chịu trách nhiệm vận hành app, giao kết quả theo điều khoản.

**App**:
Đơn vị được bán và được chat trên Payvoke. App gồm tên, mô tả, payout address, visibility, command và presence. Mọi app dùng cùng một giao diện thread chat; không còn phân biệt agent và tool.
_Avoid_: Dùng “agent”, “tool” hoặc “sản phẩm” như ba loại app khác nhau.

**Provider app**:
Cách gọi app ở góc nhìn provider trong Studio. Không phải một model dữ liệu riêng; cùng một `App` ở store và dashboard.

**Command (slash command)**:
Chức năng có tên, schema tham số, giá và điều khoản thuộc một app. Command có id ổn định trong suốt vòng đời app; tên chỉ cần duy nhất trong app.
_Avoid_: Dùng “tool” để gọi một command.

**Command revision**:
Bản bất biến của command tại một thời điểm, chứa options, JSON Schema, giá, terms và thời hạn. Sửa command tạo revision mới. Quote ghim `commandRevisionId`, nên quote/invocation cũ không đổi khi provider sửa command.

**Default command**:
Command nhận free text khi buyer không gõ slash command. Free text được map vào tham số vị trí của default command; nếu default command không có tham số vị trí, UI mở form arguments.

**Thread (hội thoại)**:
Không gian chat gắn cố định với một buyer và đúng một app. Thread chứa tin nhắn, câu hỏi, revision, widget OpenUI và lịch sử invocation. Danh sách thread trộn mọi app và hỗ trợ đổi tên/archive.
_Avoid_: Dùng “phiên sử dụng”, “session” hoặc “phiên” để đồng thời chỉ đăng nhập, quyền chi và hội thoại.

**Availability**:
Trạng thái app có thể nhận quote mới hay không. App available khi `status = ACTIVE`, có default command và có heartbeat trong 45 giây gần nhất. App offline vẫn mở và đọc được thread cũ nhưng không nhận quote mới.

**Store**:
Danh mục công khai các app `PUBLIC` chưa archive, gồm `ACTIVE` và `SUSPENDED`; app suspend hiển thị unavailable để giữ star nhưng không nhận quote/thread mới. Store hiển thị command, giá, availability và lối mở thread. App `PRIVATE` không xuất hiện trong store.

**Studio / Dashboard**:
Khu vực owner quản lý app: settings, visibility, payout, command revision, default command, API key, suspend/activate/archive và mở chat thử.

**Provider API key**:
Bearer key cho worker của provider, dùng để đọc event, ACK, gửi report, stream AG-UI và ghi command. Mỗi app có tối đa một key active; tạo key mới thu hồi key cũ. Secret chỉ hiện một lần.

**Star / saved**:
Đánh dấu app để quay lại. Star không phải collection và không cấp quyền truy cập app `PRIVATE`.

**Lần gọi (invocation)**:
Một công việc đã chốt app, command revision, đầu vào, giá và điều khoản; trả lời câu hỏi hoặc sửa trong phạm vi đã mua không tạo lần gọi mới.

**Quote (báo giá)**:
Báo giá có thời hạn cho một lần gọi, do buyer yêu cầu trước khi trả tiền. Quote chốt command revision và input sau defaults. UI trình bày quote thành card ghim ngay trên composer; việc này chỉ đổi cách hiển thị, không đổi giao thức x402/vault.

**Spending grant (quyền chi)**:
Quyền buyer cấp onchain cho một khóa ký do client giữ. Grant độc lập với đăng nhập, thread và provider API key.

**Hold (khoản giữ)**:
Khoản tiền được dành riêng cho một invocation và chưa trả cho provider.

**Release / payout**:
Chuyển khoản đã giữ cho provider khi kết quả đạt mức bằng chứng tối thiểu trước hạn giao và đã hết thời gian review. Finance worker thực hiện tự động.

**Platform fee**:
Phần trăm Payvoke giữ lại trên doanh thu provider. Giá buyer thấy luôn là giá gộp; phí không do provider tự đặt.

**Artifact version**:
Một phiên bản kết quả đã được lưu và kiểm chứng. Buyer xem bản mới nhất đã được duyệt, không xem raw output chưa kiểm tra.

**Revision trong phạm vi**:
Một yêu cầu sửa kết quả đã giao, nằm trong `revisionPolicy.maxIncluded` và thời hạn review. Revision không tạo hold mới; sửa ngoài phạm vi phải mua invocation mới.

**Refund (hoàn tiền)**:
Trả toàn bộ khoản giữ về số dư buyer khi provider báo lỗi, không giao hoặc giao trễ. Payvoke không có quy trình tranh chấp chất lượng; finance worker hoàn tiền tự động theo các điều kiện kiểm chứng được.

**Reclaim**:
Buyer tự lấy lại phần còn giữ sau `resolveBy` khi chưa có quyết định hoàn/giải ngân nào, kể cả khi vault đang pause.

**PayvokeVault**:
Contract giữ USDC và thực thi grant, hold, release, refund theo chữ ký và điều kiện đã định.

**Protocol quote**:
Phần quote được ký/đưa vào thanh toán, giữ các field dây cũ như `sessionId`, `productId`, `productVersion` để tương thích x402/on-chain. Các field này map nội bộ sang thread, app và revision hiện tại; chúng không phải thuật ngữ UI.

**AG-UI**:
Giao thức event cho stream hội thoại giữa provider và UI buyer. Payvoke dùng để phát text tăng dần, trạng thái chạy và widget.

**OpenUI Lang**:
Ngôn ngữ giao diện khai báo theo dòng (`identifier = Component(...)`), thay A2UI v0.9.1 từ 25/10/2026. Provider stream các statement hoàn chỉnh trong `CUSTOM payvoke.openui`; Payvoke kiểm tra bằng parser `@openuidev/lang-core` theo catalog `packages/openui-components` rồi chiếu thành surface trong thread. OpenUI Lang không cấp quyền thực thi, gọi tool hoặc thanh toán.

**Continuation**:
Chu kỳ chạy mới trong cùng invocation sau khi buyer trả lời câu hỏi hoặc yêu cầu revision. Continuation dùng runId mới nhưng không tạo quote/hold mới.

**MCP bridge**:
Tiến trình local cho ứng dụng AI bên ngoài dùng chung API buyer. MCP không phải giao diện chat của Payvoke và không được thay đổi giá hoặc bỏ qua admission.

**Mức bằng chứng (evidence level)**:
Cấp độ bằng chứng giao hàng của một artifact version, theo thang `SELF` (provider tự báo) → `SIGN` (đúng schema, đúng key app) → `REC`/`WIT` (biên nhận hệ thống ngoài / người có quyền xác nhận; hai mức này không thay thế nhau). Command revision mang `terms.verification.minEvidence` (mặc định `SIGN`); finance không giải ngân khi bằng chứng thấp hơn mức này. Xem [M05](docs/modules/05-artifacts-and-verification.md).

**Evidence Envelope**:
Bản ghi bất biến của một lần quan sát giao hàng (invocation, artifact version, hash output, file, thời điểm giao, mức bằng chứng, verifier), canonicalize bằng JCS. Hash của nó cho phép tái tạo và đối chiếu đúng lần quan sát mà quyết định giải ngân đã dựa vào.

**Giá sàn (`minGrossAmount`)**:
Giá gộp tối thiểu, tính bằng atomic USDC, trong policy deployment đã duyệt, để mỗi lần gọi đủ bù gas hold + release do Payvoke trả. Command dưới sàn không được đăng và không nhận quote mới.

**Buyer độc lập đã xác minh**:
Đề xuất cho chỉ số store: buyer có invocation `DELIVERED` đã qua `releaseNotBefore`, không phải ví owner hoặc payout address của chính app. Dùng thay cho số invocation thô vì số giao dịch có thể làm giả khi platform trả gas. Xem [M09](docs/modules/09-reputation-and-operations.md).
