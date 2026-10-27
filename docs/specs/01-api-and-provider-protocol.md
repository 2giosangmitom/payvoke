# S01 · Quy tắc API, slash commands và giao job cho provider

Trạng thái: đặc tả MVP để triển khai, khởi tạo 19/10/2026; cập nhật mô hình app/thread/command revision và streaming 23/10/2026; thêm app kind, chat trước khi trả và offer 28/10/2026. MUST/không được là yêu cầu bắt buộc khi nghiệm thu. Thuật ngữ: [GLOSSARY](../../GLOSSARY.md). Thanh toán: [S02](02-x402-and-vault.md). MCP: [S03](03-mcp-client.md). Chat streaming và widget: [S04](04-ag-ui-a2ui-streaming.md).

**Nguồn sự thật cho routes:** tài liệu này chỉ mô tả quy tắc nghiệp vụ, quyền, idempotency và state machine. Danh sách route, method, path, request/response body và mã lỗi cụ thể **không được ghi tay ở đây**; đọc trực tiếp từ code trong `apps/api/src/modules/*` (và OpenAPI sinh từ code khi có). Khi code và tài liệu khác nhau về hình dạng route, code đúng; khi khác nhau về quy tắc nghiệp vụ, đó là lỗi cần sửa một trong hai.

## 1. Mô hình nghiệp vụ đã chốt

- Mỗi đơn vị được bán là một `App`, không còn `ProviderApp` tách khỏi `Product`. App có `kind` cố định từ lúc tạo:
  - `TOOL`: mỗi command có **giá cố định**. Buyer chạy tool bằng form sinh từ input schema; mỗi lần chạy là một thread riêng. Giá biết trước nên MCP/agent mua tự động dùng được.
  - `AGENT`: command **không có giá cố định**, chỉ công bố khoảng giá `[minGrossAmount, maxGrossAmount]`. Buyer chat miễn phí với provider trước khi trả (§6.5); provider gửi **offer có cấu trúc** và buyer chấp nhận thì Payvoke mới phát quote từ offer đó.
- Một `ChatThread` (`threadId`) thuộc một buyer và **đúng một appId**, không đổi app giữa thread. Mở app khác tạo thread mới; không tự mang lịch sử/file sang.
- App có nhiều `AppCommand`; mỗi command có `id` ổn định và một `AppCommandRevision` đang active. Sửa definition tạo revision mới, không sửa revision đã dùng cho quote.
- Với TOOL, free text map vào tham số vị trí của command đang chọn/default. Với AGENT, free text là tin nhắn trước khi trả cho provider đọc; slash command vẫn dùng để chọn loại việc và tham số (validate theo schema) nhưng không quyết định giá. Gõ `/` mở danh sách command của chính app. Command không có tham số vị trí mở form arguments. Backend chỉ nhận `commandId + arguments` hoặc `offerId`, không thực thi raw slash text.
- App có thể `PUBLIC` (xuất hiện trong store) hoặc `PRIVATE` (chỉ owner thấy/chat). Availability suy ra từ `status = ACTIVE`, có default command và heartbeat trong 45 giây gần nhất; provider không tự đặt cờ available.
- Chat nhận **AG-UI text events** và widget **OpenUI Lang** trong cùng stream. Payload đang stream là preview; chỉ kết quả qua verification mới được giao. Hợp đồng bổ sung tại S04.
- Một thread chỉ có **một invocation đang thực thi/chờ xử lý** ở MVP; `WAITING_BUYER`/`VERIFYING`/`UNKNOWN` vẫn chiếm slot. `DELIVERED`/`FAILED`/`CANCELLED` giải phóng execution slot dù tiền có thể còn HELD chờ review/refund. Gửi thêm lời nhắn không có question/revision context không tự được xem là trả lời miễn phí.
- Mỗi invocation mới có một command revision, quote, bộ input bất biến và khoản giữ tiền riêng. Provider hỏi lại, buyer trả lời đúng question hoặc sửa trong phạm vi policy không tạo quote/charge mới.
- Payvoke tính tiền theo invocation, không theo tin nhắn hoặc token. Tin nhắn trước khi trả của AGENT miễn phí nhưng có giới hạn. Trước mỗi lần tính phí mới, UI phải thể hiện giá, dữ liệu gửi và quyền chi áp dụng; giá luôn đến từ quote do Payvoke phát, không từ text của provider.

`threadId` là định danh hội thoại nội bộ. Quote document và protocol on-chain vẫn giữ các field dây cũ `sessionId`, `productId`, `productVersion` để tương thích x402/vault; `sessionId` map bằng `threadId`, `productId` map bằng `appId`, `productVersion` hiện là `1`. Đây là chi tiết tương thích, không phải thuật ngữ UI.

## 2. Quy ước chung

