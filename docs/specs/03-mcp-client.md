# S03 · MCP client ngoài và bridge thanh toán

> Trạng thái: đặc tả chưa triển khai. Adapter MCP dùng chung [buyer API S01](01-api-and-provider-protocol.md) và [scheme/vault S02](02-x402-and-vault.md), không tạo gateway/provider protocol hay scheme thanh toán thứ hai. Payvoke cần triển khai các endpoint pairing ở §5; chúng không thuộc chuẩn MCP/OAuth.

## 1. Quyết định và ranh giới

- **MVP: MCP server local qua stdio**, gọi là Payvoke bridge. MCP host (IDE/desktop) là MCP client; bridge là MCP server đối với host nhưng là HTTP client của buyer API. Không gọi bridge là một remote signer.
- Buyer API là nguồn sự thật cho catalog, quyền sở hữu, quote, invocation và kết quả. Bridge không gọi provider trực tiếp, không tự tính giá và không nhận provider API key.
- Khóa chi phiên được tạo và giữ trên máy buyer. Platform/facilitator/remote MCP không giữ khóa riêng buyer; chỉ nhận public key và chứng từ đã ký. Không bao giờ yêu cầu khóa ví chính.
- Mọi invocation mới đi qua custom x402 **upfront** của PayvokeVault trên Fuji; chỉ `HELD` đã được xác nhận mới cho phép phát việc. Không dùng x402 `exact` để thay thế scheme riêng.
- Remote Streamable HTTP chưa nằm trong MVP. Nếu bổ sung trước khi có thiết kế ủy quyền ký riêng, chỉ cho đọc: `search_apps`, `get_app`, `list_commands`, `get_invocation`, `get_result`, trong quyền được cấp. Không mở submit bằng cách đưa khóa buyer lên server.
- Không cung cấp MCP prompts, resources, sampling, roots, elicitation hoặc Tasks extension trong MVP. Dùng các tools tĩnh và polling API. Không phụ thuộc host có slash UI hay thông báo nền.

### 1.1. Phiên bản nguồn được chốt

Kiểm tra nguồn chính thức ngày **2026-10-19**:

| Thành phần         | Baseline                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP protocol chính | `2026-07-28`, current tại lúc kiểm tra [S1]                                                                                                           |
| TypeScript SDK     | Dòng v2, package server `@modelcontextprotocol/server` **2.3.1** tại commit `9bc40e903fde15534ec06ff4c1347d47000dbe16` [S2]                           |
| Server stdio       | `McpServer` từ package server; `StdioServerTransport` từ `@modelcontextprotocol/server/stdio` [S2]                                                    |
| Dependency         | Khi triển khai phải pin version chính xác + lockfile; kiểm tra package phát hành/integrity, không dùng `latest`, `^` hoặc chạy nguồn `main` trực tiếp |

Không trộn hướng dẫn SDK v1 (`@modelcontextprotocol/sdk`) với v2. Protocol mới khai báo version/capabilities trong metadata **từng request**, dùng `server/discover`, không mặc định handshake `initialize` hay MCP session [S1, S3]. MVP bắt buộc test host với baseline trên; host chỉ hỗ trợ `2025-11-25` phải được ghi rõ không tương thích hoặc có adapter legacy được kiểm thử riêng. Không âm thầm coi host cũ đã hỗ trợ bản mới.

## 2. Mô hình app, thread và commands

### 2.1. Thread, quyền chi và quyền API

| ID                      | Ý nghĩa                                              | Ràng buộc                                                                                         |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `threadId`              | Thread hội thoại của buyer API                       | Gắn bất biến `owner`, `workspaceId`, `appId`; không phải phiên đăng nhập hoặc phiên transport MCP |
| `grantId`               | Ủy quyền chi cho public spend key trong PayvokeVault | Hạn mức/thời hạn/thu hồi onchain; không phải scope API                                            |
| `clientAuthorizationId` | Quyền API cấp cho một cài đặt bridge                 | Token scoped, owner và workspace allowlist; thu hồi độc lập với `grantId`                         |

Một `threadId` chỉ dùng một app. Đổi app phải tạo thread mới. Mọi app có commands, command revision và JSON Schema do provider đăng qua Studio/API:

- UI web dùng chung chat + slash commands; free text ánh xạ vào tham số vị trí của command đang chọn/default, không tự biến thành lệnh chạy tùy ý.
- Command không có tham số vị trí mở form sinh từ options/schema trong thread; nhãn `/summarize` chỉ là cách tham chiếu command.
- MCP chỉ expose bộ tools cố định ở §7. `list_commands` trả metadata/schema động bên trong app; không đăng mỗi command thành một MCP tool, tránh thay đổi tool list theo phiên và collision.
- `commandId` ổn định trong app; `commandRevisionId` xác định definition/schema bất biến. Quote đóng băng đúng revision cùng input/context. Khi provider sửa command, quote cũ vẫn giữ snapshot hoặc bị API từ chối rõ ràng theo điều khoản; bridge không tự đổi revision rồi thu tiền.

### 2.2. Provider slash command không phải MCP prompt

MCP tools là hành động model có thể gọi; MCP prompts là mẫu messages để user chọn, có thể được một host trình bày thành slash nhưng protocol **không bắt buộc UI đó** [S4, S5]. `/ask` hay `/summarize` của Payvoke là command nghiệp vụ có schema/giá, không phải `prompts/get`, và lấy prompt không được gây thanh toán.

Nếu sau này thêm prompts tiện ích, chúng chỉ hướng dẫn chọn app/prepare, không thực thi command, không ký và không bỏ qua xác nhận. Không quảng cáo “thêm server là host tự có `/ask`”.

## 3. Transport và vòng đời

### 3.1. stdio MVP

1. User tự cài bản bridge có version/integrity đã kiểm tra và chấp thuận lệnh executable/arguments. Host chạy executable local đã pin, không đưa URL/lệnh từ provider vào shell.
2. Host trao đổi JSON-RPC qua stdin/stdout, một message mỗi dòng. **stdout chỉ dành cho MCP**; log đã redaction đi stderr. Browser approval, CLI hướng dẫn và key material không ghi vào stdout [S3].
3. Bridge đọc profile cấu hình local do user tạo: API origin cố định, chain/vault/token allowlist, keychain reference, client authorization, policy. Chỉ profile name/path cấu hình trusted lúc khởi chạy; không tool nào được đổi profile hay origin.
4. Dùng SDK v2 xử lý `server/discover`, metadata và capability; chỉ quảng cáo `tools`, `listChanged: false`. Tool list ổn định, sắp tên deterministic. Không giữ “app hiện tại” ngầm theo connection.
5. stdin EOF thì bridge dừng nhanh. Invocation đã tạo trên API vẫn tồn tại. Restart khôi phục journal local và dùng IDs để đọc/retry; không tự mua lại [S3].

