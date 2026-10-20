# S01 · API, slash commands và giao job cho provider

Trạng thái: đặc tả MVP để triển khai, 19/10/2026. Chưa có implementation hoặc OpenAPI sinh từ code. MUST/không được chỉ yêu cầu bắt buộc khi nghiệm thu, chưa xác nhận endpoint đã tồn tại. Thuật ngữ: [GLOSSARY](../../GLOSSARY.md). Thanh toán: [S02](02-x402-and-vault.md). MCP: [S03](03-mcp-client.md).

## 1. Mô hình nghiệp vụ đã chốt

- `Product.kind` là `agent` hoặc `tool`, bất biến. Muốn đổi loại phải tạo sản phẩm mới.
- Một `UsageSession` (`sessionId`) thuộc một buyer/workspace và **đúng một productId**, không đổi sản phẩm/provider giữa phiên. Mở sản phẩm khác tạo phiên mới; không tự mang lịch sử/file sang.
- Phiên agent có timeline và composer chat, chọn slash command được đăng ký của chính agent đó. Gửi văn bản thường dùng default command của sản phẩm với một string parameter đã khai báo.
- Phiên tool **không có composer chat**. Hiển thị form tham số, báo giá, tiến độ, câu hỏi dạng form nếu có và kết quả/lịch sử chạy. Chọn tool trong command palette phải mở phiên tool, không chèn nó thành người tham gia hội thoại agent.
- Một phiên chỉ có **một invocation đang thực thi/chờ xử lý** ở MVP; `WAITING_BUYER`/`VERIFYING`/`UNKNOWN` vẫn chiếm slot. `DELIVERED`/`FAILED`/`CANCELLED` giải phóng execution slot dù tiền có thể còn HELD chờ review/refund. Gửi thêm lời nhắn không có question/revision context không tự được xem là trả lời miễn phí.
- Mỗi invocation mới có một command, quote, bộ input bất biến và khoản giữ tiền riêng. Provider hỏi lại, buyer trả lời đúng question hoặc sửa trong phạm vi không tạo quote/charge mới.
- Payvoke tính tiền theo invocation, không theo tin nhắn hoặc token. Trước mỗi lần tính phí mới, UI phải thể hiện giá, dữ liệu gửi và quyền chi áp dụng.

`sessionId` trong tài liệu này là **phiên sử dụng**, không phải cookie đăng nhập hay grant của khóa chi; phần thanh toán dùng `grantId`.

## 2. Quy ước chung

- Base path `/v1`, HTTPS, JSON UTF-8. Timestamp RFC 3339 ở API nghiệp vụ; các field signed/onchain dùng Unix seconds nguyên được S02 quy định.
- ID là chuỗi opaque, phân biệt hoa/thường, do server cấp trừ `clientRequestId`/`reportId` do client cấp. Không tự trim/đổi case ID. ID của command ổn định qua các version; definition của command được snapshot trong product version.
- Tiền là chuỗi decimal atomic USDC không dấu/chấm, ví dụ `"10000"` = 0,01 USDC. Không dùng float; `feeBps` là integer.
- `Idempotency-Key` bắt buộc trên thao tác thay đổi nghiệp vụ. Giá trị phải bằng `clientRequestId` nếu body có field này; provider report dùng reportId, ACK dùng eventId. Auth challenge/login/pairing/token exchange có single-use semantics riêng, không replay secret qua idempotency cache. Server lưu theo `(principal, operation, key)` và hash normalized body; khác body cùng key trả `409 IDEMPOTENCY_CONFLICT`.
- Riêng quote/paid submission tiếp tục có uniqueness theo invocation trong S02, không phụ thuộc TTL của HTTP idempotency cache. Không xóa payment dedupe record khi hết cache.
- Collection trả `{items,nextCursor}`; `limit` mặc định 20, tối đa 100; cursor opaque và phải thuộc cùng principal/filter. Mọi endpoint đọc kiểm tra ownership, không xem biết ID là đủ quyền.
- Error body: `{error:{code,message,retryable,requestId,details?}}`. Không echo signature, token hoặc signed URL trong lỗi/log. Input lạ, sai type hoặc additional property không cho phép trả 422; JSON hỏng trả 400.
- HTTP status: 401 chưa xác thực, 403 không đủ quyền, 404 không thấy/không có quyền đọc tài nguyên của người khác, 409 conflict/state/version, 410 tài nguyên/quote hết hạn rõ ràng, 422 input, 429 rate limit, 503 dependency tạm không khả dụng. Payment pending có xử lý riêng trong S02, không mặc định là unpaid.
- API request body và payment headers có size limit cấu hình; không đợi tới lúc gửi tx mới phát hiện input không hợp lệ.

