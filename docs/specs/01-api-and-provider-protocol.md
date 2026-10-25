# S01 · API, slash commands và giao job cho provider

Trạng thái: đặc tả MVP để triển khai, khởi tạo 19/10/2026; cập nhật mô hình app/thread/command revision và streaming 23/10/2026. Chưa có đầy đủ implementation hoặc OpenAPI sinh từ code. MUST/không được chỉ yêu cầu bắt buộc khi nghiệm thu, chưa xác nhận endpoint đã tồn tại. Thuật ngữ: [GLOSSARY](../../GLOSSARY.md). Thanh toán: [S02](02-x402-and-vault.md). MCP: [S03](03-mcp-client.md). Chat streaming và widget: [S04](04-ag-ui-a2ui-streaming.md).

## 1. Mô hình nghiệp vụ đã chốt

- Mỗi đơn vị được bán là một `App`. Không còn `Product.kind` agent/tool và không còn `ProviderApp` tách khỏi `Product`. Mọi app dùng chung một giao diện thread chat; khác biệt nằm ở command, schema và hành vi provider.
- Một `ChatThread` (`threadId`) thuộc một buyer và **đúng một appId**, không đổi app giữa thread. Mở app khác tạo thread mới; không tự mang lịch sử/file sang.
- App có nhiều `AppCommand`; mỗi command có `id` ổn định và một `AppCommandRevision` đang active. Sửa definition tạo revision mới, không sửa revision đã dùng cho quote.
- Free text map vào tham số vị trí của command đang chọn/default. Gõ `/` mở danh sách command của chính app. Command không có tham số vị trí mở form arguments. Backend chỉ nhận `commandId + arguments`, không thực thi raw slash text.
- App có thể `PUBLIC` (xuất hiện trong store) hoặc `PRIVATE` (chỉ owner thấy/chat). Availability suy ra từ `status = ACTIVE`, có default command và heartbeat trong 45 giây gần nhất; provider không tự đặt cờ available.
- Chat nhận **AG-UI text events** và widget **OpenUI Lang** trong cùng stream. Payload đang stream là preview; chỉ kết quả qua verification mới được giao. Hợp đồng bổ sung tại S04.
- Một thread chỉ có **một invocation đang thực thi/chờ xử lý** ở MVP; `WAITING_BUYER`/`VERIFYING`/`UNKNOWN` vẫn chiếm slot. `DELIVERED`/`FAILED`/`CANCELLED` giải phóng execution slot dù tiền có thể còn HELD chờ review/refund. Gửi thêm lời nhắn không có question/revision context không tự được xem là trả lời miễn phí.
- Mỗi invocation mới có một command revision, quote, bộ input bất biến và khoản giữ tiền riêng. Provider hỏi lại, buyer trả lời đúng question hoặc sửa trong phạm vi policy không tạo quote/charge mới.
- Payvoke tính tiền theo invocation, không theo tin nhắn hoặc token. Trước mỗi lần tính phí mới, UI phải thể hiện giá, dữ liệu gửi và quyền chi áp dụng.

`threadId` là định danh hội thoại nội bộ. Quote document và protocol on-chain vẫn giữ các field dây cũ `sessionId`, `productId`, `productVersion` để tương thích x402/vault; `sessionId` map bằng `threadId`, `productId` map bằng `appId`, `productVersion` hiện là `1`. Đây là chi tiết tương thích, không phải thuật ngữ UI.

## 2. Quy ước chung