Không mở cổng HTTP local cho MCP hoặc callback trong MVP. Chấp nhận rằng host/OS bị chiếm quyền cùng user có thể đọc bộ nhớ hoặc điều khiển tool; keychain và gate không bảo vệ tuyệt đối trước compromise máy local. Hạn mức onchain là lớp chặn thiệt hại cuối cùng [S9].

### 3.2. Streamable HTTP tương lai

Streamable HTTP phù hợp remote server đa client: một MCP POST endpoint; JSON hoặc SSE response. Bản `2026-07-28` **không còn** GET stream, `Mcp-Session-Id` hay resume bằng `Last-Event-ID`; subscription đi qua request riêng. Không lấy ví dụ HTTP+SSE cũ để triển khai [S6].

Remote protected MCP phải triển khai auth theo §5.5, kiểm tra Origin (có nhưng sai → 403), audience/scope từng request, rate limit và metadata/header nhất quán. `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` áp dụng theo bản protocol; dùng SDK/adapter đúng bản, không tự ghép JSON-RPC giản lược [S6].

Buyer API trả HTTP 202 khi chấp nhận invocation để xử lý. MCP transport trả HTTP 202 rỗng khi chấp nhận JSON-RPC notification. Không dùng response rỗng này thay cho kết quả `tools/call`.

## 4. Quyền truy cập và quyền chi

### 4.1. Token API

Bridge giữ external access token audience buyer API; bearer token nằm ở header Authorization khi gọi API, không trong tool arguments hay URI. Mỗi request API phải kiểm tra token còn hạn/thu hồi, owner, workspace và quan hệ ownership của mọi ID, không coi biết `quoteId`/`invocationId` là được quyền.

| Scope                 | Cho phép                                                                        |
| --------------------- | ------------------------------------------------------------------------------- |
| `catalog:read`        | Tìm/lấy app và command schemas                                                  |
| `workspace:read`      | Đọc context được cho phép trong workspace; không tự động chọn toàn bộ workspace |
| `invocation:prepare`  | Tạo thread và quote, chưa chi tiền                                              |
| `invocation:submit`   | Gửi invocation đã có quote; vẫn cần quyền chi và local approval                 |
| `invocation:read`     | Xem trạng thái/kết quả invocation thuộc owner và workspace đã cấp               |
| `invocation:continue` | Answer/revision/cancellation trong invocation hiện có                           |

Prepare cần thêm `workspace:read` khi chọn context; submit/continue/read đều phải kiểm tra workspace allowlist của object. Scope catalog không mở quyền đọc workspace. Không cấp wildcard hoặc scope provider/operator. Cấu hình read-only không có submit/continue và không tạo spend key.

### 4.2. Signing grant và policy

- User đăng ký public key local bằng giao dịch từ ví chính trên web, tạo `grantId`; thiết lập tối đa mỗi lần, tổng trong khoảng thời gian, expiry theo M10. Token API không có quyền tăng giới hạn onchain.
- Policy local phải có allowlist app/command/revision, workspace, max mỗi quote, max tổng trong kỳ, expiry, concurrency và cách tính reservation. User xác lập rõ trước khi bật submit; **không tự gán con số “an toàn”**.
- Hạn mức hiệu lực là giao của policy local, grant onchain, số dư và quyền API. Không đủ một điều kiện thì fail closed; không tự nạp, rút, approve token, thay key, tăng cap hoặc chuyển chain.
- Bản policy có version/hash và owner. Thay nới policy chỉ qua trusted CLI/UI ngoài tools, phải có xác nhận; không parse yêu cầu nới cap từ mô tả provider.
- Local reservation phải atomic giữa mọi process cùng profile. Sau crash, khoản chưa rõ phải tiếp tục giữ reservation đến khi đối soát, không giải phóng chỉ vì timeout.
- Khi HELD xác nhận, reservation chuyển thành gross đã chi trong kỳ/lifetime của policy; refund không tự reset allowance local, nhất quán với S02. Chỉ terminal admission thất bại và không có hold mới giải phóng reservation. Hash policy local gọi là `spendPolicyHash`, phân biệt `policyHash` của deployment trong quote S02.

## 5. Pairing wallet-based nhỏ nhất và thu hồi

### 5.1. Chọn HTTPS polling, không loopback

Payvoke dùng giao thức pairing riêng: người dùng đăng nhập ví trên browser, còn bridge chứng minh quyền sở hữu verifier để nhận token buyer API. Giao thức này không phải “MCP OAuth” và không tuyên bố tương thích OAuth Device Authorization Grant. Theo chuẩn MCP HTTP auth, stdio nên lấy credentials từ môi trường local thay vì dùng flow OAuth cho HTTP [S7]. Bridge dùng profile/keychain reference để lấy credential, không đưa secret vào model.

Chọn CLI pairing do **người dùng trực tiếp chạy ngoài MCP**, không expose `pair`/`authorize`/`approve` tool. Browser không tải khóa riêng về hoặc chuyển khóa cho bridge. Không cần localhost listener/callback URI và tránh thêm bề mặt DNS rebinding. Không dùng copy/paste access token từ chat.

### 5.2. Flow và endpoint bổ sung đề xuất

Các route dưới đây thuộc buyer-auth plane của S01; không thay đổi routes invocation ở §6. Mọi route HTTPS, origin đã pin. TTL/rate limit/token expiry là cấu hình bắt buộc ở §12.