## 3. Identity và quyền

### 3.1 Web đăng nhập bằng ví

| Endpoint                   | Request                   | Response/hành vi                                                                                                                |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/challenges` | `{address,chainId:43113}` | 201 `{challengeId,message,expiresAt}`; message theo SIWE, domain/URI Payvoke, chain, nonce một lần, issued/expiry.              |
| `POST /v1/auth/sessions`   | `{challengeId,signature}` | 200 `{buyer:{address},expiresAt}` + cookie HttpOnly/Secure; consume challenge atomically, kiểm tra domain/chain/time/signature. |
| `DELETE /v1/auth/session`  | Không body                | 204, thu hồi cookie session; không tự revoke grant onchain.                                                                     |
| `GET /v1/me`               | Không body                | Buyer, scopes/roles; không trả khóa hoặc bearer token.                                                                          |

Cookie request thay đổi dữ liệu phải kiểm tra Origin/CSRF; CORS allowlist chính xác, không wildcard credentials. MVP hỗ trợ ví EOA đã deploy tài khoản thông thường; hỗ trợ contract wallet cần test ERC-1271 riêng, không giả định mọi SIWE library hỗ trợ. Đăng nhập không cấp quyền debit vault. [R1]

### 3.2 External buyer client

Scoped bearer token là **quyền gọi API**, không phải quyền chi. Các scope: `catalog:read`, `workspace:read`, `invocation:prepare`, `invocation:submit`, `invocation:read`, `invocation:continue`. Token ràng buộc buyer/client/workspace, expiry, revocation; quy trình cấp cho MCP local ở S03. Không dùng provider API key để mua hàng.

### 3.3 Provider

API key chỉ cho một provider app và scopes: `products:write`, `events:read`, `events:ack`, `reports:write`, `files:write`. Secret chỉ hiện lúc cấp, lưu hash ở server, prefix cho nhận dạng; log redact. Web wallet có quyền chủ app tạo/rotate/revoke key qua `/v1/provider/apps/{appId}/keys`. Key không được đổi payout wallet hoặc operator role; thay payout cần chủ app xác thực ví và version mới.

Wallet-auth management endpoints: `POST /v1/provider/apps {name,payoutAddress,clientRequestId}` trả 201 `{appId,name,payoutAddress}`; `POST /v1/provider/apps/{appId}/keys {scopes,expiresAt,clientRequestId}` trả 201 `{keyId,secret,scopes,expiresAt}` một lần; `POST /v1/provider/apps/{appId}/keys/{keyId}/revocations {clientRequestId}` trả 200 revoke status. Tạo key mới rồi revoke key cũ là rotate, không trả lại secret cũ qua GET. Mất response lúc cấp key thì revoke record đó và cấp key mới, không lưu plaintext secret để replay. Không provider key nào tự tạo key quyền lớn hơn.

External client authorization/pairing dùng endpoints được định nghĩa đầy đủ trong [S03 §5](03-mcp-client.md#5-pairing-wallet-based-nhỏ-nhất-và-thu-hồi); đây là phần auth plane của cùng API, không server dữ liệu thứ hai. Scope `invocation:prepare` cho phép tạo session, không cho tạo workspace tùy ý; MCP dùng workspace buyer đã tạo/chọn trên web.

## 4. Đăng ký sản phẩm và slash command

Provider có thể dùng web hoặc API; cả hai đi qua cùng validation, version và approval. API nhận definition có cấu trúc, không bắt buộc manifest file.

### 4.1 Version và publishing

`productId` bất biến về owner/kind. Mọi thay đổi command schema, default command, giá, payout hoặc điều khoản tạo draft version; không sửa bản đang phục vụ. Quote/invocation pin chính xác approved `productVersion`.

| Endpoint                                                                             | Body                                                      | Kết quả                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /v1/provider/apps/{appId}/products`                                            | `{kind,name,description}`                                 | 201 `{productId,draftVersion,status:"DRAFT"}`.                                          |
| `POST /v1/provider/apps/{appId}/products/{productId}/versions`                       | `{baseVersion}`                                           | 201 draft version mới từ bản base thuộc sản phẩm.                                       |
| `POST /v1/provider/apps/{appId}/products/{productId}/commands`                       | `CommandRegistration` gồm `draftVersion`                  | 201 `{commandId,draftVersion}`; tên trùng trong draft trả 409.                          |
| `PUT /v1/provider/apps/{appId}/products/{productId}/commands/{commandId}`            | Toàn bộ definition mới + `draftVersion,expectedRevision`  | 200 draft revision mới; optimistic concurrency, không patch bản active.                 |
| `PUT /v1/provider/apps/{appId}/products/{productId}/versions/{version}/settings`     | `{defaultCommandId?,chatTextParameter?,expectedRevision}` | Agent bắt buộc default command và text parameter string; tool không nhận cấu hình chat. |
| `POST /v1/provider/apps/{appId}/products/{productId}/versions/{version}/submissions` | `{expectedRevision}`                                      | 202 `PENDING_REVIEW`; cần command hợp lệ và điều khoản đầy đủ.                          |
| `POST /v1/operator/products/{productId}/versions/{version}/reviews`                  | `{decision:"approve"                                      | "reject",reason,expectedRevision}`                                                      | Operator có quyền duyệt; approval chọn bản active, lưu audit. |
| `POST /v1/provider/apps/{appId}/products/{productId}/suspensions`                    | `{reason}`                                                | Dừng bán mới; không xóa nghĩa vụ job cũ.                                                |