- Base path `/v1`, HTTPS, JSON UTF-8. Timestamp RFC 3339 ở API nghiệp vụ; các field signed/onchain dùng Unix seconds nguyên được S02 quy định.
- ID là chuỗi opaque, phân biệt hoa/thường, do server cấp trừ `clientRequestId`/`reportId` do client cấp. Không tự trim/đổi case ID. ID của command ổn định qua các revision; definition của command được snapshot trong command revision.
- Tiền là chuỗi decimal atomic USDC không dấu/chấm, ví dụ `"10000"` = 0,01 USDC. Không dùng float; `feeBps` là integer.
- `Idempotency-Key` bắt buộc trên thao tác thay đổi nghiệp vụ. Giá trị phải bằng `clientRequestId` nếu body có field này; provider report dùng reportId, ACK dùng eventId. Auth challenge/login/pairing/token exchange có single-use semantics riêng, không replay secret qua idempotency cache. Server lưu theo `(principal, operation, key)` và hash normalized body; khác body cùng key trả `409 IDEMPOTENCY_CONFLICT`.
- Riêng quote/paid submission tiếp tục có uniqueness theo invocation trong S02, không phụ thuộc TTL của HTTP idempotency cache. Không xóa payment dedupe record khi hết cache.
- Collection trả `{items,nextCursor}`; `limit` mặc định 20, tối đa 100; cursor opaque và phải thuộc cùng principal/filter. Mọi endpoint đọc kiểm tra ownership, không xem biết ID là đủ quyền.
- Error body: `{error:{code,message,retryable,requestId,details?}}`. Không echo signature, token hoặc signed URL trong lỗi/log. Input lạ, sai type hoặc additional property không cho phép trả 422; JSON hỏng trả 400.
- HTTP status: 401 chưa xác thực, 403 không đủ quyền, 404 không thấy/không có quyền đọc tài nguyên của người khác, 409 conflict/state/version, 410 tài nguyên/quote hết hạn rõ ràng, 422 input, 429 rate limit, 503 dependency tạm không khả dụng. Payment pending có xử lý riêng trong S02, không mặc định là unpaid.
- API request body và payment headers có size limit cấu hình; không đợi tới lúc gửi tx mới phát hiện input không hợp lệ.

## 3. Identity và quyền

### 3.1 Web đăng nhập bằng ví