1. **CLI tạo identity:** tạo verifier CSPRNG tối thiểu 32 byte, `challenge = BASE64URL(SHA256(verifier))`; verifier chỉ ở memory/keychain local. Tạo spend key local nếu user chọn paid mode; chỉ public key được gửi đi. Browser approval không dùng verifier.
2. **`POST /v1/client-pairings`** không có owner token, được rate limit. Body `{clientName, challenge, challengeMethod:"S256", requestedScopes, requestedWorkspaceIds, spendSigner?}`. Backend trả `{pairingId,userCode,verificationUri,expiresAt,pollIntervalMs}`. `spendSigner` là địa chỉ EVM 20 byte của key local, không private key. `pairingId` đủ entropy; userCode ngắn để nhập/đối chiếu, không phải credential. Lưu hash code/verifier challenge; giới hạn số lần thử code. Tên client là self-claimed, không trình bày như verified publisher.
3. **User mở browser thủ công:** CLI hiện origin trusted, code và địa chỉ spendSigner; mở URL cố định qua API hệ điều hành, không dùng shell. Web không nhận access token qua URL. User nhập code trên trang `/clients/pair`, đăng nhập ví theo M01 nếu cần; web gọi `POST /v1/client-pairings/lookup {userCode}` qua cookie + CSRF để nhận pairing metadata, không token. User đối chiếu code/signer với CLI, chọn workspace/scopes/expiry. Chỉ scope con của requested; requestedWorkspaceIds rỗng nghĩa user tự chọn workspace mình sở hữu, không nghĩa tất cả workspace. Nếu requested có IDs, chỉ chọn subset vừa requested vừa thuộc buyer. Trang cảnh báo rủi ro phishing code.
4. **Web chấp thuận:** `POST /v1/client-pairings/{pairingId}/approval` bằng cookie web session + CSRF + same-origin; body `{decision,scopes,workspaceIds,expiresAt}`. Chỉ POST sau một thao tác user rõ ràng; GET không cấp quyền. `frame-ancestors 'none'`, cookie Secure/HttpOnly/SameSite, không giữ “đã đồng ý mọi client”. Backend gắn owner từ session, không tin owner từ body. Pairing một lần; không sửa public key/challenge sau approval.
5. **CLI lấy token:** `POST /v1/client-pairings/{pairingId}/exchange` body `{verifier}` qua HTTPS; kiểm tra challenge constant-time, expiry, decision. Pending trả 202 `{status:"PENDING",pollIntervalMs}`; rejected trả 403 `PAIRING_REJECTED`, expired trả 410 `PAIRING_EXPIRED`, consumed trả 409 `PAIRING_CONSUMED`, verifier sai trả 403 không tiết lộ owner/token. Sau approval, backend trả 200 `{clientAuthorizationId,accessToken,expiresAt,owner,scopes,workspaceIds,spendSigner?}`. Exchange phát token duy nhất, atomic; không token ở browser, logs, MCP result hoặc query string. CLI kiểm tra khớp profile/signer trước lưu keychain. Không phát refresh token MVP; hết hạn phải pairing lại. Nếu mất response exchange sau khi đã consume, làm pairing mới; orphan authorization hết hạn hoặc được buyer revoke qua web, không cho replay nhận token.
6. **Đăng ký quyền chi riêng:** user mở trang vault đã xác thực, web hiển thị đúng public key/fingerprint pairing rồi ví chính ký giao dịch đăng ký cap/expiry trên Fuji. Bridge đọc trạng thái grant từ API/RPC trusted và kiểm tra chain/vault/key/owner; không coi approval API là grant onchain. Profile ghi `grantId` đã xác nhận. Token có submit nhưng chưa có grant vẫn không chi được.
7. **Kết thúc:** xóa verifier, code và pending record local khi thành công/hết hạn. API lưu audit pairing owner/client/public key/scopes/expiry, không lưu secrets. Polling theo server interval có backoff, không polling vô hạn.

Kiểm soát bắt buộc: giới hạn pending pairings theo IP/client, brute-force userCode, thời hạn ngắn, single-use, chống CSRF approval, không cho token của pairing A đi qua verifier B. Code/fingerprint đối chiếu không chứng minh binary đáng tin; user vẫn phải tự cài bridge chính thức. Hướng dẫn không phê duyệt mã do chat/người khác gửi nếu không tự khởi chạy CLI.

### 5.3. Lưu secret và local approval

- Dùng OS keychain cho access token và spend private key; profile/journal chỉ chứa key references, IDs và hashes. Nếu máy không có secure storage tương thích, **tắt paid mode**, không âm thầm ghi plaintext vào repository, config host hoặc environment dùng chung.
- Secret không nằm trong tool metadata, lỗi, telemetry, crash dump có thể thu thập hoặc log HTTP. Không log đầy đủ `PAYMENT-SIGNATURE` và không trả nó cho model.
- Chỉ executable/profile trusted được truy cập key; sandbox tối thiểu quyền và egress. Stdio không đồng nghĩa mọi executable local an toàn [S9].

### 5.4. Thu hồi

Đề xuất `GET /v1/client-authorizations` và `POST /v1/client-authorizations/{id}/revocation` trên web-auth plane để user xem thiết bị/scopes/last-used và thu hồi token ngay ở server. CLI logout xóa local token/key reference và yêu cầu revoke token; logout không được báo đã thu hồi onchain nếu chưa có giao dịch.

Hai nút riêng: **thu hồi API access** và **thu hồi spend grant** bằng ví. UI khuyến nghị cả hai nếu mất thiết bị. API revoke chặn thao tác mới ngay khi kiểm tra request; grant revoke chặn chứng từ chưa settle sau khi giao dịch revoke được xác nhận. Không bảo đảm hủy khoản đang settle/đã HELD trong race. Khoản đã trả vẫn thuộc owner, xem được trên web; không xóa invocation, không tự hoàn tiền, không đổi chủ sở hữu. Dừng local bridge không phải revoke.

### 5.5. Yêu cầu OAuth cho remote MCP

Nếu mở protected Streamable HTTP: MCP server là resource server OAuth, host là OAuth client. Cần Protected Resource Metadata RFC 9728, AS discovery RFC 8414 hoặc OIDC, OAuth 2.1 authorization code + PKCE, resource indicator RFC 8707 và audience binding; Bearer mỗi request, 401 cho token sai/hết hạn, 403 thiếu scope [S7]. Wallet login là cách AS xác thực user, không thay thế OAuth protocol.

Token audience MCP **khác** token buyer API. Không nhận token buyer rồi passthrough từ host xuống API. Remote adapter cần credential downstream được cấp đúng cho nó hoặc cơ chế exchange được thiết kế riêng; không có thiết kế đó thì chưa bật private remote access [S7, S9]. Discovery URLs phải chống SSRF, redirect validation và mix-up; không thực hiện arbitrary URL do tool cung cấp. Remote signing/delegation là đề tài riêng, không nằm trong spec này.

## 6. Buyer API duy nhất và x402

### 6.1. Ánh xạ bắt buộc