Các endpoint dưới `/provider` yêu cầu key đúng app; thao tác web chủ app có thể đi qua wallet-auth cùng authorization policy. API key chỉ truy cập app được cấp, không dùng `appId` body để vượt quyền. Operator review không dùng provider key.

### 4.2 CommandRegistration

Field bắt buộc: `draftVersion,name,title,description,inputSchema,outputSchema,grossAmount,terms`. Field tùy chọn: `positionalParameter`. Mọi command provider đăng ký đều tạo **paid invocation**; không có flag cho provider gọi workflow miễn phí hoặc bypass x402.

- `name`: không có dấu `/`, regex `^[a-z][a-z0-9_-]{0,31}$`; namespace theo product. Cùng `/summarize` ở hai product là hai command khác nhau.
- Dành riêng `help`, `cancel`, `status` cho UI điều hướng; UI action miễn phí không được biến thành provider invocation.
- `inputSchema`/`outputSchema`: JSON Schema 2020-12, root object, `additionalProperties:false`. MVP nhận primitive, nested object và array có bounds; enum, required, min/max, string lengths. Không `$ref` remote, code, regex không được kiểm soát hoặc default tạo side effect. Schema depth/size/item limits do server cap.
- Parameters được validate server-side; defaults chỉ áp một lần lúc chuẩn bị quote. Lưu effective arguments và hash chính bản đó; không áp default mới ở paid retry.
- `positionalParameter` nếu có phải là một root string parameter. Nếu không có, mọi parameter nhập bằng named flag/form.
- Agent `chatTextParameter` phải là root string của default command; chat text được map vào đó. Required field khác phải có default hợp lệ hoặc UI hỏi form trước khi quote.
- `terms`: `{deliverySeconds,reviewSeconds,revisionPolicy,refundPolicy,sideEffects,dataUse}`. `revisionPolicy` phải có `{maxIncluded,description}`; maxIncluded integer >=0. Policy text không đủ để contract tự đánh giá chất lượng. `sideEffects` khai báo `none` hoặc mô tả tác động ngoài hệ thống.
- `grossAmount` dương và nằm trong cap policy nền tảng; không tự ấn định phí nền tảng qua registration.

