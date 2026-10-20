# Kiến trúc tích hợp x402 cho Payvoke

Ngày nghiên cứu: 19/10/2026. Trạng thái: đề xuất chưa triển khai; các quyết định sản phẩm hiện có vẫn giữ nguyên. Phạm vi: M03, M04, M06, M09, M10; không mở rộng sang nhiều chain hay thiết kế marketplace mới.

Sau nghiên cứu, [S01 API/provider](../specs/01-api-and-provider-protocol.md), [S02 x402/vault](../specs/02-x402-and-vault.md) và [S03 MCP](../specs/03-mcp-client.md) đã chốt chi tiết triển khai. Khi route, struct hoặc lựa chọn ở đây khác đặc tả, triển khai theo đặc tả. Bản nghiên cứu lưu bối cảnh, đánh đổi và nguồn tham khảo.

## 1. Kết luận kiến trúc

Chọn x402 v2 với scheme PayvokeVault riêng, thanh toán `upfront` để giữ tiền onchain và giao việc bất đồng bộ qua transactional outbox. Dùng một codebase backend; tách tiến trình API và settlement worker để API không giữ khóa settlement và worker có thể phục hồi độc lập. PostgreSQL lưu trạng thái workflow; vault là nguồn sự thật về tiền.

Bản đầu chưa cần microservices, smart account/ERC-4337, payment channel hoặc batch settlement.

Ba bảo đảm phải tách biệt:

1. **Đồng ý chi:** khóa phiên ký chính xác một invocation và điều khoản.
2. **Tiền đã giữ:** contract thực thi thành công, không chỉ facilitator báo `/verify` hợp lệ.
3. **Công việc đã giao/đạt:** workflow M04/M05/M09 xử lý; x402 không chứng minh chất lượng đầu ra.

Các quy tắc sản phẩm đã có nằm trong [M06](../modules/06-x402-payments-and-refunds.md), [M10](../modules/10-payvoke-vault.md) và [payment-patterns](payment-patterns.md). Những tên route, schema, bảng và module bên dưới là đề xuất, không phải interface đã tồn tại.

## 2. Những gì đã kiểm tra

- Repo có skeleton Fastify 5 + Prisma 7/PostgreSQL ở `apps/backend`, React/TanStack ở `apps/frontend`, Hardhat sample ở `packages/payvoke-vault`. Chưa có x402 trong dependency manifest đã đọc; không coi sample Counter là vault triển khai xong.
- Đã đọc đặc tả chính thức `auth-capture` và binding EVM, EIP-712, OpenZeppelin, tài liệu C-Chain RPC; dùng arXiv để xây threat model, không coi preprint là đặc tả SDK. [S1–S7, P1–P3]
- Đã đối chiếu SDK TypeScript tại commit **`faa1c694c66a3732aaabbce93bdae140e521a67d`** ngày 15/10/2026; manifest source core/Fastify ghi **2.28.0**. Đây là kiểm tra source, chưa xác nhận npm artifact hay chạy integration tests. [K0–K7]
- Đã thực hiện RPC **chỉ đọc** tới `https://api.avax-test.network/ext/bc/C/rpc`: `eth_chainId` trả `0xa869` = 43113; `eth_getBlockByNumber("finalized", false)` trả block; gọi `decimals()` ở USDC `0x5425890298aed601595a70AB815c96711a31Bc65` trả 6. Chưa gửi giao dịch, chưa kiểm tra EIP-3009/Permit2, chưa chứng minh end-to-end của vault hoặc facilitator.

## 3. So sánh các scheme

| Hướng                      | Phù hợp                                                | Đánh đổi với Payvoke hiện tại                                                                                                                                                                            | Kết luận                                               |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `exact` EVM                | API đồng bộ, chuyển khoản cố định                      | Không tự debit số dư nội bộ vault bằng khóa phiên. Chuyển tới vault cũng chưa tự ghi nhận buyer/job, giữ tiền, chia phí hay quyền hoàn.                                                                  | Không dùng để giả lập vault settlement.                |
| `auth-capture` EVM chuẩn   | Hold/capture/void/refund/reclaim                       | Binding hiện dùng canonical commerce-payments escrow và collector EIP-3009/Permit2. `operatorType: custom` vẫn chuyển tiếp collect tới escrow chuẩn; không phải chỗ thay bằng ledger PayvokeVault tùy ý. | Hướng thay thế nếu sau này đồng ý đổi funding/custody. |
| `batch-settlement`/channel | Rất nhiều micropayment, giảm gas từng request          | Voucher, claim và rủi ro chưa quyết toán; xung đột yêu cầu giữ tiền onchain trước mỗi lần giao việc. Hoàn số dư kênh không thay thế tranh chấp từng job.                                                 | Để sau khi đo chi phí chứng minh cần.                  |
| Vault + scheme riêng       | Deposit USDC, khóa phiên, job hold, phí và arbitration | Phải tự triển khai mechanism client/server/facilitator, đặc tả và security tests; giảm khả năng tương thích bên ngoài.                                                                                   | **Khuyến nghị theo yêu cầu hiện tại.**                 |

`auth-capture` đã định nghĩa lifecycle escrow. PayvokeVault dùng payload, contract và funding path khác nên không tương thích scheme `auth-capture` hoặc `exact` chuẩn. Vẫn cần kiểm tra deployment/facilitator hỗ trợ trên Fuji. [S1, S2]