| Nghiệp vụ          | API                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| Tìm app            | `GET /v1/apps`                                                                                            |
| Lấy app            | `GET /v1/apps/{appId}`                                                                                    |
| Commands           | `GET /v1/apps/{appId}` trả command/active revision                                                        |
| Tạo thread         | `POST /v1/threads` body `{appId,workspaceId,clientRequestId}`                                             |
| Chuẩn bị           | `POST /v1/quotes` body `{threadId,commandId,arguments,contextSelection,clientRequestId}`                  |
| Submit             | `POST /v1/invocations` body `{quoteId}`, header `Idempotency-Key`; retry trả phí thêm `PAYMENT-SIGNATURE` |
| Trạng thái/kết quả | `GET /v1/invocations/{id}`, `GET /v1/invocations/{id}/result`                                             |
| Trả lời            | `POST /v1/invocations/{id}/answers` body `{questionId,arguments,clientRequestId}`                         |
| Sửa trong phạm vi  | `POST /v1/invocations/{id}/revisions` body `{reason,clientRequestId}`                                     |
| Hủy                | `POST /v1/invocations/{id}/cancellations` body `{reason,clientRequestId}`                                 |

Query filters/pagination và DTO chi tiết lấy từ spec API/OpenAPI cùng bộ tài liệu, không tự giả định đường `/mcp/run` hoặc `/apps/{id}/execute`. Các field adapter ở §7 là output MCP, không tự thêm chúng vào HTTP body ngoài bảng này.

### 6.2. Prepare không trả tiền

Quote trả **cả `quoteId` và `invocationId` đã reserve**, snapshot input/context/command revision/economics và `quoteDigest`. Bridge lưu snapshot/digest, thời hạn và mapping request local trước khi cho submit. Chuẩn bị không ký x402, không giữ tiền và không phát việc provider.

`contextSelection` đúng S01: `{messageIds:[],briefVersionId:null,fileIds:[]}`; server resolve phiên bản/content hashes từ dữ liệu thuộc buyer. Không ngầm upload filesystem, gửi nguyên chat host hoặc mọi tài liệu workspace. App không tự chọn message history ngoài phần buyer chỉ định. MVP không có tool upload/read file; file phải được upload trên web trước. Schema command có thể có text nghiệp vụ nhưng không được dùng để yêu cầu bridge fetch URL, đọc file local hoặc ký dữ liệu.

### 6.3. Submit có kiểm tra xác nhận

1. Model gọi `submit_invocation` với quote ID và digest đã thấy. Bridge lấy invocationId từ quote và dùng chính invocationId làm Idempotency-Key theo S01, không cho model chọn một submission identity khác. Bridge tra quote chuẩn bị, owner/profile và approval ngoài model ở §8; thiếu approval trả lỗi, **không ký**.
2. Bridge kiểm tra policy/grant/balance bằng nguồn trusted; reservation atomic theo `invocationId`. Kiểm tra quote còn hạn, input/context/command revision không đổi. Không tự re-quote nếu hết hạn.
3. Gọi `POST /v1/invocations {quoteId}` chưa có payment. API trả 402 + `PAYMENT-REQUIRED` cho **chính quote đó**. Auth 401/403 không phải lỗi thanh toán, không xử lý bằng ký tiền.
4. Kiểm tra challenge theo scheme Payvoke đã chốt: x402 version/scheme, `eip155:43113`, USDC/vault deployment allowlist, amount gross integer base units, invocation ID, quote digest, buyer, provider, phí/điều khoản, deadline. Mọi thành phần phải khớp quote và typed-data spec M06/M10; không dựng calldata hoặc domain từ mô tả provider. Mismatch → dừng trước ký.
5. Spend key ký payload chuẩn của custom scheme, bind `grantId` theo spec thanh toán. Retry đúng body và **cùng Idempotency-Key**, thêm `PAYMENT-SIGNATURE`; Authorization API vẫn phải có. x402 signature không thay thế owner auth. SDK generic x402 chỉ dùng nếu đã đăng ký custom signer đúng scheme; không fallback `exact` [S10].
6. Nhận 202 job sau `HELD` đã xác nhận; trả MCP result ngay có invocation ID/payment status/status hiện tại. Đọc `PAYMENT-RESPONSE` theo spec, nhưng nguồn đối soát cuối là API/onchain; không báo provider chạy chỉ vì client vừa ký.
7. Poll/read/answer/in-scope revision không trả tiền mới. Revision ngoài phạm vi phải bị từ chối và đưa user qua **prepare + quote + xác nhận mới**, không tự submit command khác. Hủy không tự hoàn tiền; trạng thái refund riêng do API/vault quyết định.

Thời gian chờ xác nhận onchain vẫn cần deadline RPC/HTTP hữu hạn. Nếu timeout trước 202, trả `SUBMISSION_UNKNOWN` cùng reserved invocation ID để đọc/reconcile, không treo MCP đến lúc provider giao xong.

## 7. Đặc tả bộ tools cố định

### 7.1. Quy tắc schema/output chung

- Tên dưới đây là tên MCP tool chính thức trong server Payvoke; không thêm slash vào tên. Outer `inputSchema` là JSON Schema 2020-12 object, `additionalProperties:false`; mọi field là required trừ có dấu `?`. ID là opaque non-empty string, không URL; validation theo API cho giới hạn độ dài. Không đoán ID từ tên người dùng.
- `arguments` là JSON object được validate theo **command/question schema đã tải từ API**, không eval/execute schema hoặc nhận schema từ caller. Chỉ local `$ref` đã đóng gói; không fetch `$ref` ngoài mạng. Giới hạn depth/size/schema complexity và tránh ReDoS.
- `clientRequestId` là business key không rỗng do caller cung cấp, được journal và hash-bound ở §9. Submit không nhận key tùy ý từ model: bridge dẫn xuất Idempotency-Key bằng invocationId. Không dùng JSON-RPC request ID làm khóa business. `expectedQuoteDigest` phải là bytes32 hex, không phải ID opaque.
- Thành công trả MCP `resultType:"complete"`, `isError:false`, `structuredContent:{ok:true,data:…}` và text JSON tương ứng để host không hỗ trợ structuredContent vẫn đọc được [S4]. Output schema từng tool có nhánh success/error; field `data` lấy từ DTO API cộng field adapter liệt kê dưới, không thay tên state API.
- Lỗi nghiệp vụ trả `isError:true`, `structuredContent:{ok:false,error:{code,message,retryable,requestId?,invocationId?,action?}}`. Không bao secrets/raw backend stack. MCP result hoàn thành không có nghĩa job đã hoàn thành.