Ví dụ đăng ký command của tool:

```json
{
  "draftVersion": 1,
  "name": "summarize",
  "title": "Tóm tắt văn bản",
  "description": "Tạo bản tóm tắt theo ngôn ngữ và độ dài đã chọn",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": false,
    "required": ["text"],
    "properties": {
      "text": { "type": "string", "minLength": 1, "maxLength": 20000 },
      "language": { "type": "string", "enum": ["vi", "en"], "default": "vi" },
      "maxWords": { "type": "integer", "minimum": 20, "maximum": 500, "default": 150 }
    }
  },
  "outputSchema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["summary"],
    "properties": { "summary": { "type": "string" } }
  },
  "positionalParameter": "text",
  "grossAmount": "10000",
  "terms": {
    "deliverySeconds": 600,
    "reviewSeconds": 86400,
    "revisionPolicy": { "maxIncluded": 1, "description": "Một lần sửa tóm tắt cùng văn bản" },
    "refundPolicy": "Không giao được kết quả thì hoàn toàn bộ; sai phạm vi được xét tranh chấp",
    "sideEffects": "none",
    "dataUse": "Chỉ dùng input cho yêu cầu này"
  }
}
```

Giá và thời gian trong ví dụ là fixture minh họa, không phải policy kinh tế đã bật.

### 4.3 Cách nhập slash parameters

- Palette lấy command của product hiện tại; gõ `/summarize` mở schema form. Tool luôn mở form; agent có thể nhập trực tiếp hoặc mở form.
- Text shortcut hỗ trợ `/name`, `--parameter=value`, boolean `true|false`, số thập phân chuẩn, chuỗi JSON double-quoted; một positional string được khai báo. Repeated flag, unknown flag, type mơ hồ trả lỗi, không tự suy đoán.
- Object/array phức tạp nhập qua form, không nhét JSON tùy ý vào command line ở MVP.
- UI chuyển shortcut thành `commandId + arguments` trước gọi API. **Backend không thực thi raw slash string**, không shell eval và không nhờ LLM đoán command hay giá.
- Ví dụ `/summarize "Nội dung cần tóm tắt" --language=vi --maxWords=150` tạo arguments tương ứng. Nếu đang ở agent khác thì báo command không có trong sản phẩm; không tự gọi tool bên ngoài.
- Command không phải MCP prompt; host AI có thể không hiển thị slash commands như UI Payvoke. S03 công bố cùng command catalog qua MCP tools.

## 5. Buyer API

### 5.1 Catalog, workspace và phiên