## 4. Sơ đồ triển khai

```text
Browser client (giữ session private key)
  │ HTTPS: quote → 402 → ký → gửi lại
  ▼
Fastify API
  ├─ Identity: xác định buyer, quyền xem job/file
  ├─ Pricing: quote/input/terms bất biến
  ├─ Payment application module: điều phối admission + trạng thái tiền
  ├─ x402 resource-server adapter: envelope/header/protocol checks
  └─ Provider gateway: durable event, ACK, kết quả
       │
       ▼
PostgreSQL
  invocations / quotes / payment_attempts / chain_transactions
  chain_events / decisions / outbox / provider_receipts
       ▲                         │
       │                         ▼
Settlement worker         Outbox delivery worker
  ├─ custom facilitator       │ kết nối do provider mở
  ├─ relayer + nonce queue    ▼
  └─ reconciler/indexer     Provider (không cần x402)
       │
       ▼
Avalanche Fuji → PayvokeVault → USDC
```

Các module có thể dùng chung artifact backend với hai entrypoint/config; không cần tách thành từng dịch vụ. Tiến trình API không có khóa relay/refund/payout. Mỗi module quản lý phần trạng thái của mình; route gọi qua module thay vì tự gọi RPC và sửa balance.

Payment module cung cấp ba thao tác: yêu cầu giữ tiền cho invocation đã chốt, đọc trạng thái và áp dụng quyết định đã duyệt. Chi tiết x402, tx replacement, indexer và SQL locks nằm trong implementation. Dùng chung code digest/codec, không sao chép business rules sang ba vai trò SDK.

Tách interface tại x402 adapter, vault/RPC adapter, kho lưu trữ workflow và bộ phận giao event provider. Chưa cần abstraction đa blockchain khi chỉ dùng một network.

## 5. Một invocation xuyên suốt mọi lớp

### 5.1 Định danh

Giữ riêng nhưng liên kết rõ:

- `clientRequestId`: idempotency key của thao tác buyer; unique theo buyer.
- `invocationId`: định danh công việc và hold, sinh một lần trước thanh toán.
- `quoteId`/`quoteHash`: snapshot giá, provider, input và điều khoản.
- `authorizationDigest`: digest typed data, không dùng raw signature làm ID.
- `attemptId`: lần điều phối thanh toán; một invocation có thể có nhiều network attempt nhưng không nhiều khoản thu.
- `txHash`: một lần broadcast/replacement; không phải định danh công việc.
- `eventId`: event giao provider; replay dùng lại cùng event ID.

Onchain định danh tối thiểu theo `(chainId, vault, buyer, invocationId)`; DB áp unique constraint tương ứng. Nếu dùng `bytes32` cho invocation, quy định encoding cố định, không hash chuỗi tùy từng client.

### 5.2 Quote và dữ liệu được ký

Quote lưu bền vững trước khi phát 402. Không tính lại giá từ catalog đang thay đổi khi nhận paid retry.

Đề xuất EIP-712 domain: `name=PayvokeVault`, `version=1`, `chainId=43113`, `verifyingContract=<vault>`. Message chứa hoặc commitment xác định đầy đủ:

```text
buyer, sessionId/sessionEpoch, invocationId, quoteHash,
providerPayout, asset, grossAmount, feeBps, feeRecipient,
inputHash, termsHash,
validUntil, releaseNotBefore, resolveBy
```

Contract phải nhận và ràng buộc những trường thực sự điều khiển chuyển tiền/thời hạn; không chỉ kiểm tra một `quoteHash` opaque rồi nhận `provider`/`amount` khác ở calldata. Tên và Solidity types cuối cùng phải chốt trong scheme spec với test vector chung client/Solidity. EIP-712 **không tự cung cấp replay protection**. [S3]

- `quoteHash` và `inputHash` dùng encoding có version, golden vectors. Với JSON có thể dùng JCS RFC 8785, loại bỏ duplicate keys; số tiền luôn chuỗi số nguyên, không số thực. Hash file bytes và version file trong input manifest. Không `JSON.stringify` tùy tiện giữa các implementation. [S8]
- Client tự so khớp quote với giá/đầu vào mà buyer đã xem; không tự ký bất kỳ 402 nhận được từ network.
- Chặn redirect của paid request sang origin khác; allowlist HTTPS origin/network/vault/token, không tin URL hoặc contract tùy ý từ `extra`.
- Không đưa prompt/file thô, URL tải có token hay PII vào onchain metadata/header. Hash không phải mã hóa; dữ liệu ít entropy vẫn có thể bị đoán.
- Platform quote không tự trở thành đúng chỉ vì có chữ ký buyer. Gateway phải kiểm tra quote do mình phát. Contract bảo vệ consent/budget của buyer; nếu cần contract bảo đảm cả giá niêm yết/điều khoản do platform chốt, bổ sung chữ ký quote của platform với vai trò riêng, không mặc định đây là bảo đảm đã có.

### 5.3 Các thời hạn riêng biệt