### 7.2. Bảng tools

| Tool                 | Input                                                             | Output `data` tối thiểu                                                                                                                                                                    | Scope                                                  |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `search_apps`        | `{query?:string,cursor?:string,limit?:integer}`                   | `{items:[app summary],nextCursor?}`; query map sang HTTP `q`                                                                                                                               | `catalog:read`                                         |
| `get_app`            | `{appId}`                                                         | App DTO: ID, provider, command/active revision, terms, availability; không credentials                                                                                                     | `catalog:read`                                         |
| `list_commands`      | `{appId,cursor?:string,limit?:integer}`                           | `{items:[CommandDTO],nextCursor}`; DTO giữ `commandId,revision:{id,options,inputSchema,outputSchema,grossAmount,terms}` theo S01                                                           | `catalog:read`                                         |
| `create_thread`      | `{appId,clientRequestId,title?}`                                  | `{threadId,appId,title,createdAt}` từ API                                                                                                                                                  | `invocation:prepare`                                   |
| `prepare_invocation` | `{threadId,commandId,arguments,contextSelection,clientRequestId}` | Frozen quote DTO gồm `quoteId,invocationId,quoteDigest`, economics, expiry, command revision/input/context snapshot; adapter thêm `approvalRequired:true` và hướng dẫn user mở trusted CLI | `invocation:prepare` + `workspace:read` nếu có context |
| `submit_invocation`  | `{quoteId,expectedQuoteDigest}`                                   | `{invocationId,threadId,paymentStatus,executionStatus,statusUrl,resultUrl}` từ API; adapter thêm `accepted:boolean,pollAfterMs?`; 202 HELD → accepted true                                 | `invocation:submit` + policy/grant/approval            |
| `get_invocation`     | `{invocationId}`                                                  | Invocation DTO: ID, thread/app, trạng thái nghiệp vụ và payment tách biệt, progress, câu hỏi/schema đang chờ, timestamps; adapter thêm `pollAfterMs?`                                      | `invocation:read`                                      |
| `get_result`         | `{invocationId}`                                                  | Result DTO: nội dung/kết quả, verification, artifacts metadata, quyền/link xem trên web; chưa sẵn sàng → `RESULT_NOT_READY`                                                                | `invocation:read`                                      |
| `answer`             | `{invocationId,questionId,arguments,clientRequestId}`             | Invocation/action DTO; không tạo payment hay invocation mới                                                                                                                                | `invocation:continue`                                  |
| `revise`             | `{invocationId,reason:string,clientRequestId}`                    | Invocation/action DTO; ngoài phạm vi → `REVISION_OUT_OF_SCOPE`                                                                                                                             | `invocation:continue`                                  |
| `cancel`             | `{invocationId,reason:string,clientRequestId}`                    | Cancellation action/current invocation DTO; thể hiện requested/accepted/rejected theo API, không hứa refund                                                                                | `invocation:continue`                                  |

`create_thread` dùng clientRequestId và Idempotency-Key tương ứng như S01; mất response retry cùng key/body nhận lại thread cũ. `search_apps.query` map sang HTTP query `q`, không gửi tên query tùy ý. Các tool mutation có clientRequestId phải đặt header khớp; riêng submit tự lấy invocationId đã reserve làm key.

Annotations: các GET tools `readOnlyHint:true`; các mutation còn lại false. Submit/cancel phải được mô tả có tác động tài chính/nghiệp vụ. `idempotentHint` chỉ true khi dedup semantics thực sự được bảo đảm với keys bắt buộc; annotation không phải cơ chế cấp quyền, model/host không được dùng nó để bỏ gate [S4].

### 7.3. Kết quả và file

MVP không tự fetch URL do provider trả. `get_result` trả text có giới hạn và artifacts metadata; muốn tải/mở file thì user vào trang Payvoke trusted, qua quyền tải ngắn hạn theo API. Không trả signed download bearer URL vào model context nếu không cần. Không render HTML/script hoặc remote image tự động; đánh dấu output provider là dữ liệu không đáng tin. Result quá lớn phải trả tóm tắt/metadata với `truncated:true`, không âm thầm bỏ nội dung hoặc nhúng hàng MB vào context.

## 8. Gate chi tiền chống prompt injection

Bridge không coi `confirmed:true`, digest model gửi lại hoặc quyền gọi tool do host cấp là sự đồng ý trả tiền. `expectedQuoteDigest` chỉ dùng kiểm tra snapshot. Buyer phải duyệt quote qua CLI theo quy trình dưới đây.

MVP dùng trusted local CLI ngoài MCP: user tự chạy `payvoke approve-quote <quoteId>` (tên lệnh là yêu cầu UX, chưa có implementation). CLI lấy quote từ buyer API cùng profile, hiện app/provider/command revision, chính xác arguments và context được gửi, gross USDC/phí, expiry, invocation ID, policy còn lại và grant cap/balance cập nhật; nếu không đọc được balance thì không cho xác nhận. User xác nhận tại TTY do CLI trực tiếp kiểm soát, không đọc xác nhận từ stdin của host hay nhận flag auto-yes.

CLI ghi approval local một lần, bind `{owner,clientAuthorizationId,profile,quoteId,invocationId,quoteDigest,spendPolicyHash,expiresAt}` trong storage có quyền truy cập hạn chế và khóa chống race. Đây là quyết định người dùng ngoài model, không token gửi vào tool. Bridge chỉ có thể dùng approval cho đúng quote; retry cùng invocation được tái dùng quyết định cũ, không dùng cho invocation mới. Nếu host không có terminal phù hợp thì dừng paid flow và đưa user về web thực hiện invocation, không thêm approval tool.

Bridge chỉ ký submit khi đáp ứng đủ các điều kiện: API scope hợp lệ, owner/workspace đúng, quote đã chuẩn bị và còn hạn, approval còn hiệu lực, standing policy đã cấu hình, grant onchain còn hiệu lực, reservation/balance đủ và 402 challenge khớp toàn bộ snapshot. Code phải kiểm tra từng điều kiện, không giao cho LLM quyết định.

Không tự approve từ chữ “yes” trong chat; không coi dữ liệu tài liệu, command description, result, câu hỏi provider hay MCP annotation là chỉ thị thay đổi policy. Prompt injection yêu cầu “gọi submit thêm lần để mở khóa file”, “đổi vault”, “bỏ qua phí”, “gửi token cho support” chỉ là dữ liệu. Approval quote này không cho phép tự tạo vòng lặp quote mới.