| Endpoint                                | Input                                     | Output                                                                                               |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /v1/products`                      | Query `q?,kind?,cursor?,limit?`           | Chỉ approved/được phép xem; mỗi item `{productId,kind,name,activeVersion,availability}`.             |
| `GET /v1/products/{productId}`          | Không body                                | Metadata, kind, activeVersion, provider identity, mặc định agent nếu có; không tiết lộ provider key. |
| `GET /v1/products/{productId}/commands` | `version?`                                | Approved command definitions, schemas, giá và terms; quote vẫn phải validate lại availability.       |
| `POST /v1/workspaces`                   | `{name,clientRequestId}`                  | 201 `{workspaceId,name}` của buyer.                                                                  |
| `GET /v1/workspaces`                    | Pagination                                | Workspace thuộc buyer/token scope.                                                                   |
| `POST /v1/sessions`                     | `{workspaceId,productId,clientRequestId}` | 201 `{sessionId,workspaceId,productId,kind}`; không charge.                                          |
| `GET /v1/sessions/{sessionId}`          | Không body                                | Session, timeline agent hoặc run history tool, active invocation nếu có.                             |

Session khóa product/kind nhưng **không khóa mọi lần gọi vào một version vĩnh viễn**. Khi product đổi version, UI phải báo; quote mới pin version hiện được buyer xác nhận. Invocation cũ luôn dùng version cũ. Command bị bỏ khỏi version mới không chạy bằng dữ liệu cũ nếu chưa có quote còn hợp lệ.

### 5.2 Chuẩn bị quote và bắt đầu invocation

`POST /v1/quotes`, body:

```json
{
  "sessionId": "session_example",
  "commandId": "command_summarize",
  "arguments": { "text": "Nội dung cần tóm tắt", "language": "vi", "maxWords": 150 },
  "contextSelection": { "messageIds": [], "briefVersionId": null, "fileIds": [] },
  "clientRequestId": "prepare_example"
}
```

Server kiểm tra command thuộc product của session, access, file đã sẵn sàng, effective args, version/availability, giới hạn một invocation đang mở; resolve context từ dữ liệu đã lưu và đóng băng manifest. Tool không nhận message history trong `messageIds`; agent chỉ chia sẻ phần buyer chọn, không mặc định toàn workspace.

201 trả `Quote` gồm:

```text
quoteId, invocationId, sessionId, productId, productVersion, commandId,
effectiveArguments, contextManifest, inputHash, termsHash,
network, asset, vault, providerPayout, grossAmount, feeBps, feeRecipient,
validUntil, deliveryDeadline, releaseNotBefore, resolveBy, quoteDigest, policyVersion,
inputSnapshot, termsSnapshot, policySnapshot, protocolQuote
```

Tạo quote chưa giữ tiền hoặc giao việc cho provider. Buyer xem input sau khi áp defaults và giá trước khi ký. Quote hết hạn trả 410 nếu chưa bắt đầu thanh toán. Nếu lần thanh toán trước còn UNKNOWN, hệ thống phải đối soát, không tự tạo quote mới. Chỉ chuẩn bị lượt khác khi đã xác nhận lượt cũ không có hold và không còn khả năng tạo hold hợp lệ theo S02.

`inputSnapshot`, `termsSnapshot`, `policySnapshot` và `protocolQuote` đúng shape/hash ở S02. Root fields là phần trình bày được suy ra từ snapshot; bất đồng root và snapshot trả `QUOTE_INCONSISTENT`, không tự chọn một bên để ký. `/v1/products/{id}/commands` hỗ trợ `version`, `cursor`, `limit`; command DTO có `commandId,name,title,description,inputSchema,outputSchema,grossAmount,terms,productVersion,positionalParameter?` và collection trả `items,nextCursor` như quy ước chung.

`POST /v1/invocations` body `{quoteId}`, `Idempotency-Key` bằng **invocationId**. Cùng body chưa có payment trả 402 + `PAYMENT-REQUIRED`; cùng body có signed payload đi qua S02. Không nhận args hay giá mới tại endpoint này. Quote thuộc buyer/session khác trả 404/403 trước settle.

Sau hold xác nhận: 202 + `PAYMENT-RESPONSE`, `Location: /v1/invocations/{invocationId}`, body `{invocationId,sessionId,paymentStatus:"HELD",executionStatus:"QUEUED",statusUrl,resultUrl}`. Replay trả cùng logical invocation, không tạo charge/job khác; invocation đã xong có thể trả 200 trạng thái hiện tại.

### 5.3 Theo dõi và tiếp tục trong phạm vi đã trả

| Endpoint                                  | Body                                       | Hành vi                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/invocations/{id}`                | Không body                                 | `{invocationId,sessionId,paymentStatus,executionStatus,question?,progress?,delivery?,failure?,nextActions}`; tách trạng thái tiền/công việc. |
| `GET /v1/invocations/{id}/result`         | Không body                                 | 200 phiên bản đã giao và artifacts; 409 `RESULT_NOT_READY` khi chưa giao; không tự trả bản provider chưa được kiểm tra.                      |
| `POST /v1/invocations/{id}/answers`       | `{questionId,arguments,clientRequestId}`   | 202, chỉ question đang chờ, validate schema câu hỏi; cùng scope invocation, không giữ thêm tiền.                                             |
| `POST /v1/invocations/{id}/revisions`     | `{reason,clientRequestId}`                 | 202 trong thời hạn/số lần/phạm vi đã hứa; ngoài phạm vi trả 409 `NEW_INVOCATION_REQUIRED`, không tự charge.                                  |
| `POST /v1/invocations/{id}/cancellations` | `{reason,clientRequestId}`                 | 202 ghi đề nghị dừng; không khẳng định đã dừng tác động bên ngoài hay đã refund.                                                             |
| `POST /v1/invocations/{id}/acceptances`   | `{artifactVersion,clientRequestId}`        | 200 ghi buyer đã chấp nhận, không bypass thời điểm payout tối thiểu S02.                                                                     |
| `POST /v1/invocations/{id}/disputes`      | `{reason,evidenceFileIds,clientRequestId}` | 201 hồ sơ; trả onchain dispute intent/status. Chỉ tranh chấp chain đã xác nhận mới chặn payout onchain.                                      |