| Mốc                            | Ý nghĩa                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `validUntil`                   | Hạn để hold mới thực thi thành công; không dùng để xóa hold đã tồn tại.                                       |
| `deliveryDeadline` trong terms | Hạn provider phải giao, xét ở workflow.                                                                       |
| `releaseNotBefore`             | Thời điểm sớm nhất được trả provider; tối thiểu bao trùm hạn giao + cửa sổ buyer kiểm tra/tranh chấp đã chốt. |
| `resolveBy`                    | Hạn cuối xử lý phần đang giữ; sau đó buyer tự reclaim được phần còn lại.                                      |

Kiểm tra ordering, duration caps và khoảng an toàn từ quote tới inclusion. Trả hàng quá muộn không được âm thầm rút ngắn thời gian khiếu nại hoặc tự sửa deadlines của hold.

## 6. Luồng HTTP và việc chạy bất đồng bộ

1. Buyer gọi `POST /invocations` với `clientRequestId`, product/version và input manifest. API xác thực, validate input, kiểm tra provider còn bán; ghi invocation/quote nhưng **chưa tạo event chạy**.
2. API trả `402` + `PAYMENT-REQUIRED` v2 cho đúng quote, network, token, vault và scheme riêng. Không giữ một HTTP request mở suốt quá trình provider chạy.
3. Client kiểm tra quote/policy rồi ký bằng khóa phiên; gửi lại cùng request ID, nội dung và `PAYMENT-SIGNATURE`. Input/quote khác trên cùng idempotency key trả conflict, không âm thầm tạo khoản thu khác.
4. API lookup trạng thái invocation **trước khi yêu cầu settle mới**. Nếu đã có hold cho đúng digest, trả trạng thái/receipt cũ dù chữ ký nay đã hết hạn hoặc session bị thu hồi. Đây là đọc lại kết quả, không phải cấp quyền thu mới.
5. Với hold mới: kiểm tra binding và schema; facilitator `settle` tự kiểm tra session/balance/expiry, mô phỏng đúng calldata rồi ghi durable settlement intent. **Core hiện bỏ gọi facilitator `/verify` với flow `upfront`**; tuyệt đối không đặt kiểm tra bắt buộc chỉ trong `verify`. Nếu gọi verify riêng để preview thì đó vẫn chỉ là kiểm tra sơ bộ, không khóa tiền và có thể lỗi thời ngay sau đó. [K2]
6. Worker ký/gửi `reserveHold` tới vault; lưu tx và theo dõi kết quả. Contract xác minh lại mọi điều kiện và cập nhật số dư + nonce atomically.
7. Chỉ khi trạng thái chain đã được xác minh, DB transaction chuyển payment sang `HELD` và ghi outbox `InvocationReady` cùng một commit. Không có lời gọi provider ở giữa bước broadcast và commit này.
8. Trả `202 Accepted` + job location/trạng thái và `PAYMENT-RESPONSE` thành công **khi đã chứng minh khoản giữ**. 202 nói job đang chờ xử lý, không nói kết quả đã đạt. Status/result endpoints dùng auth thông thường, không thu thêm x402.
9. Outbox worker phát event qua kết nối provider; ghi ACK riêng với completion. Kết quả M05/M09 mới dẫn tới release/refund.

**Nếu chain chưa rõ:** giữ `PAYMENT_PENDING`/`UNKNOWN`, trả lỗi non-terminal cùng URL trạng thái. Facilitator dùng `success:false`, `errorReason:"settlement_pending"`, `transaction:<hash>`, `network` khi đã có hash. Core tự gọi lại settle một lần với cùng payload; nếu vẫn pending, HTTP engine mặc định có thể trả **402 kèm `PAYMENT-RESPONSE` chứa hash**. Phải bảo toàn receipt này; frontend chuyển sang status reconciliation, không diễn giải mọi 402 là “chưa thu” để tạo chữ ký mới. Timeout trước khi biết hash cũng là UNKNOWN, tra bằng invocation ID. Không tự chế `success:true`. [K2, K3, K6]

Provider không nhận session key, payment signature hay bearer tải file ngoài phạm vi. Bản thân việc tạo job/giữ tiền là resource được chấp nhận; việc thực hiện dài hạn nằm ngoài HTTP paid retry. Đây là kiến trúc ứng dụng, không phải x402 tự cho tính atomic giữa chain và DB.

### 6.1 Tích hợp SDK

Dùng protocol engine/codec của `@x402/core` và viết ba adapter theo interface `SchemeNetworkClient`, `SchemeNetworkServer`, `SchemeNetworkFacilitator`. Chưa có SDK Payvoke cung cấp sẵn các adapter này. [K1]

| Interface đã xác minh                                                                                      | Phần Payvoke implement                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Client: `scheme`, `createPaymentPayload(version, requirements, context?)`                                  | So quote/policy, ký EIP-712 bằng session key và trả payload. Core ghép accepted/resource; cấu hình client allowed asset/decimals/cap đúng. |
| Server: `scheme`, `defaultAssetTransferMethod`, `paymentFlows`, `parsePrice`, `enhancePaymentRequirements` | Giá atomic integer, chỉ Fuji/USDC/vault/version đã pin; enrich bằng quote immutable.                                                       |
| Facilitator: `scheme`, `caipFamily`, `getExtra`, `getSigners`, `verify`, `settle`                          | Verify read-only; settle kiểm tra đầy đủ, journal/reconcile, hold và receipt có bằng chứng.                                                |