| Endpoint                    | Request               | Response/hành vi                                                                                                                                                               |
| --------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /v1/auth/siwe/nonce`  | `{}`                  | 200 `{nonce}` + signed browser-binding cookie; nonce lưu/consume bởi Better Auth, TTL 5 phút.                                                                                  |
| `POST /v1/auth/siwe/verify` | `{message,signature}` | 200 `{token,success,user:{id,walletAddress,chainId}}` + session cookie HttpOnly/Secure; message do client tạo/ký, domain/URI Payvoke, Fuji 43113, issued/expiry tối đa 5 phút. |
| `POST /v1/auth/sign-out`    | `{}`                  | 200, thu hồi session Better Auth và xóa cookie; không tự revoke grant onchain.                                                                                                 |
| `GET /v1/me`                | Không body            | Buyer, scopes/roles; không trả khóa hoặc bearer token.                                                                                                                         |

Cookie request thay đổi dữ liệu phải kiểm tra Origin/CSRF; CORS allowlist chính xác, không wildcard credentials. MVP hỗ trợ ví EOA đã deploy tài khoản thông thường; hỗ trợ contract wallet cần test ERC-1271 riêng, không giả định mọi SIWE library hỗ trợ. Đăng nhập không cấp quyền debit vault. [R1]

Auth dùng Better Auth 1.7.11 + SIWE plugin + Prisma adapter; viem verify chữ ký EOA. Nonce một lần bị consume cả khi verify thất bại; retry cần nonce mới. Session native lưu token trong bảng auth riêng, cookie được ký; không bật bearer plugin, không dùng session token làm authorization chi tiền. `User.id` là buyer ID; `Account` chỉ là tài khoản provider đăng nhập của Better Auth, địa chỉ ví nằm trong `WalletAddress`. Session TTL 7 ngày, không refresh/cookie cache; `/v1/me` kiểm tra suspension của User và không trả token. API auth cũ không chạy song song; initial migration mới chỉ dành cho DB trống. `GET /v1/auth/get-session` là endpoint session native của Better Auth.

### 3.2 External buyer client

Scoped bearer token là **quyền gọi API**, không phải quyền chi. Các scope: `catalog:read`, `workspace:read`, `invocation:prepare`, `invocation:submit`, `invocation:read`, `invocation:continue`. Token ràng buộc buyer/client/workspace, expiry, revocation; quy trình cấp cho MCP local ở S03. Không dùng provider API key để mua hàng.

### 3.3 Provider

API key chỉ cho một app và scopes: `products:write`, `events:read`, `events:ack`, `reports:write`, `files:write`. Secret chỉ hiện lúc cấp, lưu hash ở server, prefix cho nhận dạng; log redact. Web wallet có quyền chủ app tạo/rotate/revoke key qua `/v1/provider/apps/{appId}/keys`.

Mỗi app có tối đa **một key active**. Tạo key mới thu hồi key cũ trong cùng transaction; rotate không trả lại secret cũ qua GET. Key không được đổi payout wallet hoặc operator role; thay payout cần chủ app xác thực ví.

Wallet-auth management endpoints:

- `POST /v1/provider/apps {name,description?,visibility,payoutAddress,clientRequestId}` trả 201 app.
- `GET /v1/provider/apps` và `GET /v1/provider/apps/{appId}` trả app, command, key summary và availability.
- `PATCH /v1/provider/apps/{appId}` cập nhật name/description/visibility/payout.
- `POST /v1/provider/apps/{appId}/keys` trả 201 `{keyId,secret,scopes,expiresAt}` một lần.
- `POST /v1/provider/apps/{appId}/keys/{keyId}/revocations` thu hồi key.
- `POST /v1/provider/apps/{appId}/suspensions` và `/activations` đổi status.
- `POST /v1/provider/apps/{appId}/archive` archive app.

Mất response lúc cấp key thì revoke record đó và cấp key mới, không lưu plaintext secret để replay. Không provider key nào tự tạo key quyền lớn hơn. External client authorization/pairing dùng endpoints trong [S03 §5](03-mcp-client.md#5-pairing-wallet-based-nhỏ-nhất-và-thu-hồi).

## 4. Đăng ký app và slash command

Provider có thể dùng Studio hoặc API; cả hai đi qua cùng validation. App tự xuất hiện trong store khi `PUBLIC` và chưa archive; app suspend vẫn hiển thị unavailable để giữ star nhưng không nhận quote/thread mới. Không có bước operator review.

### 4.1 App, command và revision

`appId` bất biến về owner. Command id bất biến; mọi thay đổi options, schema, giá, terms hoặc thời hạn tạo revision mới. Quote ghim `commandRevisionId`; không sửa revision đang phục vụ.

| Endpoint                                                      | Body                                                           | Kết quả                                             |
| ------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `POST /v1/provider/apps`                                      | `{name,description?,visibility,payoutAddress,clientRequestId}` | 201 app.                                            |
| `PATCH /v1/provider/apps/{appId}`                             | `{name?,description?,visibility?,payoutAddress?}`              | 200 app đã cập nhật.                                |
| `POST /v1/provider/apps/{appId}/commands`                     | `CommandPayload`                                               | 201 `{commandId,revision}`.                         |
| `PATCH /v1/provider/apps/{appId}/commands/{commandId}`        | `CommandPayload` + `expectedRevisionId?`                       | 200 revision mới; conflict trả `REVISION_CONFLICT`. |
| `POST /v1/provider/apps/{appId}/commands/{commandId}/default` | `{}`                                                           | 200 đặt default command.                            |
| `DELETE /v1/provider/apps/{appId}/commands/{commandId}`       | Không body                                                     | 200 archive command; không xóa revision lịch sử.    |
| `POST /v1/provider/apps/{appId}/suspensions`                  | `{reason}`                                                     | Dừng quote mới; không xóa nghĩa vụ job cũ.          |
| `POST /v1/provider/apps/{appId}/activations`                  | `{}`                                                           | Bật lại app; vẫn cần heartbeat để available.        |
| `POST /v1/provider/apps/{appId}/archive`                      | `{}`                                                           | Archive app; giữ thread và biên nhận.               |

Các endpoint dưới `/provider` yêu cầu key đúng app hoặc phiên owner; key không đọc/ghi app khác. Studio cho owner quản lý mà không cần tạo API key.

### 4.2 Command payload

Field bắt buộc: `name,description,options,grossAmount,terms`. Field tùy chọn: `positionalParameter`, `outputSchema`, `expectedRevisionId` khi sửa. Mọi command đều tạo **paid invocation**; không có flag miễn phí hoặc bypass x402.

- `name`: không có dấu `/`, regex `^[a-z][a-z0-9_]{0,31}$`; namespace theo app. Cùng `/summarize` ở hai app là hai command khác nhau.
- Dành riêng `help`, `cancel`, `status` cho UI điều hướng; UI action miễn phí không được biến thành provider invocation.
- `options`: mảng `{name,description,type,required}` với type `STRING|INTEGER|NUMBER|BOOLEAN`; server compile thành JSON Schema input và lưu cả options để render form.
- `inputSchema`/`outputSchema`: JSON Schema 2020-12, root object. Schema depth/size/item limits do server cap. Không `$ref` remote, code hoặc regex không kiểm soát.
- Defaults chỉ áp một lần lúc chuẩn bị quote. Lưu effective arguments và hash chính bản đó; không áp default mới ở paid retry.
- `positionalParameter` nếu có phải là một string option. Free text được map vào đó; nếu không có, buyer nhập bằng form.
- `terms`: `{deliverySeconds,reviewSeconds,revisionPolicy,refundPolicy,sideEffects,dataUse}`. `revisionPolicy` phải có `{maxIncluded,description}`.
- Đề xuất, chưa bắt buộc: `terms.verification.minEvidence` khai báo mức bằng chứng tối thiểu trước khi được giải ngân (`SIGN` hoặc `REC` ở MVP). Ngữ nghĩa ở [M05](../modules/05-artifacts-and-verification.md#mức-bằng-chứng-trước-khi-giải-ngân-đề-xuất); khi bật sẽ tăng `schemaVersion` của TermsSnapshot vì field này đi vào `termsHash`.
- `grossAmount` dương, atomic USDC, nằm trong cap policy. Policy deployment cần thêm giá sàn so với chi phí gas ước tính (roadmap R02).

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
    "refundPolicy": "Không giao được kết quả thì hoàn toàn bộ; sai phạm vi được xét tranh chấp",
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
- Free text chỉ map vào `positionalParameter` của command đang chọn/default; không tự gọi command khác hoặc app khác.

## 5. Buyer API

### 5.1 Catalog, thread và star

| Endpoint                                    | Input                               | Output                                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/apps`                              | Query `q?,cursor?,limit?,saved?`    | App `PUBLIC` chưa archive, gồm `ACTIVE`/`SUSPENDED`; item `{id,name,description,visibility,status,availability,commandCount,fromPrice,updatedAt}`. `saved=1` lọc theo star. |
| `GET /v1/apps/{appId}`                      | Không body                          | App public hoặc app private của owner; command/active revision, giá, terms, availability.                                                                                   |
| `POST /v1/threads`                          | `{appId,clientRequestId}`           | 201 thread; app phải `ACTIVE` và chưa archive; replay idempotent; không charge.                                                                                             |
| `GET /v1/threads`                           | Query `q?,archived?,cursor?,limit?` | Thread của buyer, trộn mọi app, gồm app name/availability.                                                                                                                  |
| `GET /v1/threads/{threadId}`                | Không body                          | Thread, timeline, command/active revision, active quote nếu có.                                                                                                             |
| `PATCH /v1/threads/{threadId}`              | `{title}`                           | 200 đổi tên.                                                                                                                                                                |
| `POST /v1/threads/{threadId}/archive`       | `{}`                                | 200 archive; lịch sử vẫn đọc.                                                                                                                                               |
| `GET /v1/threads/{threadId}/ag-ui/events`   | `Last-Event-ID`/`after` tùy chọn    | Buyer SSE AG-UI theo cursor thread. S04.                                                                                                                                    |
| `GET /v1/threads/{threadId}/ag-ui/snapshot` | Không body                          | Snapshot messages/surfaces/status và cursor nhất quán. S04.                                                                                                                 |