Lời nhắn trả lời phải tham chiếu `questionId`; sửa phải tham chiếu invocation và được kiểm tra policy, không dùng arbitrary `free:true`. Với tool, câu hỏi render form theo schema; không xuất hiện composer chat. Với agent, câu trả lời có thể nhập chat rồi map vào parameter string được schema question chỉ định.

### 5.4 File

`POST /v1/files/uploads {name,contentType,size,clientRequestId,invocationId?}` trả `{fileId,uploadUrl,expiresAt,requiredHeaders}`. invocationId bắt buộc nếu caller là provider key và phải thuộc app đó; buyer upload file đầu vào không được tự gán provider ownership qua field này. `POST /v1/files/{fileId}/completions {checksum,clientRequestId}` xác minh object/size/checksum và đưa vào kiểm tra; chỉ file `READY` được chọn trong quote. `GET /v1/files/{fileId}/download` kiểm tra quyền mỗi lần rồi trả URL ngắn hạn. Không nhận file từ URL Internet tùy ý; không SSRF fetch. Provider upload artifact qua cùng cơ chế với key app và invocation scope; file không tự thành delivered vì upload xong.

Storage S3-compatible là phụ thuộc khi bật file; PostgreSQL lưu metadata. Signed URL không nằm trong hash manifest; hash dùng file ID/version/content hash bất biến, không làm quote đổi khi URL hết hạn.

## 6. Provider event protocol

### 6.1 Kết nối và phân phối

- `GET /v1/provider/apps/{appId}/events`, `Authorization: Bearer <provider-key>`, `Accept: text/event-stream`; UTF-8 SSE. Chỉ app đúng key, không dùng query parameter cho secret. [R2]
- MVP một active stream lease/app; stream mới thay thế stream cũ qua fencing, không tạo hai execution consumer ngầm. Provider có thể tự phân phối job tới worker của mình. Scale consumer groups là việc sau.
- `id` là cursor bền vững theo stream app, `event` là event type, `data` JSON một dòng. Heartbeat comment không cần ACK và không là bằng chứng capacity.
- Reconnect gửi `Last-Event-ID`. Cursor không phải ACK: **mọi event chưa ACK vẫn có thể phát lại**, kể cả đã đi qua cursor. Replay dùng lại `eventId`/`invocationId`, không regenerate job.
- Cursor hết retention trả 409 `CURSOR_EXPIRED` trước mở stream; provider dùng `GET /v1/provider/apps/{appId}/pending-events` để resync event chưa ACK. Endpoint trả cùng envelope đủ input, không bắt provider lấy lại nội dung job từng cái.
- Slow consumer bị disconnect khi vượt bounded buffer; event không bị xóa. Connection timeout/retry/heartbeat/retention/max inflight nằm trong deployment config, không hardcode như bảo đảm delivery.

Ví dụ:

```text
id: cursor_128
event: invocation.ready
data: {"eventId":"event_example","sequence":128,"invocationId":"invocation_example","sessionId":"session_example","kind":"tool","productId":"product_example","productVersion":1,"commandId":"command_summarize","commandName":"summarize","arguments":{"text":"Nội dung cần tóm tắt","language":"vi","maxWords":150},"context":{"messages":[],"brief":null,"files":[]},"deliveryDeadline":"2026-10-19T12:10:00Z","termsHash":"0x2222222222222222222222222222222222222222222222222222222222222222"}

```