Đăng ký network **`eip155:43113`** bằng `.register(...)` của client/resource server/facilitator. `caipFamily="eip155:*"` là nhóm địa chỉ signer, không phải cam kết hỗ trợ mọi chain. Scheme name đề xuất `payvoke-vault`; đây không phải scheme được Foundation chuẩn hóa.

Đề xuất cấu hình server:

```ts
readonly scheme = "payvoke-vault";
readonly defaultAssetTransferMethod = "default";
readonly paymentFlows = {
  default: { supported: ["upfront"], default: "upfront" },
} as const;
```

`"default"` là sentinel SDK, **không gửi** `extra.assetTransferMethod="default"` lên wire. Requirements cần `extra.paymentFlow="upfront"`. `payTo` đề xuất là vault; provider payout được bind riêng trong authorization. Scheme spec phải nêu rõ settle là hold, không phải trả ngay provider.

Private facilitator expose `/supported`, `/verify`, `/settle` cho gateway qua authenticated internal HTTP; worker process giữ khóa, API process không giữ. `HTTPFacilitatorClient` trỏ URL Payvoke cấu hình rõ ràng, không dùng default public facilitator. `/supported` chỉ advertise v2/scheme/Fuji/version/vault đã triển khai; fail startup nếu gateway và facilitator lệch capability. `/verify` và `/settle` nhận body `{x402Version,paymentPayload,paymentRequirements}`, không nhận browser headers trực tiếp. `createAuthHeaders` trong source nhận object keyed `verify`/`settle`/`supported`, không phải flat authorization header. [K1, K6]

**Fastify:** `@x402/fastify` hiện settle ở `onRequest`, trước parse/validation body; không gắn nguyên trạng vào POST mà authorization bind nội dung. Khuyến nghị custom adapter mỏng ở `preHandler`, sau auth, schema validation và kiểm tra inputHash. Gọi core `processHTTPRequest`; giữ `beforeHandlerSettlement` và truyền đúng vào `processSettlement` để echo receipt, không settle lại sau handler. Chỉ hỗ trợ JSON trên paid endpoint trước; không thêm đường raw/streaming bypass. Không gắn đồng thời stock payment middleware lên cùng route. [K3, K4, K5]

Phương án ít adapter hơn là validate/lưu immutable intent trước, chỉ bảo vệ một endpoint confirm không nhận body mới; auth/intent gate phải đi trước middleware ở lifecycle thật. Không chọn cách này chỉ để bỏ qua body binding.

SDK có thể ghi log exception của hook rồi tiếp tục xử lý. Vì vậy, không dùng `throw` trong `onAfterVerify` để chặn thanh toán hoặc dùng `onAfterSettle` thay durable outbox. Đặt kiểm tra bắt buộc ở application gate/mechanism/contract; hook abort phải trả đúng kiểu SDK. Giữ receipt cả khi handler lỗi sau hold; HTTP 500 không tự refund và cũng không chứng minh tiền chưa giữ. [K2–K4]

**Wire:** ba header `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE` đều là base64 JSON envelope, không phải raw signature. Tái dùng codec trong `@x402/core/http`; decoder không thay schema/crypto validation. `amount` là chuỗi atomic units; `PAYMENT-RESPONSE.transaction` trỏ hold tx, `payer` là buyer chứ không phải session signer. Với CORS, server allow payment/idempotency headers và expose receipt/Location/Retry-After; không dựa vào fetch wrapper để tự cấu hình CORS. [K3, K7]

**Browser:** ưu tiên explicit flow qua `x402HTTPClient` và custom client thay vì blind `wrapFetch`. Wrapper có retry/recovery nhưng không có durable job/pending reconciliation; recovery có thể tạo payload mới. Giữ nguyên invocation/quote/authorization khi outcome chưa rõ, status polling không ký lại. [K7]

**Pending store:** SDK có `PendingSettlementStore` nhưng default là in-memory TTL 5 phút, không tự áp dụng cho custom scheme và không có atomic CAS/SQL transaction. Không dùng nó thay journal, successful receipt registry hay dedupe job. Core pending auto-retry khiến custom `settle` phải idempotent ngay từ lần gọi đầu. [K2, K8]

## 7. State machine và transaction journal

Tách ít nhất ba trục, không gom thành một cột `status`:

```text
Payment admission:
  UNPAID → AUTHORIZED → SUBMITTING → PENDING → HELD
                        └────→ UNKNOWN → reconcile → HELD / FAILED

Hold lifecycle (trạng thái chain):
  HELD → [DISPUTED] → PARTIALLY_REFUNDED / REFUNDED / RELEASED / RECLAIMED
  (partial refund vẫn có phần còn giữ; terminal khi remaining = 0)

Execution:
  NOT_QUEUED → QUEUED → SENT → ACKED → RUNNING
  → WAITING_BUYER / VERIFYING → DELIVERED / FAILED / UNKNOWN
```

`AUTHORIZED` ở DB chỉ nghĩa đã nhận chứng từ hợp lệ sơ bộ, **không** nghĩa tiền đã dành riêng. Một job có thể `FAILED` nhưng tiền vẫn `HELD`; UI phải thể hiện cả hai trục. Provider ACK không làm payment `RELEASED`.

### Bảng và unique constraints tối thiểu