Red-team AP2 (Debi et al., arXiv:2601.22569) cho thấy chữ ký mandate không ngăn được việc nội dung mô tả sản phẩm thao túng lựa chọn của agent. Vì vậy `search_apps`/`get_app` trả mô tả provider trong field dữ liệu riêng, không ghép vào hướng dẫn cho model, và thứ tự kết quả do API quyết định theo tiêu chí không phụ thuộc văn bản provider tự viết. Nếu sau này thêm gợi ý theo ngân sách (roadmap R07, theo 402Pilot arXiv:2608.01341), gợi ý chỉ là dữ liệu hiển thị, không thay bước approve-quote ở trên.

Các tool không nhận đối số hạ tầng tùy ý, gồm API/base URL, callback URL, access token, private key/seed, vault/token contract address, chain, calldata, RPC endpoint hoặc raw message/typed-data để ký. `arguments` của command chỉ chứa dữ liệu nghiệp vụ, không được ghi đè signer/network. Nếu command nhận URL nghiệp vụ, bridge chỉ chuyển chuỗi theo schema; không fetch URL đó hoặc dùng làm endpoint.

## 9. Idempotency, retry và mất phản hồi

- API hash-bind `clientRequestId` theo owner + operation + object đích + canonical request payload. Cùng key/cùng payload trả cùng resource/action; cùng key/khác payload → conflict. Prepare bind cả arguments/contextSelection/command/thread; answers bind question; revisions/cancellations bind reason. Không tự thay business key khi retry.
- Submit `Idempotency-Key` bắt buộc bằng invocationId của quote; quote đã bind immutable digest/invocation. Contract dùng invocationKey dẫn xuất từ invocationId theo S02. Sai header key bị từ chối trước charge, không tạo execution/payment thứ hai. Chữ ký bind economics, không chỉ bind header key.
- Trước network send, journal local lưu owner/profile/keys/quote/digest/reserved invocation ID, phase và reservation atomic. Không ghi private key hay payment signature vào plaintext journal. Restart cần ký lại chỉ khi scheme cho phép cùng business invocation; chưa rõ thì read/reconcile trước, không nonce/quote mới.
- Mất response prepare: retry cùng `clientRequestId` và body để nhận quote cũ. Quote hết hạn thì hiển thị lỗi, user chủ động tạo thao tác mới/approval mới.
- Mất response submit/settle: đọc `GET /v1/invocations/{reservedId}` trước. Nếu đã HELD/running/terminal, trả trạng thái đó; nếu chưa rõ, giữ reservation và retry đúng `{quoteId}` + key theo API hoặc đợi reconciliation. 404 không chứng minh chắc chắn “chưa giữ tiền”; không tự mua lại sau 404/timeout.
- Hai submit đồng thời qua nhiều process phải dùng lock/reservation local; backend và contract vẫn phải chống trùng vì local lock không đủ bảo vệ toàn hệ thống.
- 429/5xx/network: GET retry có backoff+jitter, tuân Retry-After; mutation chỉ retry cùng business key/payload, có deadline/attempt cap. 401 cần pairing lại; 403 không tự xin scope rộng hơn; 402 mismatch không retry ký.
- User gửi lại cùng logical operation sau restart dùng business key đã lưu; JSON-RPC ID mới không tạo giao dịch mới. Nếu user cố tình mua lần mới, phải có prepare/clientRequestId/quote/approval mới.

## 10. Async jobs và continuation

`submit_invocation` trả ngay khi API trả 202, không block đến kết quả cuối. MCP result trả job ID/giá đã giữ/state; host có thể gọi `get_invocation` sau khoảng `pollAfterMs` được API/config quy định. Bridge không giả định host có scheduler nền: text nêu rõ “đang xử lý; gọi get_invocation hoặc mở web để xem”.

- Không đổi tên API invocation state thành MCP task state; pass-through enum được OpenAPI định nghĩa. Payment `HELD`/refund/payout là chiều trạng thái riêng với pending/running/question/result nghiệp vụ.
- Khi cần input, `get_invocation` trả `questionId`, schema và nội dung question theo API; user trả lời qua `answer`. Question không được yêu cầu secret/ủy quyền chi. Hết hạn/câu hỏi cũ trả conflict; không tự suy ra một câu trả lời có giá.
- `revise` chỉ trong phạm vi/hạn của invocation đã trả. Không ký lại tiền, không tạo quote. `cancel` là yêu cầu nghiệp vụ cooperative; provider có thể đã chạy, không hứa dừng tức thì hoặc tự hoàn tiền.
- Đóng host, mất stdio, timeout tool hoặc JSON-RPC cancellation chỉ dừng chờ/network khi có thể; **không gọi cancellation API tự động**, không rollback HELD và không đồng nghĩa cancel provider job. Muốn hủy dùng tool `cancel` rõ ràng.
- Notifications/progress không phải nguồn sự thật và không có delivery guarantee. Job tồn tại dù không có kết nối; poll lại bằng invocation ID sau restart.
- MCP Tasks hiện là **extension tùy chọn** cần cả hai bên opt-in; ở bản cũ `2025-11-25` nó từng là experimental core feature. Không hứa host bất kỳ hỗ trợ Tasks; MVP dùng tools polling độc lập [S8]. Sau này có adapter Tasks thì task ID chỉ ánh xạ invocation ID, không tạo execution/charge thứ hai.

## 11. Lỗi và hành động phục hồi

Các mã dưới đây là mã adapter Payvoke; giữ `requestId`/mã lỗi gốc API ở audit, map từ API chứ không thay HTTP semantics. Lỗi cấu trúc JSON-RPC/unknown method/tool là protocol error; lỗi validation input nghiệp vụ/API/payment là tool execution error `isError:true` [S4].