Envelope luôn chứa eventId/sequence/type qua event field, invocation/session/product version/command và nội dung đã được chọn. File lớn chỉ gửi metadata + quyền tải invocation-scoped, refresh bằng endpoint app có kiểm tra scope. Không có payment signature, grant private key, cookie hay dữ liệu workspace chưa chia sẻ.

Outbox tạo `invocation.ready` sau finalized hold. Event khác: `invocation.answer`, `invocation.revision_requested`, `invocation.cancel_requested`; đều dùng cùng invocation, không charge. Mỗi event có ID và ACK độc lập.

### 6.2 ACK và báo cáo

| Endpoint                                                  | Request          | Kết quả                                                                                                         |
| --------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /v1/provider/apps/{appId}/events/{eventId}/ack`     | `{invocationId}` | 200 `{eventId,acknowledgedAt}`; idempotent, xác minh event/app/job; ACK sau khi provider đã persist dedupe/job. |
| `POST /v1/provider/apps/{appId}/invocations/{id}/reports` | `ProviderReport` | 202 nhận report để áp workflow; không đồng nghĩa output đã giao.                                                |

`ProviderReport` có `{reportId,sequence,type,data}`. `reportId` unique trong app; retry cùng ID phải cùng body. Sequence tăng nghiêm ngặt theo invocation, serialize writer; duplicate hợp lệ trả kết quả cũ, out-of-order trả 409 `REPORT_OUT_OF_ORDER`, report sau terminal trái phép trả 409. Không tin timestamp provider để backdate delivery.

Các type/data:

- `started`: `{}` → RUNNING.
- `progress`: `{message,percent?}`; percent integer 0–100, không phải kết quả cuối.
- `question`: `{questionId,prompt,inputSchema,chatTextParameter?}` → WAITING_BUYER; chỉ một question mở; schema giới hạn như command, không xin private key/payment hoặc đổi mục tiêu. Tool render form, agent có thể render câu hỏi trong chat.
- `result`: `{artifactVersion,output,files:[]}` → VERIFYING. Output validate approved outputSchema; file thuộc app/invocation đã READY. M05 kiểm tra rồi mới DELIVERED.
- `failed`: `{code,message,sideEffectStatus:"none"|"completed"|"unknown"}` → FAILED hoặc UNKNOWN theo bằng chứng; không tự refund.
- `unknown`: `{reason}` → UNKNOWN; platform điều tra, không tự rerun side effect.
- `cancelled`: `{reason,sideEffectStatus:"none"}` chỉ khi có cancellation request đang mở và provider xác nhận đã dừng/không gây side effect. Nếu side effect chưa rõ phải báo unknown; nếu đã hoàn tất thì không báo cancelled để xóa trách nhiệm giao hàng.

Transition report bắt buộc: started từ ACKED sang RUNNING; progress chỉ khi RUNNING/WAITING_BUYER và không tự kết thúc; question từ RUNNING sang WAITING_BUYER; result chỉ từ RUNNING sang VERIFYING. Answer được nhận từ WAITING_BUYER tạo continuation event và đưa về QUEUED, sau ACK/started mới RUNNING lại. Revision được chấp nhận từ DELIVERED tạo event QUEUED và yêu cầu artifactVersion mới lớn hơn bản đã giao, không reset report sequence. Failed/unknown chỉ áp dụng trạng thái execution chưa terminal; cancelled cần cancellation request trước terminal. Report trái transition trả 409 `INVALID_STATE`, không âm thầm sửa lịch sử.

Provider không gửi tùy ý `paymentStatus`, không có report `refund`/`payout`. Buyer question/answer miễn phí không cho provider thay command, tăng giá hoặc rút thêm dữ liệu. Context bổ sung cần buyer chọn rõ và audit; thay input tài chính/phạm vi phải chuẩn bị invocation mới.

### 6.3 Chống thực thi trùng

Payvoke bảo đảm không tạo hai logical ready event cho một invocation và vault không debit hai lần. SSE là at-least-once; provider MUST persist dedupe **trước ACK**, truyền invocation ID làm idempotency key cho side effect nếu nơi nhận hỗ trợ. Crash sau side effect nhưng trước ghi nhận không được diễn giải là chưa chạy. Không tự chuyển job đã ACK sang provider/product khác.

## 7. State và concurrency

Payment status theo S02, execution status: `DRAFT`, `PAYMENT_PENDING`, `QUEUED`, `SENT`, `ACKED`, `RUNNING`, `WAITING_BUYER`, `VERIFYING`, `DELIVERED`, `FAILED`, `UNKNOWN`, `CANCELLED`. CANCELLED chỉ khi đã xác nhận không chạy/đã dừng, không từ click cancel. DELIVERED có thể mở in-scope revision về QUEUED/VERIFYING theo policy nhưng không tạo hold mới.

- Slot active invocation của session khóa bằng DB constraint/transaction, không mutex trong process. DELIVERED chờ review không cho gửi thêm input tự do vào invocation cũ; tạo lượt mới khi slot đã đóng, revision/dispute vẫn theo invocation cũ.
- Revision cần chiếm lại execution slot của cùng session; nếu invocation khác đang chạy, trả 409 `SESSION_BUSY`, không chạy chồng hai agent trong cùng timeline và không charge để vượt giới hạn. Dispute/read không cần execution slot.
- Quote creation chưa trả phí có thể giữ slot DRAFT hữu hạn; expired chưa submit được giải phóng. Nếu đã nhận signed submission/pending thì chỉ giải phóng sau reconciliation S02.
- State payment độc lập execution: `FAILED + HELD` là trạng thái có thể có, cần workflow refund. Session history tồn tại sau revoke hoặc sản phẩm dừng bán.
- Thay version khi quote còn hạn: version/terms được pin tiếp tục hiệu lực, trừ emergency suspension chặn admission chưa hold; đã hold thì giao theo bản cũ hoặc xử lý hoàn, không đổi provider ngầm.

## 8. Chính sách cấu hình cần duyệt trước bật giao dịch

Deployment phải có versioned policy: trần/fee bps, quote lifetime, max delivery/review/resolve durations, upload limits, SSE replay retention, API/token expiry và rate/gas budgets. Startup không được dùng giá trị zero/mặc định vô hạn nếu thiếu. Ví dụ schema/giá trong tài liệu là fixture; quyết định số cụ thể thuộc chủ dự án, không phát sinh chỉ vì provider đăng ký.

## 9. Acceptance tests bắt buộc

1. Agent có composer, tool không có composer; đổi product tạo session mới; sửa kind cùng product bị từ chối.
2. Provider đăng ký command có enum/default/required; buyer nhận effective args đúng; command product khác hoặc unknown parameter bị chặn trước charge.
3. Raw slash không tới shell/eval/LLM router; chat default chỉ map text vào parameter đã khai báo.
4. Draft/rejected version không bán; quote cũ giữ schema/giá cũ; sửa schema sau signing không đổi execution input.
5. Hai submit đồng thời chỉ một hold, một logical ready; job/status/result/ACK/report retry không charge.
6. SSE reconnect, expired cursor, ACK mất phản hồi, slow consumer và worker restart không mất unacked event hoặc đổi event ID.
7. App A không ACK/report/download job app B; buyer khác không xem history bằng đoán ID.
8. Question/answer/revision đúng phạm vi không thêm tiền; arbitrary message mới và sửa vượt phạm vi không được lách thành continuation.
9. Tool nhận question qua form, không xuất hiện chat; provider result chỉ VERIFYING trước validation.
10. Provider side effect UNKNOWN không tự retry; cancel không đồng nghĩa refund; dispute pending không giả là payout đã bị khóa.

## Nguồn và phạm vi

- R1: SIWE/EIP-4361: https://eips.ethereum.org/EIPS/eip-4361
- R2: SSE event format/reconnect: https://html.spec.whatwg.org/multipage/server-sent-events.html
- JSON Schema: https://json-schema.org/draft/2020-12/json-schema-core.html
- Các endpoint, scopes, command syntax và lease policy do Payvoke thiết kế; x402/MCP không cung cấp sẵn. Cần sinh và kiểm tra OpenAPI từ implementation theo đặc tả này.