- `invocations`: unique `(buyer, clientRequestId)`, frozen input/quote reference.
- `quotes`: immutable economic terms + hash + schema version.
- `payment_attempts`: invocation, digest, trạng thái, mã lỗi, next reconcile time; chỉ một active admission operation/invocation.
- `chain_transactions`: operation ID, chain, sender, nonce, txHash, replacementOf, receipt/blockHash. `(chain,sender,nonce)` định danh một nonce slot; slot có thể có **nhiều** txHash replacement, không đặt unique này lên bảng history khiến replacement không lưu được.
- `chain_events`: event identity `(chainId, blockHash, txHash, logIndex)`; giảm state theo hold ID/version, không giảm balance hai lần khi reindex.
- `decisions`: decision ID, approver, reason/evidence hash, số tiền, expected hold version, trạng thái thực thi.
- `outbox`: unique `(invocationId, eventType, eventVersion)` cho event logic, trạng thái phát/lease.
- `provider_receipts`: unique `(providerId, eventId)` và report ID; báo cáo trùng không tạo kết quả mới.

SQL transaction và unique constraints quyết định winner khi request đồng thời; không dùng mutex trong một Node process để bảo vệ nhiều replica. Worker claim bằng row lock/lease ngắn, có fencing/version khi hoàn tất. Có thể dùng `FOR UPDATE SKIP LOCKED` cho hàng đợi; không dùng nó để đọc balance nhất quán. Không giữ transaction SQL mở khi đợi RPC. [S9]

## 8. Gửi giao dịch và phục hồi

### 8.1 Ghi journal trước broadcast

Đề xuất cho EOA relayer bản đầu:

1. Một durable nonce queue trên mỗi `(chain, relayer)`; một writer/lease hợp lệ cho nonce allocation. Đối soát nonce pending của node với journal, không chỉ đọc một lần lúc boot.
2. Tạo operation và reserve nonce trong DB.
3. Ký raw transaction; ghi raw bytes/txHash và trạng thái `SIGNED` bền vững **trước khi broadcast**. Kiểm soát truy cập: raw tx có thể bị người khác broadcast đúng lệnh đã ký.
4. Broadcast; khi mất phản hồi, tra đúng hash và hold state. Có thể gửi lại chính raw tx; replacement giữ cùng nonce và semantic operation, không đổi hold/input.
5. Trước replacement hoặc cấp một tx mới, reconcile mọi txHash trong nonce slot. Contract `invocationId` consume-once vẫn là lớp chặn cuối cùng nếu nhiều attempt lọt qua.

Nếu dùng signer ngoài/KMS/managed relayer sau này, interface phải giữ được operation identity và khả năng tra cứu signed/broadcast transaction; không làm mất bảo đảm trên chỉ vì đổi signer.

### 8.2 Finality trên Fuji

Tài liệu C-Chain hiện mô tả consensus acceptance và execution tách nhau; `newAcceptedTransactions` phát **trước thực thi**. `safe`/`finalized` trỏ last settled block. Log query có thể chưa thấy log khi block chưa executed. [S6]

Điều kiện mở giao việc đề xuất:

- RPC đúng chain và vault/token đúng config; receipt `status=success`.
- Receipt thuộc block canonical; block thực thi đã nằm trong phạm vi `finalized` theo ngữ nghĩa node đang dùng.
- Có event của **đúng vault** khớp buyer/invocation/digest/amount/provider, hoặc đọc `getHold` tại finalized state để xác nhận tương đương.
- Lưu block number/hash, txHash, log index; không xem ERC-20 Transfer bất kỳ là bằng chứng job đã giữ tiền.

Trước triển khai cần pin node/RPC behavior và test gate này trên Fuji. Đã kiểm tra read-only `finalized` có đáp ứng, chưa kiểm tra transaction thực. Không cố định “đợi 2 giây”, không đánh đồng receipt count Ethereum với mô hình Avalanche, không bỏ gate vì RPC chậm.

### 8.3 Reconciler/indexer bắt buộc từ bản đầu

- Theo dõi SUBMITTING/PENDING/UNKNOWN quá lâu; query txHash, replacements và `getHold`.
- Backfill log từ deployment block/cursor durable, đến finalized head. WebSocket chỉ đánh thức worker, không là nguồn lịch sử duy nhất.
- Chain có hold nhưng DB chưa cập nhật: phục hồi snapshot/mapping từ journal, chuyển HELD và tạo outbox idempotently. Nếu mất cả input/quote thì dừng dispatch, xử lý recovery/refund; không thể tái tạo nội dung job từ hash.
- DB HELD nhưng chain không xác nhận: cách ly và điều tra RPC/cấu hình; không chạy theo DB cũ. RPC bất đồng thì fail closed.
- Thu hồi session không hủy hold đã xác nhận; expiry không xóa lịch sử. Quote hết hạn cũng không phải bằng chứng transaction cũ thất bại.

Reconciler đưa trạng thái Postgres về khớp blockchain sau sự cố. Hai hệ thống không có transaction atomic chung.

## 9. Vault: những bất biến cần đưa vào contract

Contract giữ sổ tiền, không giữ prompt, file hoặc verdict LLM.

### 9.1 Session authorization