- HTTPS, JSON UTF-8, có version prefix. Timestamp RFC 3339 ở API nghiệp vụ; các field signed/onchain dùng Unix seconds nguyên được S02 quy định.
- ID là chuỗi opaque, phân biệt hoa/thường, do server cấp trừ `clientRequestId`/`reportId` do client cấp. Không tự trim/đổi case ID. ID của command ổn định qua các revision; definition của command được snapshot trong command revision.
- Tiền là chuỗi decimal atomic USDC không dấu/chấm, ví dụ `"10000"` = 0,01 USDC. Không dùng float; `feeBps` là integer.
- `Idempotency-Key` bắt buộc trên thao tác thay đổi nghiệp vụ. Giá trị phải bằng `clientRequestId` nếu body có field này; provider report dùng reportId, ACK dùng eventId. Auth challenge/login/pairing/token exchange có single-use semantics riêng, không replay secret qua idempotency cache. Server lưu theo `(principal, operation, key)` và hash normalized body; khác body cùng key là conflict.
- Riêng quote/paid submission tiếp tục có uniqueness theo invocation trong S02, không phụ thuộc TTL của HTTP idempotency cache. Không xóa payment dedupe record khi hết cache.
- Collection phân trang bằng cursor opaque thuộc cùng principal/filter, có giới hạn kích thước trang. Mọi thao tác đọc kiểm tra ownership, không xem biết ID là đủ quyền.
- Không echo signature, token hoặc signed URL trong lỗi/log.
- Phân loại lỗi: chưa xác thực, không đủ quyền, không thấy/không có quyền đọc tài nguyên của người khác (không phân biệt hai trường hợp), conflict state/version, quote hết hạn, input sai, rate limit, dependency tạm không khả dụng. Payment pending có xử lý riêng trong S02, không mặc định là unpaid.
- Request body và payment headers có size limit cấu hình; không đợi tới lúc gửi tx mới phát hiện input không hợp lệ.

## 3. Identity và quyền

### 3.1 Web đăng nhập bằng ví

- Đăng nhập theo SIWE: server cấp nonce một lần (TTL 5 phút) kèm cookie ràng buộc trình duyệt; client tạo và ký message với domain/URI Payvoke, Fuji 43113, issued/expiry tối đa 5 phút; server xác minh rồi cấp session cookie HttpOnly/Secure.
- Đăng xuất thu hồi session và xóa cookie; không tự revoke grant onchain.
- Thông tin buyer hiện tại trả buyer, scopes/roles; không trả khóa hoặc bearer token.

Cookie request thay đổi dữ liệu phải kiểm tra Origin/CSRF; CORS allowlist chính xác, không wildcard credentials. MVP hỗ trợ ví EOA đã deploy tài khoản thông thường; hỗ trợ contract wallet cần test ERC-1271 riêng, không giả định mọi SIWE library hỗ trợ. Đăng nhập không cấp quyền debit vault. [R1]

Auth dùng Better Auth 1.7.11 + SIWE plugin + Prisma adapter; viem verify chữ ký EOA. Nonce một lần bị consume cả khi verify thất bại; retry cần nonce mới. Session native lưu token trong bảng auth riêng, cookie được ký; không bật bearer plugin, không dùng session token làm authorization chi tiền. `User.id` là buyer ID; `Account` chỉ là tài khoản provider đăng nhập của Better Auth, địa chỉ ví nằm trong `WalletAddress`. Session TTL 7 ngày, không refresh/cookie cache; đọc thông tin buyer kiểm tra suspension của User và không trả token. API auth cũ không chạy song song; initial migration mới chỉ dành cho DB trống.

### 3.2 External buyer client

Scoped bearer token là **quyền gọi API**, không phải quyền chi. Các scope: `catalog:read`, `workspace:read`, `invocation:prepare`, `invocation:submit`, `invocation:read`, `invocation:continue`. Token ràng buộc buyer/client/workspace, expiry, revocation; quy trình cấp cho MCP local ở S03. Không dùng provider API key để mua hàng.

### 3.3 Provider

API key chỉ cho một app và scopes: `products:write`, `events:read`, `events:ack`, `reports:write`, `files:write`, `messages:write` (trả lời chat trước khi trả), `offers:write` (gửi/rút offer). Secret chỉ hiện lúc cấp, lưu hash ở server, prefix cho nhận dạng; log redact. Chủ app (phiên ví) tạo/rotate/revoke key.

Mỗi app có tối đa **một key active**. Tạo key mới thu hồi key cũ trong cùng transaction; rotate không trả lại secret cũ. Key không được đổi payout wallet hoặc operator role; thay payout cần chủ app xác thực ví.

Chủ app quản lý bằng phiên ví: tạo app (idempotent theo `clientRequestId`), xem/sửa name/description/visibility/payout, cấp/thu hồi key, suspend/activate và archive app.