Thread khóa app nhưng **không khóa mọi lần gọi vào một revision vĩnh viễn**. Khi command được sửa, quote mới dùng revision hiện hành; invocation cũ luôn dùng revision cũ. Command bị archive không chạy nếu chưa có quote còn hợp lệ.

Store lưu app yêu thích qua `PUT/DELETE /v1/stars/{appId}` và `GET /v1/stars`. Collection không còn trong UI MVP; star vẫn giữ. App suspend giữ star nhưng hiển thị unavailable. App `PRIVATE` không xuất hiện trong catalog của buyer khác.

### 5.2 Chuẩn bị quote và bắt đầu invocation

`POST /v1/quotes`, body:

```json
{
  "threadId": "thread_example",
  "commandId": "command_summarize",
  "arguments": { "text": "Nội dung cần tóm tắt", "language": "vi", "maxWords": 150 },
  "contextSelection": { "messageIds": [], "briefVersionId": null, "fileIds": [] },
  "clientRequestId": "prepare_example"
}
```

Server kiểm tra command thuộc app của thread, access, file đã sẵn sàng, effective args, command revision/availability và giới hạn một invocation đang mở; resolve context từ dữ liệu đã lưu và đóng băng manifest. Chỉ phần buyer chọn được chia sẻ, không mặc định toàn bộ lịch sử.