- Buyer đăng ký khóa do browser sinh, session ID/epoch, expiry, trần một lần và trần một kỳ; chỉ buyer sửa/thu hồi. Check chain time, không tin clock browser.
- Định nghĩa kỳ cụ thể, ví dụ fixed epoch theo `floor(block.timestamp / periodSeconds)`. Không gọi fixed epoch là rolling window; chi sát hai phía mốc kỳ có thể gần gấp đôi trần trong khoảng thời gian ngắn.
- Đề xuất thêm lifetime cap mỗi session để có mức tổn thất tối đa dễ hiểu; đây là bổ sung cần đồng ý, không coi đã nằm trong M10. Nhiều session riêng không tự tạo owner-wide cap.
- Refund không tự reset `spent` của session. Nếu reset, buyer/session có thể tạo vòng lặp mua–hoàn để lách hạn mức hoặc tiêu gas của nền tảng.
- Re-register/update không khôi phục chứng từ cũ: bind session epoch; giảm limit không xóa counter. Contract kiểm tra lại revocation tại execution; `/verify` trước revoke không giữ quyền chi sau revoke.

### 9.2 Hold và tiền

Mọi số tiền là atomic USDC integer. Contract consume invocation ID, trừ available, tăng held và tăng spending counter trong **một** transaction. Việc rút và giữ đồng thời được EVM serialize; simulation thành công không đảm bảo transaction sau đó cũng thành công.

```text
Liabilities = buyerAvailable + heldRemaining + providerClaimable + platformClaimable
USDC.balanceOf(vault) >= Liabilities

Cho từng hold:
gross = refunded + releasedToProvider + releasedFee + heldRemaining

Khi đóng khoản giữ:
net = gross - refunded
fee = floor(net * feeBps / 10_000)
provider = net - fee
```

Nếu không có chuyển token thừa trực tiếp, balance và liabilities phải bằng nhau. Nếu ai chuyển USDC trực tiếp không qua deposit, đó là **surplus chưa phân bổ**, không được tự cộng vào buyer và không báo sai là mất khả năng chi trả. Không thêm hàm admin tùy ý sweep tiền được bảo chứng. [Đề xuất bất biến]

- USDC immutable, provider/fee recipient và bps chốt trong hold; bps dưới cap. Freeze/blacklist/pause của token vẫn là rủi ro bên ngoài vault; không hứa rút luôn thành công bất chấp token.
- Deposit đo token transfer hợp lệ theo asset đã chọn; không hỗ trợ fee-on-transfer/rebasing tùy ý. Dùng SafeERC20, checks-effects-interactions, ReentrancyGuard cho đường chuyển token. [S4, S5]
- Số dư UI là projection; không để một `UPDATE balances` ở backend tự sinh tiền.

### 9.3 Refund, payout và quyền tranh chấp

- Đề xuất `refundHeld` cho hoàn từng phần, `releaseRemaining` để đóng phần còn lại; mỗi quyết định có ID dùng một lần, expected hold version và số tiền. Cộng dồn refund không vượt gross; tính phí một lần trên net khi release để tránh rounding theo từng mẩu.
- Refund cần quyết định M09, kể cả trường hợp lỗi provider; provider tự báo lỗi không trực tiếp được quyền điều khiển tiền.
- Không release trước `releaseNotBefore`; disputed hold chặn auto-release, resolver cần quyết định riêng. Việc đã qua thời gian **không tự chứng minh** provider giao đúng: vẫn cần policy/attestation có quyền của M05/M09.
- Buyer mở dispute trực tiếp onchain trước release; ghi dispute chỉ trong DB không thể chặn một payout transaction đã vào chain. UI phải báo `dispute pending` tới khi xác nhận. Tại sát deadline, tx ordering quyết định, không hứa dispute có hiệu lực từ lúc click.
- `resolveBy` là mốc cứng, không admin kéo dài tùy ý. Sau mốc này, chặn release và cho buyer `reclaim` phần **còn giữ**, kể cả khi dispute chưa giải quyết. Không reclaim khoản đã trả.
- Provider và platform tự rút claimable; buyer rút available về ví mình. Pause admissions không chặn withdraw/reclaim hoặc session revoke. Token-level restrictions vẫn có thể cản transfer.
- Không payout trước cửa sổ hoàn/tranh chấp. Hoàn sau payout là nghĩa vụ cần nguồn dự phòng riêng; không tự lấy tiền buyer khác để bù.

### 9.4 Tách khóa duyệt và thực thi

Relay chỉ được gọi hold có chữ ký hợp lệ; không có quyền sửa giá, tạo chữ ký buyer hay rút available. Cần tách khóa/actor duyệt quyết định và worker gửi tx. Với operation có thể ảnh hưởng tiền, contract nên kiểm tra quyết định được ký bởi authority đúng, amount/hold version/decision ID; worker không tự thay quyết định.

Nếu cùng một process giữ cả khóa resolver và executor thì việc tách role không giúp khi process bị chiếm. Production dùng multisig/timelock cho admin và cap changes, tối thiểu quyền, không proxy upgrade tùy ý. Fuji có thể dùng actor test riêng nhưng phải ghi rõ chưa đạt mức custody production. [S5]

## 10. Outbox không đồng nghĩa exactly-once tác động bên ngoài

Ghi `HELD` và `InvocationReady` trong một SQL transaction xử lý lỗi DB-write/event-write. Chain-write/DB-write được reconciler xử lý, không phải outbox. [S7]