Mất response lúc cấp key thì revoke record đó và cấp key mới, không lưu plaintext secret để replay. Không provider key nào tự tạo key quyền lớn hơn. External client authorization/pairing theo [S03 §5](03-mcp-client.md#5-pairing-wallet-based-nhỏ-nhất-và-thu-hồi).

## 4. Đăng ký app và slash command

Provider có thể dùng Studio hoặc API; cả hai đi qua cùng validation. App tự xuất hiện trong store khi `PUBLIC` và chưa archive; app suspend vẫn hiển thị unavailable để giữ star nhưng không nhận quote/thread mới. Không có bước operator review.

### 4.1 App, command và revision

`appId` bất biến về owner. Command id bất biến; mọi thay đổi options, schema, giá, terms hoặc thời hạn tạo revision mới. Quote ghim `commandRevisionId`; không sửa revision đang phục vụ.

- Sửa command có thể kèm revision mong đợi; lệch revision là conflict, không ghi đè.
- Mỗi app có một default command. Archive command không xóa revision lịch sử.
- Suspend dừng quote mới, không xóa nghĩa vụ job cũ. Activate bật lại app nhưng vẫn cần heartbeat để available. Archive giữ thread và biên nhận.
- Thao tác provider yêu cầu key đúng app hoặc phiên owner; key không đọc/ghi app khác. Studio cho owner quản lý mà không cần tạo API key.

### 4.2 Command payload

Field bắt buộc: `name,description,options,terms` và giá theo kind của app: TOOL gửi `grossAmount` (không có min/max); AGENT gửi `minGrossAmount` và `maxGrossAmount` (không có `grossAmount`, `min ≤ max`). Sai tổ hợp trả `INVALID_TERMS`. Field tùy chọn: `positionalParameter`, `outputSchema`, revision mong đợi khi sửa. Mọi invocation đều là **paid invocation**; không có flag miễn phí hoặc bypass x402.

- `name`: không có dấu `/`, regex `^[a-z][a-z0-9_]{0,31}$`; namespace theo app. Cùng `/summarize` ở hai app là hai command khác nhau.
- Dành riêng `help`, `cancel`, `status` cho UI điều hướng; UI action miễn phí không được biến thành provider invocation.
- `options`: mảng `{name,description,type,required}` với type `STRING|INTEGER|NUMBER|BOOLEAN`; server compile thành JSON Schema input và lưu cả options để render form.
- `inputSchema`/`outputSchema`: JSON Schema 2020-12, root object. Schema depth/size/item limits do server cap. Không `$ref` remote, code hoặc regex không kiểm soát.
- Defaults chỉ áp một lần lúc chuẩn bị quote. Lưu effective arguments và hash chính bản đó; không áp default mới ở paid retry.
- `positionalParameter` nếu có phải là một string option. Free text được map vào đó; nếu không có, buyer nhập bằng form.
- `terms`: `{deliverySeconds,reviewSeconds,revisionPolicy,refundPolicy,sideEffects,dataUse,verification?}`. `revisionPolicy` phải có `{maxIncluded,description}`.
- `terms.verification`: `{minEvidence}` với `SIGN` hoặc `REC` ở MVP, là mức bằng chứng tối thiểu trước khi được giải ngân; thiếu thì server điền `SIGN` trước khi lưu revision. Field này đi vào `termsHash` (TermsSnapshot `schemaVersion: 2`). Ngữ nghĩa ở [M05](../modules/05-artifacts-and-verification.md#mức-bằng-chứng-trước-khi-giải-ngân).
- `grossAmount` (TOOL) hoặc `minGrossAmount` (AGENT) dương, atomic USDC, nằm trong cap policy và không thấp hơn `minGrossAmount` của policy đang active (giá sàn so với gas hold + release do Payvoke trả). Dưới sàn thì tạo/sửa command bị từ chối; nếu policy nâng sàn sau khi revision đã đăng, revision/offer đó không nhận quote mới.

Ví dụ command:

```json
{
  "name": "summarize",
  "description": "Tạo bản tóm tắt theo ngôn ngữ và độ dài đã chọn",
  "options": [
    { "name": "text", "description": "Văn bản cần tóm tắt", "type": "STRING", "required": true },
    { "name": "language", "description": "vi hoặc en", "type": "STRING", "required": false },
    { "name": "maxWords", "description": "Số từ tối đa", "type": "INTEGER", "required": false }
  ],
  "positionalParameter": "text",
  "grossAmount": "10000",
  "terms": {
    "deliverySeconds": 600,
    "reviewSeconds": 86400,
    "revisionPolicy": { "maxIncluded": 1, "description": "Một lần sửa tóm tắt cùng văn bản" },
    "refundPolicy": "Lỗi, không giao hoặc giao trễ thì hoàn toàn bộ",
    "sideEffects": "none",
    "dataUse": "Chỉ dùng input cho yêu cầu này"
  }
}
```

Giá và thời gian trong ví dụ là fixture minh họa, không phải policy kinh tế đã bật.

### 4.3 Cách nhập slash parameters

- Composer lấy command của app hiện tại. Gõ `/` mở palette; chọn command không có tham số vị trí thì mở form options.
- Text shortcut hỗ trợ `/name` theo sau là positional string; object/array phức tạp nhập qua form.
- UI chuyển shortcut thành `commandId + arguments` trước khi gọi API. **Backend không thực thi raw slash string**, không shell eval và không nhờ LLM đoán command hay giá.
- TOOL: free text chỉ map vào `positionalParameter` của command đang chọn/default; không tự gọi command khác hoặc app khác.
- AGENT: free text gửi thành tin nhắn trước khi trả. Slash command gửi kèm `commandId + arguments` (đã validate) để provider biết loại việc; giá vẫn chỉ do offer quyết định.

## 5. Buyer API

### 5.1 Catalog, thread và star

- Catalog chỉ gồm app `PUBLIC` chưa archive, cả `ACTIVE` lẫn `SUSPENDED`, kèm `kind`, availability, giá thấp nhất (`fromPrice`, TOOL) và khoảng giá (`priceRange`, AGENT); có thể lọc theo star. App `PRIVATE` chỉ owner xem được.
- Tạo thread cần app `ACTIVE` và chưa archive; idempotent theo `clientRequestId`; không charge.
- Danh sách thread của buyer trộn mọi app, lọc được theo `kind`. Buyer đổi tên hoặc archive thread; archive vẫn đọc được lịch sử.
- Buyer liệt kê các invocation đã trả của mình (`GET /v1/invocations`, phân trang) kèm trạng thái tiền, execution và các deadline để làm trang activity.
- Buyer đọc sự kiện AG-UI và snapshot của thread theo S04.

Thread khóa app nhưng **không khóa mọi lần gọi vào một revision vĩnh viễn**. Khi command được sửa, quote mới dùng revision hiện hành; invocation cũ luôn dùng revision cũ. Command bị archive không chạy nếu chưa có quote còn hợp lệ.

Star là danh sách app yêu thích riêng của buyer. Collection không còn trong UI MVP; star vẫn giữ. App suspend giữ star nhưng hiển thị unavailable.

### 5.2 Chuẩn bị quote và bắt đầu invocation

Chuẩn bị quote nhận `threadId`, `contextSelection`, `clientRequestId` và **đúng một** trong hai: `commandId + arguments` (TOOL; AGENT gửi thế này bị `OFFER_REQUIRED`) hoặc `offerId` (AGENT; TOOL gửi bị `APP_KIND_MISMATCH`). Với offer, server kiểm tra offer `OPEN`, chưa hết hạn, đúng thread/app, giá vẫn trong khoảng của revision và trên giá sàn, conversation hash khớp; quote lấy giá và thời gian giao của offer, mọi terms khác từ revision. Offer chuyển `ACCEPTED` bằng cập nhật có điều kiện trong cùng transaction tạo quote, nên chỉ dùng được một lần; replay cùng `clientRequestId` trả lại quote cũ. Quote của offer dùng `inputSnapshot.schemaVersion: 2` có thêm `offer: {offerId, summary, conversation, conversationHash}` để `inputHash` khoá cả nội dung đã thương lượng; quote của TOOL giữ v1. Server kiểm tra command thuộc app của thread, access, file đã sẵn sàng, effective args, command revision/availability và giới hạn một invocation đang mở; resolve context từ dữ liệu đã lưu và đóng băng manifest. Chỉ phần buyer chọn được chia sẻ, không mặc định toàn bộ lịch sử.

Quote trả effective arguments, context manifest, hash, thông tin thanh toán (network, asset, vault, payout, giá, phí), các deadline, quote digest, policy version cùng `inputSnapshot`, `termsSnapshot`, `policySnapshot` và `protocolQuote`. Shape cụ thể đọc từ code.

Tạo quote chưa giữ tiền hoặc giao việc cho provider. Buyer xem input sau khi áp defaults và giá trước khi ký. Quote hết hạn bị từ chối nếu chưa bắt đầu thanh toán. Nếu lần thanh toán trước còn UNKNOWN, hệ thống phải đối soát, không tự tạo quote mới. Chỉ chuẩn bị lượt khác khi đã xác nhận lượt cũ không có hold và không còn khả năng tạo hold hợp lệ theo S02.

Snapshots và `protocolQuote` đúng shape/hash ở S02. Root fields là phần trình bày được suy ra từ snapshot; bất đồng root và snapshot là lỗi, không tự chọn một bên để ký.

Submit chỉ nhận `quoteId`, `Idempotency-Key` bằng **invocationId**. Chưa có payment thì trả HTTP 402 + `PAYMENT-REQUIRED`; có signed payload thì đi qua S02. Không nhận args hay giá mới khi submit. Quote thuộc buyer/thread khác bị từ chối trước settle.

Sau hold xác nhận, response mang `PAYMENT-RESPONSE`, vị trí trạng thái invocation, `paymentStatus:"HELD"` và execution status. Replay trả cùng logical invocation, không tạo charge/job khác.

### 5.3 Theo dõi và tiếp tục trong phạm vi đã trả

- Trạng thái invocation tách trạng thái tiền và công việc, kèm question/progress/delivery/failure và hành động kế tiếp. Đọc trạng thái không debit.
- Kết quả chỉ trả phiên bản đã giao; không tự trả bản provider chưa được kiểm tra.
- Trả lời chỉ cho question đang chờ, validate theo schema câu hỏi; cùng scope invocation, không giữ thêm tiền.
- Sửa trong thời hạn/số lần/phạm vi đã hứa; vượt phạm vi yêu cầu invocation mới, không tự charge.
- Đề nghị hủy chỉ ghi yêu cầu dừng; không khẳng định đã dừng tác động bên ngoài hay đã refund.
- Chấp nhận kết quả không bypass thời điểm payout tối thiểu S02.
- Không có tranh chấp chất lượng: finance worker tự hoàn tiền khi lỗi/không giao/giao trễ và giải ngân khi giao đúng hạn (S02 §8.5). Buyer chỉ còn reclaim sau `resolveBy`.

Lời nhắn trả lời phải tham chiếu `questionId`; sửa phải tham chiếu invocation và được kiểm tra policy, không dùng arbitrary `free:true`. Câu hỏi render form theo schema; câu trả lời có thể nhập chat rồi map vào parameter string được schema question chỉ định.

### 5.4 File

- Upload qua URL ký ngắn hạn: client xin upload, tải lên storage, rồi báo hoàn tất để server xác minh object/size/checksum và đưa vào kiểm tra. Chỉ file `READY` được chọn trong quote.
- Upload bằng provider key bắt buộc gắn invocation thuộc app đó; buyer upload file đầu vào không được tự gán provider ownership.
- Download kiểm tra quyền mỗi lần rồi trả URL ngắn hạn. Không nhận file từ URL Internet tùy ý; không SSRF fetch.
- Provider upload artifact qua cùng cơ chế với key app và invocation scope; file không tự thành delivered vì upload xong.

Storage S3-compatible là phụ thuộc khi bật file; PostgreSQL lưu metadata. Signed URL không nằm trong hash manifest; hash dùng file ID/version/content hash bất biến, không làm quote đổi khi URL hết hạn.

**Hiện thực (27/10/2026).** Bật bằng `FILES_ENABLED=true` và các biến `S3_*`. Code chỉ dùng S3 API chung: local chạy RustFS trong compose, production dùng Neon S3 storage. Khi tắt, route file trả 503 `FILES_DISABLED`, quote có `fileIds` trả `CONTEXT_NOT_SUPPORTED` và result có file trả `FILES_NOT_SUPPORTED`.

| Bước       | Buyer (phiên ví)                                                                                        | Provider (app key)                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Xin upload | `POST /v1/files` `{threadId,name,contentType,size,sha256,clientRequestId}`                              | `POST /v1/provider/apps/:appId/invocations/:id/files` (`files:write`, run đã ACK)                         |
| Hoàn tất   | `POST /v1/files/:fileId/completions`                                                                    | `POST …/invocations/:id/files/:fileId/completions` (`files:write`)                                        |
| Tải        | `GET /v1/files/:fileId/download`: input của mình, hoặc artifact khi result của invocation đã liệt kê nó | `GET …/invocations/:id/files/:fileId/download` (`events:read`), chỉ file có trong `contextManifest.files` |

- Xin upload trả `{file, upload:{url,method:"PUT",headers,expiresAt}}`. Request idempotent theo `(uploadScope, clientRequestId)`, gửi lại với nội dung khác thì trả 409. Presigned PUT có ký `Content-Type` và `Content-Length` và chỉ trỏ tới staging key.
- Khi hoàn tất, server copy staging sang một final key mới mà không URL upload nào trỏ tới, rồi tính lại size và sha256 trên chính bản copy. Khớp thì `READY`, sai thì `REJECTED` (`SIZE_MISMATCH`/`CHECKSUM_MISMATCH`). URL PUT còn hạn vì vậy không ghi đè được bản đã kiểm tra.
- Download luôn là attachment với `Content-Type` đã khai; signed URL không được lưu hay ghi log. Giới hạn hiện tại: allowlist content type, tối đa `FILE_MAX_BYTES`, 10 file mỗi quote và mỗi result, 50 artifact mỗi invocation.
- Quote: `contextSelection.fileIds` phải là input `READY` cùng buyer, cùng thread. `contextManifest.files` = `[{fileId,name,contentType,size,sha256}]` sắp theo `fileId`, nằm trong `inputHash`. `invocation.ready` mang manifest đó (không có URL).
- Result: `files: [{fileId}]` phải là artifact `READY` của chính invocation đó. Payvoke lưu manifest đầy đủ vào result; verifier ghi `REC` khi mọi object còn nguyên (xem M05).
- Upload bỏ dở quá hạn URL thêm 1 giờ sẽ bị job-worker chuyển `EXPIRED` và xoá staging object.
- Chưa có: quét an toàn nội dung, nhận diện type theo magic bytes, multipart cho file lớn, retention/legal hold.

## 6. Provider event protocol

### 6.1 Kết nối và phân phối

- Provider nhận event qua SSE UTF-8, xác thực bằng `Authorization: Bearer <provider-key>`. Chỉ app đúng key, không dùng query parameter cho secret. [R2]
- MVP một active stream lease/app; stream mới thay thế stream cũ qua fencing, không tạo hai execution consumer ngầm. Provider có thể tự phân phối job tới worker của mình. Scale consumer groups là việc sau.
- `id` là cursor bền vững theo stream app, `event` là event type, `data` JSON một dòng. Heartbeat comment không cần ACK và không là bằng chứng capacity.
- Reconnect gửi `Last-Event-ID`. Cursor không phải ACK: **mọi event chưa ACK vẫn có thể phát lại**, kể cả đã đi qua cursor. Replay dùng lại `eventId`/`invocationId`, không regenerate job.
- Cursor hết retention bị từ chối trước khi mở stream; provider resync event chưa ACK với cùng envelope đủ input, không phải lấy lại nội dung job từng cái.
- Slow consumer bị disconnect khi vượt bounded buffer; event không bị xóa. Connection timeout/retry/heartbeat/retention/max inflight nằm trong deployment config, không hardcode như bảo đảm delivery.

Ví dụ:

```text
id: cursor_128
event: invocation.ready
data: {"type":"invocation.ready","invocationId":"invocation_example","runId":"run_example","threadId":"thread_example","input":{"sessionId":"thread_example","productId":"app_example","productVersion":1,"commandId":"command_summarize","arguments":{"text":"Nội dung cần tóm tắt","language":"vi","maxWords":150},"context":{"messages":[],"brief":null,"files":[]}}}

```

Envelope luôn chứa eventId/sequence/type qua event field, invocation/thread/command revision và nội dung đã được chọn. Các field `sessionId/productId/productVersion` trong `input` chỉ là tương thích quote document. File lớn chỉ gửi metadata + quyền tải invocation-scoped. Không có payment signature, grant private key, cookie hay dữ liệu workspace chưa chia sẻ.

Outbox tạo `invocation.ready` sau finalized hold. Event khác: `invocation.answer`, `invocation.revision_requested`, `invocation.cancel_requested`; đều dùng cùng invocation, không charge. App AGENT còn nhận `thread.message` cho tin nhắn trước khi trả (§6.5), ACK theo từng message. Mỗi event có ID và ACK độc lập. Với event bắt đầu chu kỳ thực thi (ready/answer/revision), payload chứa `runId` do Payvoke cấp; replay event giữ nguyên `runId`, continuation/revision có `runId` mới. Xem S04.

### 6.2 ACK và báo cáo

- ACK idempotent, xác minh event/app/job; provider chỉ ACK sau khi đã persist dedupe/job.
- Report được nhận để áp workflow; nhận report không đồng nghĩa output đã giao.

`ProviderReport` có `{reportId,sequence,type,data}`. `reportId` unique trong app; retry cùng ID phải cùng body. Sequence tăng nghiêm ngặt theo invocation, serialize writer; duplicate hợp lệ trả kết quả cũ, out-of-order là conflict, report sau terminal trái phép là conflict. Không tin timestamp provider để backdate delivery.

Các type/data:

- `started`: `{}` → RUNNING.
- `progress`: `{message,percent?}`; percent integer 0–100, không phải kết quả cuối.
- `question`: `{questionId,prompt,inputSchema,chatTextParameter?}` → WAITING_BUYER; chỉ một question mở; schema giới hạn như command, không xin private key/payment hoặc đổi mục tiêu. UI render `QuestionForm` trong thread; câu trả lời có thể nhập chat nếu schema chỉ định `chatTextParameter`.
- `result`: `{artifactVersion,output,files:[],presentation?}` → VERIFYING. `presentation` nếu có là `{format:"openui-lang",specVersion:"1.0",surfaceIds:[]}` tham chiếu các surface đã persist trong run và được validate theo catalog/version S04; không cho provider nhét HTML/JS hoặc tạo surface chưa lưu qua report. Không thay `output` hoặc làm kết quả tự được giao. Output validate approved outputSchema; file thuộc app/invocation đã READY. M05 kiểm tra rồi mới DELIVERED.
- `failed`: `{code,message,sideEffectStatus:"none"|"completed"|"unknown"}` → FAILED hoặc UNKNOWN theo bằng chứng; không tự refund.
- `unknown`: `{reason}` → UNKNOWN; platform điều tra, không tự rerun side effect.
- `cancelled`: `{reason,sideEffectStatus:"none"}` chỉ khi có cancellation request đang mở và provider xác nhận đã dừng/không gây side effect. Nếu side effect chưa rõ phải báo unknown; nếu đã hoàn tất thì không báo cancelled để xóa trách nhiệm giao hàng.

Transition report bắt buộc: started từ ACKED sang RUNNING; progress chỉ khi RUNNING/WAITING_BUYER và không tự kết thúc; question từ RUNNING sang WAITING_BUYER; result chỉ từ RUNNING sang VERIFYING. Answer được nhận từ WAITING_BUYER tạo continuation event và đưa về QUEUED, sau ACK/started mới RUNNING lại. Revision được chấp nhận từ DELIVERED tạo event QUEUED và yêu cầu artifactVersion mới lớn hơn bản đã giao, không reset report sequence. Failed/unknown chỉ áp dụng trạng thái execution chưa terminal; cancelled cần cancellation request trước terminal. Report trái transition là conflict, không âm thầm sửa lịch sử.

Provider không gửi tùy ý `paymentStatus`, không có report `refund`/`payout`. Offer chỉ tồn tại trước khi trả (§6.5); sau khi tiền HELD, buyer question/answer miễn phí không cho provider thay command, tăng giá hoặc rút thêm dữ liệu. Context bổ sung cần buyer chọn rõ và audit; thay input tài chính/phạm vi phải chuẩn bị invocation mới.

### 6.3 Chống thực thi trùng

Payvoke bảo đảm không tạo hai logical ready event cho một invocation và vault không debit hai lần. SSE là at-least-once; provider MUST persist dedupe **trước ACK**, truyền invocation ID làm idempotency key cho side effect nếu nơi nhận hỗ trợ. Crash sau side effect nhưng trước ghi nhận không được diễn giải là chưa chạy. Không tự chuyển job đã ACK sang provider/app khác.

### 6.4 Streaming AG-UI / OpenUI (quyết định 23/10/2026)

Provider agent gửi token/chunk và widget qua **NDJSON streaming HTTP request** theo từng run, sau khi ACK và report `started`. Đây là kênh **nội dung hiển thị**, dùng provider key `reports:write`, sequence/cursor riêng với `ProviderReport.sequence`, có cursor để resume an toàn. Backend persist và phát bản chiếu AG-UI tới buyer qua SSE/thread stream: provider gửi envelope OpenUI Lang bằng `CUSTOM payvoke.openui`, gateway kiểm tra và chiếu thành buyer `ACTIVITY_SNAPSHOT` (`activityType:"openui-surface"`, `content.source`, `replace:true`) để tương thích hướng render AG-UI/OpenUI. S04 là hợp đồng chi tiết về ID, retry, allowlist events, snapshots, UI actions, version/catalog và xử lý lỗi.

Provider vẫn dùng reports `question/result/failed/...` để chuyển state. Kết thúc AG-UI run không xác nhận giao hàng hoặc kích hoạt payment. Không cho AG-UI `TOOL_CALL` hoặc hành động OpenUI bypass quote/x402.

### 6.5 Chat trước khi trả và offer (AGENT, 28/10/2026)

Mục đích: agent hiểu yêu cầu rồi báo giá, thay vì gắn một giá cố định cho mỗi command. Kênh này **không di chuyển tiền**; chỉ quote do Payvoke phát mới trả được.

| Ai       | Thao tác                                    | Route (code là nguồn sự thật)                                                             |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Buyer    | Gửi tin (có thể kèm slash command, fileIds) | `POST /v1/threads/:threadId/messages`                                                     |
| Buyer    | Từ chối offer                               | `POST /v1/threads/:threadId/offers/:offerId/declines`                                     |
| Provider | Nhận tin                                    | event `thread.message` trên feed app (`events:read`)                                      |
| Provider | ACK tin                                     | `POST /v1/provider/apps/:appId/threads/:threadId/messages/:messageId/acks` (`events:ack`) |
| Provider | Trả lời                                     | `POST …/threads/:threadId/messages` (`messages:write`)                                    |
| Provider | Gửi / rút offer                             | `POST …/threads/:threadId/offers`, `POST …/offers/:offerId/withdrawals` (`offers:write`)  |
| Buyer    | Chấp nhận offer                             | `POST /v1/quotes` với `offerId` (§5.2), rồi thanh toán như mọi quote                      |

- `thread.message` mang `{threadId, messageId, seq, content, commandId, arguments, files, conversation}`; `conversation` là tối đa 30 tin gần nhất. `files` chỉ là manifest (tên, type, size, sha256): provider **không tải được file trước khi tiền HELD**.
- Offer: `{commandId?, arguments, grossAmount, deliverySeconds?, summary, validForSeconds, clientRequestId}`. `arguments` validate theo input schema của revision; `grossAmount` trong `[min, max]` của revision (`PRICE_OUT_OF_RANGE`) và trên giá sàn; `deliverySeconds` không vượt revision và chuỗi deadline không vượt `maxHoldSeconds`; `validForSeconds` trong `[60, 86400]`. Refund, side effects, data use, revision và evidence **luôn lấy từ revision đã đăng ký**, offer không ghi đè được.
- Offer bất biến; offer mới chuyển offer `OPEN` cũ thành `SUPERSEDED` (mỗi thread tối đa một offer `OPEN`, có unique index). Offer cần ít nhất một tin của buyer trước đó (`NO_BUYER_REQUEST`) và khoá `conversationHash` của các tin tới lúc gửi. Hết hạn được suy ra từ `expiresAt` (`EXPIRED`), không ghi.
- Giới hạn chống lạm dụng: tối đa `PRESALE_MESSAGE_LIMIT` (mặc định 20) tin buyer mỗi thread giữa hai lần trả (`PRESALE_LIMIT_REACHED`, reset khi có invocation HELD), rate limit theo buyer, mỗi tin tối đa 4000 ký tự, provider tối đa 5 tin liên tiếp khi buyer chưa trả lời (`PROVIDER_MESSAGE_LIMIT`).
- Tin của provider là text thuần; UI không render HTML/link chạy được và không bao giờ tạo nút thanh toán từ text, chỉ từ offer đọc qua API.
- Mọi thay đổi ghi `lastMessageAt` của thread và đánh doorbell; thread SSE gửi event `conversation` (không có nội dung) để client tải lại snapshot. Snapshot có thêm `conversation` và `offers`.
- App TOOL gửi tin/offer bị `APP_KIND_MISMATCH`.

## 7. State và concurrency

Payment status theo S02, execution status: `DRAFT`, `PAYMENT_PENDING`, `QUEUED`, `SENT`, `ACKED`, `RUNNING`, `WAITING_BUYER`, `VERIFYING`, `DELIVERED`, `FAILED`, `UNKNOWN`, `CANCELLED`. CANCELLED chỉ khi đã xác nhận không chạy/đã dừng, không từ click cancel. DELIVERED có thể mở in-scope revision về QUEUED/VERIFYING theo policy nhưng không tạo hold mới.

- Slot active invocation của thread khóa bằng DB constraint/transaction, không mutex trong process. DELIVERED chờ review không cho gửi thêm input tự do vào invocation cũ; tạo lượt mới khi slot đã đóng, revision vẫn theo invocation cũ.
- Revision cần chiếm lại execution slot của cùng thread; nếu invocation khác đang chạy, trả `THREAD_BUSY`, không chạy chồng hai invocation trong cùng timeline và không charge để vượt giới hạn. Read/reclaim không cần execution slot.
- Quote creation chưa trả phí có thể giữ slot DRAFT hữu hạn; expired chưa submit được giải phóng. Nếu đã nhận signed submission/pending thì chỉ giải phóng sau reconciliation S02.
- State payment độc lập execution: `FAILED + HELD` là trạng thái có thể có, cần workflow refund. Thread history tồn tại sau revoke hoặc app dừng bán.
- Thay command revision/app khi quote còn hạn: revision/terms được pin tiếp tục hiệu lực, trừ emergency suspension chặn admission chưa hold; đã hold thì giao theo bản cũ hoặc xử lý hoàn, không đổi provider ngầm.

## 8. Chính sách cấu hình cần duyệt trước bật giao dịch

Deployment phải có versioned policy: trần/fee bps, quote lifetime, max delivery/review/resolve durations, upload limits, SSE replay retention, API/token expiry và rate/gas budgets. Startup không được dùng giá trị zero/mặc định vô hạn nếu thiếu. Ví dụ schema/giá trong tài liệu là fixture; quyết định số cụ thể thuộc chủ dự án, không phát sinh chỉ vì provider đăng ký.

## 9. Acceptance tests bắt buộc

1. Mọi app dùng composer chat; đổi app tạo thread mới; free text map đúng default/selected command.
2. Provider tạo command có option/default/required; buyer nhận effective args đúng; command app khác hoặc unknown parameter bị chặn trước charge.
3. Raw slash không tới shell/eval/LLM router; chat text chỉ map vào `positionalParameter` đã khai báo.
4. Sửa command tạo revision mới; quote cũ giữ schema/giá cũ; sửa schema sau signing không đổi execution input.
5. Hai submit đồng thời trong một thread chỉ một hold, một logical ready; job/status/result/ACK/report retry không charge.
6. SSE reconnect, expired cursor, ACK mất phản hồi, slow consumer và worker restart không mất unacked event hoặc đổi event ID.
7. App A không ACK/report/download job app B; buyer khác không xem history bằng đoán ID.
8. Question/answer/revision đúng phạm vi không thêm tiền; arbitrary message mới và sửa vượt phạm vi không được lách thành continuation.
9. Question render form theo schema trong thread; provider result chỉ VERIFYING trước validation.
10. App suspend/offline chặn quote mới nhưng đọc được thread cũ; provider side effect UNKNOWN không tự retry; cancel không đồng nghĩa refund.
11. Text và widget OpenUI hiện dần trước report `result`; provider/buyer mất mạng và replay chunk không trùng text/surface. `RUN_FINISHED` chưa giao result; widget action không thể bypass luồng trả lời question hoặc tạo charge (S04).
12. Invocation `FAILED` giải phóng slot của thread; revision invocation cũ khi thread đang có invocation khác mở trả `THREAD_BUSY`.

## Nguồn và phạm vi

- R1: SIWE/EIP-4361: https://eips.ethereum.org/EIPS/eip-4361
- R2: SSE event format/reconnect: https://html.spec.whatwg.org/multipage/server-sent-events.html
- JSON Schema: https://json-schema.org/draft/2020-12/json-schema-core.html
- Scopes, command syntax và lease policy do Payvoke thiết kế; x402/MCP không cung cấp sẵn. Hình dạng route lấy từ code; OpenAPI nếu có phải được sinh từ implementation, không viết tay.