201 trả `Quote` gồm:

```text
quoteId, invocationId, threadId, appId, commandId, commandRevisionId,
effectiveArguments, contextManifest, inputHash, termsHash,
network, asset, vault, providerPayout, grossAmount, feeBps, feeRecipient,
validUntil, deliveryDeadline, releaseNotBefore, resolveBy, quoteDigest, policyVersion,
inputSnapshot, termsSnapshot, policySnapshot, protocolQuote
```

Tạo quote chưa giữ tiền hoặc giao việc cho provider. Buyer xem input sau khi áp defaults và giá trước khi ký. Quote hết hạn trả 410 nếu chưa bắt đầu thanh toán. Nếu lần thanh toán trước còn UNKNOWN, hệ thống phải đối soát, không tự tạo quote mới. Chỉ chuẩn bị lượt khác khi đã xác nhận lượt cũ không có hold và không còn khả năng tạo hold hợp lệ theo S02.

`inputSnapshot`, `termsSnapshot`, `policySnapshot` và `protocolQuote` đúng shape/hash ở S02. Root fields là phần trình bày được suy ra từ snapshot; bất đồng root và snapshot trả `QUOTE_INCONSISTENT`, không tự chọn một bên để ký. `/v1/apps/{id}` trả command DTO gồm `id,name,description,revision:{id,options,inputSchema,outputSchema,positionalParameter,grossAmount,terms,deliverySeconds,reviewSeconds}` và collection trả `items,nextCursor` như quy ước chung.

`POST /v1/invocations` body `{quoteId}`, `Idempotency-Key` bằng **invocationId**. Cùng body chưa có payment trả 402 + `PAYMENT-REQUIRED`; cùng body có signed payload đi qua S02. Không nhận args hay giá mới tại endpoint này. Quote thuộc buyer/thread khác trả 404/403 trước settle.