- Transport phát lại at-least-once; provider phải persist dedupe trước ACK, dùng invocation ID cho side effect nếu hệ thống đích hỗ trợ idempotency.
- Provider crash sau khi đã đặt lệnh/gửi email nhưng chưa lưu ACK: không thể chứng minh chưa chạy. Chuyển UNKNOWN/đối soát, không tự tạo invocation khác.
- ACK nghĩa đã nhận bền vững, không phải hoàn thành hoặc hết quyền hoàn.
- Retry progress/result dùng report ID và sequence/version; không thu thêm tiền.
- Không quảng cáo exactly-once toàn hệ thống. Bảo đảm thực tế: **at-most-once debit onchain + một logical job + delivery có dedupe**, còn side effect cần cooperation từ provider.

## 11. Threat model rút từ arXiv → kiểm soát cụ thể

| Rủi ro được nghiên cứu                                | Kiểm soát Payvoke đề xuất                                                                                                                                                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-resource/context substitution [P1, P2]          | Signature bind invocation, input, provider, giá, phí, terms, chain và vault; server compare với quote immutable.                                                                                                 |
| Replay/duplicate-settlement race [P1, P2]             | Consume-once onchain + SQL uniqueness + idempotent dispatch, không chỉ cache nonce trong RAM.                                                                                                                    |
| Kiểm tra đúng lúc verify nhưng sai lúc execution [P1] | Contract kiểm tra lại balance/session/expiry/caps; admission không dựa trên simulation.                                                                                                                          |
| Paid-but-denied hoặc unpaid service [P1–P3]           | Gate bằng finalized successful hold; pending reconciliation; compensation bằng refund và quyền reclaim có hạn.                                                                                                   |
| Facilitator gas abuse [P3]                            | Facilitator private/authenticated; chain/vault/function allowlist; schema/header limits; rate limit; simulate; trần gas/fee/budget. Không arbitrary calldata, arbitrary token hay ERC-6492 deployment từ client. |
| Lộ authorization/identity [P1]                        | Redact payment signature, cookie, signed URL, prompt; provider không nhận payment artifact; DB payload nhạy cảm có retention/access policy.                                                                      |

Các paper phân tích phiên bản cụ thể và có disclosure/patch; không thể suy ra mọi SDK hiện tại đều còn các lỗi ấy. Payvoke dùng mô hình phân xử có bên được tin cậy, chưa cần TEE/adaptor signatures của A402. Mô hình này không bảo đảm fair exchange trustless.

### Khóa phiên trong browser

Private key chỉ tồn tại client; ưu tiên in-memory, session ngắn, cap nhỏ, revoke UI rõ ràng. Không localStorage plaintext; IndexedDB cũng không tự bảo mật trước XSS. Web Worker không là security boundary chống script độc hại cùng origin; non-extractable key không ngăn code độc sử dụng signer. [S10]

Nếu cần reload không mất key, phải thiết kế encrypted persistence và recovery riêng. Bản đầu có thể tạo session mới sau reload; đây là đánh đổi UX có chủ ý. CSP nghiêm, tránh third-party script ở signing origin; không để LLM tùy ý gọi signer mà không qua deterministic quote/policy check.

## 12. Lộ trình triển khai và tiêu chí dừng

### Gate A — Đặc tả và vectors, chưa chạm tiền

- Chốt scheme name/version, `payTo` semantics, payload fields, request hashing, errors, `/supported`, pending mapping; mọi peer cùng revision.
- Viết shared typed-data/encoding vectors: TS sign → Solidity verify; thay một trường phải fail.
- Chốt fee/cap, kỳ hạn session, deadlines, quyền resolver, storage của session key. Không hardcode ngẫu nhiên rồi gọi đó là policy đã duyệt.

**Đạt:** spec đủ để một client độc lập tạo đúng authorization; unsupported scheme bị từ chối rõ.

### Gate B — Vault và bất biến local

- Deposit/session/hold/refund/release/reclaim/withdraw với test USDC.
- Fuzz/invariant tests, caller roles, revoke/expiry/concurrency, token transfer failures, donation surplus.
- Signatures replay cross-chain/vault/provider/quote/input và reset session đều bị chặn.

**Đạt:** không có đường chuyển tiền thiếu consent hoặc vượt liability; full/partial refund không sai fee.

### Gate C — Luồng HTTP → thanh toán → giao việc

- Một buyer, một provider, một giá cố định; 402 → ký → hold → 202 → outbox → ACK/result.
- Payment status/get result không thu thêm. HTTP retries/2 tabs không tạo hold hoặc job thứ hai.
- Fastify custom transport orchestration thay vì middleware đồng bộ thiếu durable context; pin SDK phiên bản thực sự dùng.
- Test giải mã đủ ba headers, chỉ advertise upfront, không gọi facilitator verify trên luồng này, giữ `beforeHandlerSettlement` để echo receipt. Auth/body/hash sai phải fail trước settle; hook throw không được dùng thay authorization gate.
- Kiểm thử cả pending auto-retry của core và browser recovery: pending 402/timeout 502 không tạo chữ ký/identity mới; HTTP 500 sau hold vẫn thể hiện receipt tiền đã giữ.

**Đạt:** chạy end-to-end local qua interface thật, không mock “settled=true”.

### Gate D — Fault injection và Fuji