| Mã                                                                                      | Retry tự động?                         | Hành động                                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_REVOKED`                                         | Không                                  | User pairing lại ngoài MCP; không ký tiền                                       |
| `INSUFFICIENT_SCOPE`, `WORKSPACE_FORBIDDEN`, `NOT_FOUND`                                | Không                                  | Kiểm tra quyền/ID; không lộ dữ liệu object khác owner                           |
| `INVALID_ARGUMENTS`, `COMMAND_VERSION_UNAVAILABLE`                                      | Không                                  | Trả field path/schema error đã redaction; lấy commands lại, prepare mới nếu cần |
| `THREAD_APP_MISMATCH`                                                                   | Không                                  | Tạo thread đúng app; không sửa app của thread cũ                                |
| `QUOTE_EXPIRED`, `QUOTE_DIGEST_MISMATCH`                                                | Không                                  | Không auto-requote; user chuẩn bị và xác nhận mới                               |
| `CONFIRMATION_REQUIRED`, `POLICY_DENIED`                                                | Không                                  | Chỉ ra trusted CLI/web và giới hạn bị chặn; không nhận approval qua model       |
| `SPEND_GRANT_MISSING`, `SPEND_GRANT_REVOKED`, `BUDGET_EXCEEDED`, `INSUFFICIENT_BALANCE` | Không                                  | Mở web trusted; ví chính xử lý grant/nạp nếu user muốn                          |
| `PAYMENT_CHALLENGE_MISMATCH`, `UNSUPPORTED_PAYMENT_SCHEME`                              | Không                                  | Dừng trước ký, audit; không fallback token/vault/network                        |
| `IDEMPOTENCY_CONFLICT`                                                                  | Không                                  | Cùng key khác payload; sửa caller, không đổi key để né conflict                 |
| `SUBMISSION_UNKNOWN`                                                                    | Chỉ read/reconcile hoặc retry cùng key | Trả reserved invocation ID, giữ local reservation                               |
| `QUESTION_STALE`, `REVISION_OUT_OF_SCOPE`, `INVALID_STATE`, `CANCELLATION_REJECTED`     | Không                                  | Đọc trạng thái, user quyết định; không mua thêm tự động                         |
| `RESULT_NOT_READY`                                                                      | Poll có backoff                        | Không submit lại                                                                |
| `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`                                                  | Có giới hạn                            | Retry-After/backoff; mutation giữ nguyên key/payload                            |

## 12. Cấu hình bắt buộc và điều kiện bật thanh toán

Không coi các mục sau đã được chốt chỉ vì có ví dụ. Deployment phải cấu hình, công bố UX khi ảnh hưởng user, và có test trước khi bật paid mode:

- API/web origins; Fuji chain ID, USDC/vault deployment, contract/domain version; scheme custom x402 và quote digest canonicalization lấy từ spec thanh toán, không tự định nghĩa bản thứ hai.
- Pairing TTL/code entropy/attempt limit/poll interval; token TTL; quyền tối thiểu, expiry của API authorization; không bỏ expiry.
- Quote TTL, approval TTL **không vượt quote expiry**, onchain confirmations/finality, HTTP deadline, retry/backoff cap, polling minimum và retention invocation/journal.
- Max schema/input/output sizes, max search page size, context/file giới hạn; policy cap/kỳ/concurrency do user xác nhận. Tiền biểu diễn integer base-unit string USDC (6 decimals), không dùng float để so tiền.
- Chính sách phí/trần, giữ tiền/hoàn/payout, xử lý pending reconciliation và grant window lấy từ M06/M10/spec thanh toán. Chưa chốt thì không enable spending; không dùng “MVP default” ngầm.

Audit ghi client authorization/profile identity (không secret), owner/workspace/app/thread/command revision, quote/invocation IDs, digest, business key hash, policy decision/reservation, approval timestamp, kết quả payment/reconciliation. Không log context nhạy cảm hoặc nội dung input mặc định; retention/access theo policy.

## 13. Ví dụ đầu-cuối

Ví dụ là **business tool arguments**, không phải JSON-RPC envelope hoàn chỉnh; SDK thêm metadata bắt buộc theo protocol. IDs, schema và amount chỉ minh họa, không deployment defaults.

### 13.1. App `/ask`

1. User chọn app `research`, command `/ask` với option `question:string`.
2. `create_thread({appId:"app_research",clientRequestId:"thread_ask_01"})` → `threadId:"thr_ask"`.
3. `prepare_invocation({threadId:"thr_ask",commandId:"cmd_ask",arguments:{question:"So sánh hai đề xuất trong file đã chọn"},contextSelection:{messageIds:[],briefVersionId:null,fileIds:["file_A"]},clientRequestId:"req_ask_01"})` → `quoteId:"quo_A"`, `invocationId:"inv_A"`, `quoteDigest:"digest_A"`, quote frozen. Digest trong ví dụ là nhãn minh họa; trên wire phải đủ bytes32 S02. Không lấy toàn bộ host chat.
4. User chạy CLI approve quote, xem input/file/phí/hạn mức và xác nhận. Host không cần có `/ask` slash; nó chỉ gọi prepare tool.
5. `submit_invocation({quoteId:"quo_A",expectedQuoteDigest:"digest_A"})` → bridge dùng Idempotency-Key `inv_A`, xử lý 402 rồi retry x402 → API 202/HELD → MCP trả `inv_A` ngay.
6. `get_invocation({invocationId:"inv_A"})` → câu hỏi; `answer({invocationId:"inv_A",questionId:"q_A",arguments:{focus:"chi phí"},clientRequestId:"answer_A"})`; không payment mới. Poll rồi `get_result`.

### 13.2. App `/summarize` qua form

1. App `document-summarizer` có command `/summarize`, options `{fileId:string,style:enum}`. Web mở form options trong thread chung.
2. `create_thread({appId:"app_summarizer",clientRequestId:"thread_summary_01"})` → `thr_summary`. Không dùng `thr_ask` cho command này.
3. `prepare_invocation({threadId:"thr_summary",commandId:"cmd_summary",arguments:{fileId:"file_A",style:"bullets"},contextSelection:{messageIds:[],briefVersionId:null,fileIds:["file_A"]},clientRequestId:"req_summary_01"})` → quote mới. API kiểm tra fileId/context thuộc owner và thống nhất; không tự tải đường dẫn local.
4. User approve quote mới; submit qua cùng x402 flow, poll `get_invocation`, rồi `get_result`.
5. `revise({invocationId:"inv_B",reason:"Giữ tối đa năm ý theo phạm vi đã mua",clientRequestId:"revision_B"})` không payment. Nếu API báo ngoài phạm vi, dừng và hỏi user có muốn một lượt mới; không tự quote/charge.

## 14. Acceptance tests bắt buộc

### Protocol và UI

- [ ] SDK package/version/integrity pin chính xác; `server/discover`, per-request metadata, tools/list và tools/call chạy với host/Inspector hỗ trợ `2026-07-28`. Host legacy bị từ chối rõ hoặc qua adapter legacy được test, không trộn era.
- [ ] Stdout chỉ có MCP messages; stderr và lỗi không chứa token/key/payment signature. EOF/restart không mất invocation đã tạo.
- [ ] Tool list cố định và outputSchema validate được cả success/error; không tạo dynamic tool cho provider commands, không quảng cáo prompts/Tasks không hỗ trợ.
- [ ] Mọi app dùng chung chat shell + slash command; command không có positional mở form. Test host không có slash UI vẫn hoàn thành cả hai ví dụ bằng tools.

### Auth, pairing và isolation

- [ ] Pairing phải do user chạy CLI; code sai/hết hạn/brute force bị chặn; approval GET/CSRF/clickjacking không cấp quyền; verifier B không đổi được pairing A.
- [ ] Cùng pairing exchange chỉ phát một token; mất response yêu cầu pairing lại; token không xuất hiện ở browser URL/MCP/log. Public key/scopes không thay sau approval.
- [ ] Wallet login/approval API không tự tạo grant. Token submit thiếu grant không ký; grant còn hạn nhưng token revoke cũng không được submit.
- [ ] Thu hồi token có hiệu lực trên request tiếp; revoke grant chặn settlement sau xác nhận; race đã HELD không bị báo hoàn tự động. Owner vẫn đọc kết quả trên web.
- [ ] Đổi owner/workspace bằng thread/quote/invocation/question/file ID đoán được bị chặn; possession of ID không phải auth.
- [ ] Không secure keychain → paid mode bị tắt; profile/config không chứa plaintext key. Tool args không đổi được origin/token/vault/chain/calldata.

### Thanh toán và chống injection

- [ ] Prepare, GET, answer, in-scope revision không gọi signer/settle. Submit thiếu explicit CLI approval hoặc standing policy bị từ chối dù model gửi “confirmed”/digest đúng.
- [ ] Approval bind quote/digest/invocation/owner/policy/expiry; sửa arguments/context/version/amount/phí/provider/deadline sau approval không ký.
- [ ] Challenge sai scheme/network/USDC/vault/owner/invocation/digest/economics bị chặn trước ký; 401/403 không đi vào 402 handler; không fallback x402 exact.
- [ ] Payment signature không thể thay API owner auth; API scopes không thể nâng grant cap; hết cap/số dư/expiry không phát việc provider.
- [ ] Prompt injection trong app description/file/provider question/result không tạo approval, nới cap, gửi secret, fetch URL hoặc mua thêm. `confirmed:true` bị outer schema từ chối.

### Idempotency và async

- [ ] Mất response prepare retry cùng key nhận cùng quote/invocation; cùng key đổi payload conflict. App của thread bất biến.
- [ ] Hai submit đồng thời/cùng quote/khác JSON-RPC IDs chỉ giữ tiền một lần và một logical provider execution. Khác idempotency key không cho thu lại cùng invocation.
- [ ] Crash sau ký, sau broadcast, sau HELD trước response, sau enqueue: restart dùng journal + read/reconcile; không tạo quote/invocation/nonce mới để né trạng thái chưa rõ.
- [ ] Local budget reservation atomic qua nhiều process; timeout/404 chưa rõ không giải phóng tiền để vượt cap. Backend/contract vẫn enforce độc lập.
- [ ] 202 trả MCP job handle ngay; provider chạy lâu không giữ tool đến hoàn tất; không có notifications/scheduler vẫn poll được sau reconnect.
- [ ] Question stale, revision out-of-scope, cancellation race đúng API; transport cancellation không hủy job hoặc hoàn tiền. Result chưa sẵn sàng không submit lại.
- [ ] 429/5xx retry có hạn và giữ business keys; output quá lớn/truncated/artifact không tự fetch/render nội dung độc hại.

## 15. Nguồn chính thức

Các URL protocol dưới đây pin revision, không dùng `/latest` để suy diễn hành vi. Source SDK pin commit; policy bảo mật/extension có thể cập nhật độc lập nên ghi ngày kiểm tra ở §1.1.

- **[S1]** MCP [Versioning](https://modelcontextprotocol.io/specification/versioning), [2026-07-28 compatibility/version negotiation](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning), [Basic protocol và metadata](https://modelcontextprotocol.io/specification/2026-07-28/basic). Nguồn cho current revision, statelessness và per-request metadata.
- **[S2]** Official TypeScript SDK [README tại commit pin](https://github.com/modelcontextprotocol/typescript-sdk/blob/9bc40e903fde15534ec06ff4c1347d47000dbe16/README.md), [server package 2.3.1 tại cùng commit](https://github.com/modelcontextprotocol/typescript-sdk/blob/9bc40e903fde15534ec06ff4c1347d47000dbe16/packages/server/package.json), [v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/). Nguồn cho stable v2/package split, stdio import và sự khác biệt v1/v2.
- **[S3]** MCP [stdio 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio). Nguồn cho framing, stdout/stderr, process lifecycle, metadata và legacy compatibility.
- **[S4]** MCP [Tools 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools). Nguồn cho tools/list/call, JSON Schema, structuredContent, resultType, error layers, untrusted annotations và human-in-loop.
- **[S5]** MCP [Prompts 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts). Nguồn cho prompt templates/user-controlled và không bắt buộc slash UI.
- **[S6]** MCP [Streamable HTTP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http). Nguồn cho POST/SSE, headers, Origin validation, bỏ GET stream/protocol session và HTTP notification 202.
- **[S7]** MCP [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [Authorization security considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations). Nguồn cho stdio khác HTTP OAuth, PRM/discovery/PKCE/resource/audience, token isolation và lỗi auth.
- **[S8]** MCP [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview), đối chiếu [Tasks experimental trong 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks). Nguồn cho extension opt-in, durable task handles, polling và support phụ thuộc host; không phải điều kiện cho MVP polling API.
- **[S9]** MCP [Security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices). Nguồn cho confused deputy, token passthrough, SSRF, handle hijacking, local execution/consent và rủi ro localhost.
- **[S10]** x402 Foundation [HTTP transport v2](https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md), [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md). Nguồn cho header/402 transport; **không** đặc tả thay PayvokeVault custom scheme. Các binding/cap/settlement cụ thể phải lấy từ spec x402/vault cùng bộ tài liệu.

Payvoke cần tự triển khai pairing, local CLI approval, scopes, bộ tools và quy tắc ngân sách trong tài liệu; chuẩn MCP không cung cấp sẵn các chức năng này.