Sau hold xác nhận: 202 + `PAYMENT-RESPONSE`, `Location: /v1/invocations/{invocationId}`, body `{invocationId,threadId,paymentStatus:"HELD",executionStatus:"QUEUED",statusUrl,resultUrl}`. Replay trả cùng logical invocation, không tạo charge/job khác; invocation đã xong có thể trả 200 trạng thái hiện tại.

### 5.3 Theo dõi và tiếp tục trong phạm vi đã trả

| Endpoint                                  | Body                                       | Hành vi                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/invocations/{id}`                | Không body                                 | `{invocationId,threadId,paymentStatus,executionStatus,question?,progress?,delivery?,failure?,nextActions}`; tách trạng thái tiền/công việc. |
| `GET /v1/invocations/{id}/result`         | Không body                                 | 200 phiên bản đã giao và artifacts; 409 `RESULT_NOT_READY` khi chưa giao; không tự trả bản provider chưa được kiểm tra.                     |
| `POST /v1/invocations/{id}/answers`       | `{questionId,arguments,clientRequestId}`   | 202, chỉ question đang chờ, validate schema câu hỏi; cùng scope invocation, không giữ thêm tiền.                                            |
| `POST /v1/invocations/{id}/revisions`     | `{reason,clientRequestId}`                 | 202 trong thời hạn/số lần/phạm vi đã hứa; ngoài phạm vi trả 409 `NEW_INVOCATION_REQUIRED`, không tự charge.                                 |
| `POST /v1/invocations/{id}/cancellations` | `{reason,clientRequestId}`                 | 202 ghi đề nghị dừng; không khẳng định đã dừng tác động bên ngoài hay đã refund.                                                            |
| `POST /v1/invocations/{id}/acceptances`   | `{artifactVersion,clientRequestId}`        | 200 ghi buyer đã chấp nhận, không bypass thời điểm payout tối thiểu S02.                                                                    |
| `POST /v1/invocations/{id}/disputes`      | `{reason,evidenceFileIds,clientRequestId}` | 201 hồ sơ; trả onchain dispute intent/status. Chỉ tranh chấp chain đã xác nhận mới chặn payout onchain.                                     |

**Hiện trạng 25/10/2026:** backend đã có `GET /v1/invocations/{id}`, `/answers`, `/revisions` và `/financial-intents` (unsigned recovery intents cho buyer). Chưa có `/result`, `/cancellations`, `/acceptances`, `/disputes` và toàn bộ §5.4 file; kết quả JSON đã giao hiện đọc qua snapshot AG-UI của thread.

Lời nhắn trả lời phải tham chiếu `questionId`; sửa phải tham chiếu invocation và được kiểm tra policy, không dùng arbitrary `free:true`. Câu hỏi render form theo schema; câu trả lời có thể nhập chat rồi map vào parameter string được schema question chỉ định.

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
data: {"type":"invocation.ready","invocationId":"invocation_example","runId":"run_example","threadId":"thread_example","input":{"sessionId":"thread_example","productId":"app_example","productVersion":1,"commandId":"command_summarize","arguments":{"text":"Nội dung cần tóm tắt","language":"vi","maxWords":150},"context":{"messages":[],"brief":null,"files":[]}}}

```

Envelope luôn chứa eventId/sequence/type qua event field, invocation/thread/command revision và nội dung đã được chọn. Các field `sessionId/productId/productVersion` trong `input` chỉ là tương thích quote document. File lớn chỉ gửi metadata + quyền tải invocation-scoped, refresh bằng endpoint app có kiểm tra scope. Không có payment signature, grant private key, cookie hay dữ liệu workspace chưa chia sẻ.

Outbox tạo `invocation.ready` sau finalized hold. Event khác: `invocation.answer`, `invocation.revision_requested`, `invocation.cancel_requested`; đều dùng cùng invocation, không charge. Mỗi event có ID và ACK độc lập. Với event bắt đầu chu kỳ thực thi (ready/answer/revision), payload chứa `runId` do Payvoke cấp; replay event giữ nguyên `runId`, continuation/revision có `runId` mới. Xem S04.