- Kill worker trước broadcast, sau broadcast, sau receipt, sau DB commit, trước/sau provider ACK.
- Mất RPC response, receipt chậm, replacement, RPC sai chain, logs bị ngắt, outbox replay; recovery không phụ thuộc mở lại browser.
- Fuji: thử token thật testnet, hold/refund/release/reclaim, công bố txHash và balance delta; chứng minh gate finalized theo node thực.

**Đạt:** mọi hold có đường tiến tới job hợp lệ hoặc hoàn/reclaim; không double charge/dispatch trong các kịch bản đã kiểm thử. Không tuyên bố bảo đảm vô hạn khi DB+backup hoặc chain đều ngừng hoạt động.

### Chưa làm ở vòng đầu

Multi-chain, public facilitator, hosted facilitator failover, smart account/bundler/paymaster, batch voucher, ZK/TEE, tự động arbitration bằng LLM. Chỉ cân nhắc sau khi đo chi phí/latency và thấy vấn đề thực tế.

## 13. Quan sát, chi phí và vận hành

- Correlation: invocation → quoteHash → authorizationDigest → operation → txHashes → hold → outbox → provider report → resolution.
- Metrics: thời gian hold-finalized, pending/unknown age, số hold chưa dispatch, queue lag, duplicate suppressed, refund/reclaim latency, relayer AVAX, gas cost/invocation, liability mismatch.
- Fail closed admission khi RPC sai chain, reconciliation drift hoặc relayer budget cạn; giữ đường status/read/withdraw/reclaim khả dụng nếu hạ tầng/token cho phép.
- Một lượt thường có tx hold và tx giải quyết, ngoài deposit/session/withdraw. Đo gas của cả hai tx và các lần gửi thất bại trước khi chốt phí nền tảng.
- DB production phải persistent + backup/restore test. `compose.yml` hiện dùng `test-db` với tmpfs, **không** dùng làm database giữ workflow thật.
- Thanh toán và hold onchain minh bạch; platform vẫn tin cậy ở quote issuance, delivery verification và arbitration. Vault giảm quyền lấy tiền tùy ý, không loại bỏ mọi niềm tin vào Payvoke.

## Nguồn

### Primary sources

- **S1:** x402 `auth-capture` lifecycle: https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture.md
- **S2:** Binding EVM, collector/operator, consent, deadlines: https://github.com/x402-foundation/x402/blob/main/specs/schemes/auth-capture/scheme_auth_capture_evm.md
- **S3:** EIP-712, đặc biệt replay/frontrunning considerations: https://eips.ethereum.org/EIPS/eip-712
- **S4:** OpenZeppelin cryptography/EIP712/SignatureChecker: https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography
- **S5:** OpenZeppelin token/access utilities: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20 ; https://docs.openzeppelin.com/contracts/5.x/access-control ; https://docs.openzeppelin.com/contracts/5.x/api/utils
- **S6:** C-Chain RPC, acceptance/execution/finalized semantics: https://build.avax.network/docs/api-reference/c-chain/api
- **S7:** Transactional outbox và duplicate-consumer caveat: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- **S8:** JSON Canonicalization Scheme: https://www.rfc-editor.org/rfc/rfc8785
- **S9:** PostgreSQL locking, SKIP LOCKED: https://www.postgresql.org/docs/18/sql-select.html
- **S10:** OWASP browser storage security: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

### arXiv, dùng cho threat model

- **P1:** A Formal Analysis of Agent Payment Protocols, arXiv:2609.00060v1: https://arxiv.org/abs/2609.00060v1
- **P2:** Free-Riding the Agentic Web: A Systematic Security Analysis of x402 Payments, search trả metadata v2; HTML download tool không gắn version nên không khẳng định full text được pin v2: https://arxiv.org/abs/2605.30998
- **P3:** When HTTP 402 Meets the Blockchain: Risks on Emerging x402 Payments, arXiv:2607.19545v1: https://arxiv.org/abs/2607.19545v1

### SDK source đã pin

- **K0:** Commit khảo sát: https://github.com/x402-foundation/x402/commit/faa1c694c66a3732aaabbce93bdae140e521a67d ; core manifest: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/package.json
- **K1:** Mechanism interfaces: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/types/mechanisms.ts ; facilitator registration/discovery: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/facilitator/x402Facilitator.ts
- **K2:** Upfront verify behavior, hooks, requirements matching, `settleWithPendingRetry`: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/server/x402ResourceServer.ts
- **K3:** HTTP process/receipt/pending behavior: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/http/x402HTTPResourceServer.ts ; codecs: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/http/index.ts
- **K4:** Fastify middleware hooks: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/http/fastify/src/index.ts
- **K5:** Fastify lifecycle, body undefined ở onRequest: https://fastify.dev/docs/latest/Reference/Hooks/#onrequest
- **K6:** HTTP facilitator client, auth và timeout: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/http/httpFacilitatorClient.ts
- **K7:** Fetch retry/recovery: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/http/fetch/src/index.ts ; client/spend controls: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/client/x402Client.ts
- **K8:** Pending store: https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/facilitator/pendingSettlementStore.ts

Đã đọc abstract, phần đầu và passages liên quan của các paper; không phải formal verification của Payvoke. Nguồn GitHub `main` có thể đổi; khi implement cần pin commit/package/ABI và lưu compatibility manifest, không dùng nghiên cứu này như chứng nhận interoperability.