### 6.2 ACK và báo cáo

| Endpoint                                                  | Request          | Kết quả                                                                                                         |
| --------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /v1/provider/apps/{appId}/events/{eventId}/ack`     | `{invocationId}` | 200 `{eventId,acknowledgedAt}`; idempotent, xác minh event/app/job; ACK sau khi provider đã persist dedupe/job. |
| `POST /v1/provider/apps/{appId}/invocations/{id}/reports` | `ProviderReport` | 202 nhận report để áp workflow; không đồng nghĩa output đã giao.                                                |

**Lệch giữa đặc tả và code (25/10/2026):** implementation hiện ACK theo invocation, `POST /v1/provider/apps/{appId}/invocations/{id}/acks` với body `{eventId?}` (eventId là invocation, answer hoặc revision tương ứng với run). Chưa có `GET .../pending-events`. Trước nghiệm thu T066 phải chọn một hình dạng, cập nhật đặc tả hoặc code cho khớp và có test; không để hai hợp đồng song song.

`ProviderReport` có `{reportId,sequence,type,data}`. `reportId` unique trong app; retry cùng ID phải cùng body. Sequence tăng nghiêm ngặt theo invocation, serialize writer; duplicate hợp lệ trả kết quả cũ, out-of-order trả 409 `REPORT_OUT_OF_ORDER`, report sau terminal trái phép trả 409. Không tin timestamp provider để backdate delivery.

Các type/data:

- `started`: `{}` → RUNNING.
- `progress`: `{message,percent?}`; percent integer 0–100, không phải kết quả cuối.
- `question`: `{questionId,prompt,inputSchema,chatTextParameter?}` → WAITING_BUYER; chỉ một question mở; schema giới hạn như command, không xin private key/payment hoặc đổi mục tiêu. UI render `QuestionForm` trong thread; câu trả lời có thể nhập chat nếu schema chỉ định `chatTextParameter`.
- `result`: `{artifactVersion,output,files:[],presentation?}` → VERIFYING. `presentation` nếu có là `{format:"openui-lang",specVersion:"1.0",surfaceIds:[]}` tham chiếu các surface đã persist trong run và được validate theo catalog/version S04; không cho provider nhét HTML/JS hoặc tạo surface chưa lưu qua report. Không thay `output` hoặc làm kết quả tự được giao. Output validate approved outputSchema; file thuộc app/invocation đã READY. M05 kiểm tra rồi mới DELIVERED.
- `failed`: `{code,message,sideEffectStatus:"none"|"completed"|"unknown"}` → FAILED hoặc UNKNOWN theo bằng chứng; không tự refund.
- `unknown`: `{reason}` → UNKNOWN; platform điều tra, không tự rerun side effect.
- `cancelled`: `{reason,sideEffectStatus:"none"}` chỉ khi có cancellation request đang mở và provider xác nhận đã dừng/không gây side effect. Nếu side effect chưa rõ phải báo unknown; nếu đã hoàn tất thì không báo cancelled để xóa trách nhiệm giao hàng.

Transition report bắt buộc: started từ ACKED sang RUNNING; progress chỉ khi RUNNING/WAITING_BUYER và không tự kết thúc; question từ RUNNING sang WAITING_BUYER; result chỉ từ RUNNING sang VERIFYING. Answer được nhận từ WAITING_BUYER tạo continuation event và đưa về QUEUED, sau ACK/started mới RUNNING lại. Revision được chấp nhận từ DELIVERED tạo event QUEUED và yêu cầu artifactVersion mới lớn hơn bản đã giao, không reset report sequence. Failed/unknown chỉ áp dụng trạng thái execution chưa terminal; cancelled cần cancellation request trước terminal. Report trái transition trả 409 `INVALID_STATE`, không âm thầm sửa lịch sử.

Provider không gửi tùy ý `paymentStatus`, không có report `refund`/`payout`. Buyer question/answer miễn phí không cho provider thay command, tăng giá hoặc rút thêm dữ liệu. Context bổ sung cần buyer chọn rõ và audit; thay input tài chính/phạm vi phải chuẩn bị invocation mới.

### 6.3 Chống thực thi trùng

Payvoke bảo đảm không tạo hai logical ready event cho một invocation và vault không debit hai lần. SSE là at-least-once; provider MUST persist dedupe **trước ACK**, truyền invocation ID làm idempotency key cho side effect nếu nơi nhận hỗ trợ. Crash sau side effect nhưng trước ghi nhận không được diễn giải là chưa chạy. Không tự chuyển job đã ACK sang provider/app khác.

### 6.4 Streaming AG-UI / OpenUI (quyết định 23/10/2026)

Provider agent gửi token/chunk và widget qua **NDJSON streaming HTTP request** ở `POST /v1/provider/apps/{appId}/invocations/{id}/ag-ui/streams/{runId}`, sau khi ACK và report `started`. Đây là kênh **nội dung hiển thị**, dùng provider key `reports:write`, sequence/cursor riêng với `ProviderReport.sequence`; `GET .../ag-ui/streams/{runId}/cursor` hỗ trợ resume an toàn. Backend persist và phát bản chiếu AG-UI tới buyer qua SSE/thread stream: provider gửi envelope OpenUI Lang bằng `CUSTOM payvoke.openui`, gateway kiểm tra và chiếu thành buyer `ACTIVITY_SNAPSHOT` (`activityType:"openui-surface"`, `content.source`, `replace:true`) để tương thích hướng render AG-UI/OpenUI. S04 là hợp đồng chi tiết về ID, retry, allowlist events, snapshots, UI actions, version/catalog và xử lý lỗi.

Provider vẫn dùng HTTP reports `question/result/failed/...` để chuyển state. Kết thúc AG-UI run không xác nhận giao hàng hoặc kích hoạt payment. Không cho AG-UI `TOOL_CALL` hoặc hành động OpenUI bypass quote/x402.

## 7. State và concurrency

Payment status theo S02, execution status: `DRAFT`, `PAYMENT_PENDING`, `QUEUED`, `SENT`, `ACKED`, `RUNNING`, `WAITING_BUYER`, `VERIFYING`, `DELIVERED`, `FAILED`, `UNKNOWN`, `CANCELLED`. CANCELLED chỉ khi đã xác nhận không chạy/đã dừng, không từ click cancel. DELIVERED có thể mở in-scope revision về QUEUED/VERIFYING theo policy nhưng không tạo hold mới.

- Slot active invocation của thread khóa bằng DB constraint/transaction, không mutex trong process. DELIVERED chờ review không cho gửi thêm input tự do vào invocation cũ; tạo lượt mới khi slot đã đóng, revision/dispute vẫn theo invocation cũ.
- Revision cần chiếm lại execution slot của cùng thread; nếu invocation khác đang chạy, trả 409 `THREAD_BUSY`, không chạy chồng hai invocation trong cùng timeline và không charge để vượt giới hạn. Dispute/read không cần execution slot.
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
11. Text và widget OpenUI hiện dần trước report `result`; provider/buyer mất mạng và replay chunk không trùng text/surface. `RUN_FINISHED` chưa giao result; widget action không thể bypass `/answers` hoặc tạo charge (S04).

## Nguồn và phạm vi

- R1: SIWE/EIP-4361: https://eips.ethereum.org/EIPS/eip-4361
- R2: SSE event format/reconnect: https://html.spec.whatwg.org/multipage/server-sent-events.html
- JSON Schema: https://json-schema.org/draft/2020-12/json-schema-core.html
- Các endpoint, scopes, command syntax và lease policy do Payvoke thiết kế; x402/MCP không cung cấp sẵn. Cần sinh và kiểm tra OpenAPI từ implementation theo đặc tả này.
