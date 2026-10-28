# S02 · Scheme x402 và interface PayvokeVault

Trạng thái: đặc tả Payvoke v1 để triển khai, 19/10/2026; cập nhật hiện trạng 25/10/2026. Scheme do Payvoke thiết kế, chưa được Foundation chuẩn hóa. Đã có `PayvokeVault.sol`, package protocol/x402, facilitator và settlement worker với test local (xem [payment-acceptance](../payment-acceptance.md)); **chưa có deployment vault trên Fuji**. [S01](01-api-and-provider-protocol.md) định nghĩa HTTP nghiệp vụ; [nghiên cứu kiến trúc](../research/x402-integration-architecture.md) giải thích đánh đổi và SDK revision. Khi nghiên cứu cũ khác S02, triển khai MVP theo S02.

## 1. Phạm vi và cấu hình cố định

| Thuộc tính            | Quy định                                                                             |
| --------------------- | ------------------------------------------------------------------------------------ |
| Protocol              | x402Version = 2                                                                      |
| Scheme                | `payvoke-vault`                                                                      |
| Scheme version        | `extra.schemeVersion = "1"`                                                          |
| Network               | `eip155:43113`, chainId 43113                                                        |
| Asset                 | USDC Fuji `0x5425890298aed601595a70AB815c96711a31Bc65`, 6 decimals                   |
| Payment flow          | `upfront`, chỉ hỗ trợ flow này                                                       |
| `payTo`               | Địa chỉ vault đã deploy, không phải provider payout                                  |
| Settlement thành công | Khoản giữ đúng invocation đã thực thi thành công và được xác nhận theo finality gate |
| Payout/refund         | Lifecycle riêng của vault, không tự chạy sau HTTP handler                            |

Các địa chỉ vault/signer phải cấu hình theo deployment, không chép địa chỉ fixture. Startup fail nếu chain, codehash/ABI version, USDC, decimals, supported capability hoặc policy không khớp. Không tự fallback `exact`, chain khác hoặc public facilitator.

## 2. Điều kiện trước khi buyer ký

Buyer đã nạp USDC và đăng ký **grant** onchain cho session signer do client giữ. Grant không phải phiên chat, cookie hoặc token MCP.

`Grant` được định danh bởi `(buyer,grantId)`; `grantId` là bytes32 random của client, không tái sử dụng khi tạo grant mới. Dữ liệu: `signer`, `epoch`, `expiresAt`, `maxPerCall`, `periodSeconds`, `maxPerPeriod`, `maxTotal`, `spentTotal`, `currentPeriod`, `spentInPeriod`, `revoked`.

- Chỉ `msg.sender == buyer` tạo/cập nhật/revoke grant ở MVP, bằng giao dịch ví chính. Không bắt buyer ký lại mỗi invocation.
- Epoch khởi tạo là 1, update/revoke tăng epoch có checked arithmetic; grantId đã dùng không được đăng ký lại. Config update không reset counters dù cap mới thấp hơn số đã chi; trường hợp đó chặn admission mới, không tính phần còn lại bằng phép trừ unsigned bị underflow.
- Fixed period là `floor(block.timestamp / periodSeconds)`, không phải rolling window. Hạn mức kỳ mới reset đúng khi đổi epoch thời gian; total không reset vì refund hay đổi kỳ.
- `periodSeconds` bất biến cho một grant. Thay cấu hình grant tăng `epoch`, invalidate mọi authorization cũ chưa settle; giữ total/period counters, không reset để lách cap. Cấp grant mới là quyết định onchain mới của buyer, không tự chuyển spending history thành zero dưới cùng grant.
- Mọi cap dương, `maxPerCall <= maxPerPeriod <= maxTotal`, expiry hữu hạn. Nhiều grant không tự tạo cap tổng toàn ví; UI phải thể hiện tổng quyền đã cấp.
- Refund không tăng lại allowance. Revocation có hiệu lực khi tx revoke thực thi trước hold; simulation trước đó không giữ quyền.
- App access token được thu hồi thì gateway chặn submission mới, dù onchain grant còn sống. Ngược lại scope API còn sống không thay thế grant bị revoke.

## 3. Các hash và snapshot chuẩn

### 3.1 Encoding

`H(text) = keccak256(UTF8(text))`; JSON dùng JCS RFC 8785, không duplicate property, không NaN/Infinity; UTF-8, không Unicode normalize ngầm. Bảo toàn thứ tự array; ID/file/message selection được server sắp theo quy tắc được ghi trong snapshot rồi client xác minh lại. Số tiền trong JSON là chuỗi atomic integer.

Mapping ID nghiệp vụ sang bytes32:

```text
invocationKey   = H("payvoke:invocation:" + invocationId)
quoteKey        = H("payvoke:quote:" + quoteId)
usageSessionKey = H("payvoke:session:" + sessionId)
productKey      = H("payvoke:product:" + productId)
commandKey      = H("payvoke:command:" + commandId)
```

Không dùng txHash làm invocationKey, không lower-case opaque ID, không hash signature làm nonce. Địa chỉ EVM so theo 20 bytes, không theo case của chuỗi.

### 3.2 InputSnapshot

Object đúng shape sau; null và array rỗng phải explicit, không thay omitted/null tùy client:

```text
{
  schemaVersion: 1,
  sessionId, productId, productVersion, commandId,
  commandSchemaHash,
  arguments: effectiveArguments,
  context: {
    messages: [{messageId, version, contentHash}],
    brief: null | {briefVersionId, contentHash},
    files: [{fileId, version, contentHash}]
  }
}
```

`inputHash = H(JCS(InputSnapshot))`. `commandSchemaHash = H(JCS(approvedInputSchema))`. Messages theo thứ tự timeline/version, files theo fileId byte-order để định nghĩa canonical selection. Chỉ ID/version/content hash, không signed URL hoặc token. Actual input/provider event resolve từ snapshot và kiểm tra content hash; không gửi nội dung khác dưới cùng inputHash.

`TermsSnapshot` gồm `{schemaVersion:2,productId,productVersion,commandId,definition:approvedTerms,deliveryDeadline}`; `termsHash = H(JCS(TermsSnapshot))`. Version 2 bắt buộc `approvedTerms.verification.minEvidence` (`SIGN` hoặc `REC`), là mức bằng chứng tối thiểu trước khi release ([M05](../modules/05-artifacts-and-verification.md#mức-bằng-chứng-trước-khi-giải-ngân)); client từ chối quote thiếu field này.

`PolicySnapshot` gồm `{schemaVersion:1,policyVersion,feeBps,feeRecipient,quoteLifetimeSeconds,maxHoldSeconds,resolutionGraceSeconds}`; `policyHash = H(JCS(PolicySnapshot))`. Versioned policy lưu bền vững; buyer nhìn được policy/terms trước ký. Policy deployment còn có `minGrossAmount` (atomic USDC) là giá sàn đã duyệt so với gas hold + release do Payvoke trả; đây là luật admission (tạo command và quote), không nằm trong PolicySnapshot nên không đổi `policyHash`.

API quote phải trả đủ ba snapshot hoặc tham chiếu immutable có thể đọc/xác minh trước ký, không chỉ hash opaque. SDK custom client kiểm tra snapshots, commandId và allowed origin/network/asset/vault.

### 3.3 Deadline

```text
validUntil       = quoteIssuedAt + quoteLifetimeSeconds
deliveryDeadline = validUntil + approvedTerms.deliverySeconds
releaseNotBefore = deliveryDeadline + approvedTerms.reviewSeconds
resolveBy        = releaseNotBefore + resolutionGraceSeconds
```

Chốt trước ký, không tính lại dựa trên thời điểm retry. Contract yêu cầu `now < validUntil < deliveryDeadline <= releaseNotBefore < resolveBy`, duration không vượt deployment cap. Nếu reviewSeconds=0 thì bằng nhau được ở mốc release; policy nền tảng quyết định có cho phép 0 không.

`releaseNotBefore` là thời điểm sớm nhất được giải ngân. Quyết định nghiệp vụ chỉ được cho phép release sau `max(releaseNotBefore, actualDeliveredAt + reviewSeconds + khoảng gián đoạn truy cập được xác nhận)`. Release còn cần evidence mới nhất đạt `minEvidence` của TermsSnapshot. Nếu không đủ thời gian hoặc không đủ bằng chứng trước resolveBy thì hoàn tiền; không kéo dài hold bằng cách sửa chữ ký cũ. Contract kiểm tra deadline/counter; platform phải xác nhận việc giao và khả năng truy cập file.

## 4. EIP-712 chính thức của Payvoke v1

Domain bắt buộc:

```text
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
name = "PayvokeVault"
version = "1"
chainId = 43113
verifyingContract = deployed vault
```

Hai type theo đúng thứ tự field; type name/case là một phần digest:

```solidity
struct InvocationQuote {
    bytes32 invocationKey;
    bytes32 quoteKey;
    address buyer;
    bytes32 usageSessionKey;
    bytes32 productKey;
    uint64 productVersion;
    bytes32 commandKey;
    bytes32 inputHash;
    bytes32 termsHash;
    bytes32 policyHash;
    address provider;
    address asset;
    uint256 grossAmount;
    uint16 feeBps;
    address feeRecipient;
    uint48 validUntil;
    uint48 deliveryDeadline;
    uint48 releaseNotBefore;
    uint48 resolveBy;
}

struct DebitAuthorization {
    bytes32 quoteDigest;
    bytes32 grantId;
    uint64 grantEpoch;
}
```

`quoteDigest = _hashTypedDataV4(hashStruct(InvocationQuote))`; `authorizationDigest = _hashTypedDataV4(hashStruct(DebitAuthorization))`. Session signer ký **authorizationDigest**, không raw quote JSON, không personal_sign, không token EIP-3009. Quote được bind transitively qua quoteDigest; contract phải tái tạo digest từ đầy đủ struct thực thi.

Signature kiểm tra với signer của `(quote.buyer,authorization.grantId)` và epoch khớp. Client không tự chọn một signer address trong payload để contract tin. Bản đầu chỉ sinh ECDSA session signer; OpenZeppelin SignatureChecker có thể hỗ trợ grant signer ERC-1271 đã deploy khi đã có tests. Không nhận counterfactual/ERC-6492 factory hoặc arbitrary call từ payload.

EIP-712 không tự chống replay. Contract consume **invocationKey** một lần và lưu authorizationDigest; thay quote/grant không được charge lại invocation đã dùng. [R1]

## 5. HTTP payment envelopes

Tất cả payment headers là base64 UTF-8 JSON, không raw hex signature. Body chuẩn của paid submission vẫn `{quoteId}` như S01; context/args đã đóng băng ở quote.

### 5.1 PAYMENT-REQUIRED

```text
{
  x402Version: 2,
  resource: {url: URL canonical của route submit invocation, method: "POST"},
  accepts: [{
    scheme: "payvoke-vault", network: "eip155:43113",
    asset: fixed USDC, amount: quote.grossAmount, payTo: vault,
    maxTimeoutSeconds: quoteLifetimeSeconds,
    extra: {
      schemeVersion: "1", paymentFlow: "upfront", vault,
      invocationId, quoteId, quoteDigest,
      quote: InvocationQuote
    }
  }]
}
```

Đây là notation schema, không phải literal JSON với placeholder gửi lên wire. `quote` có đúng fields §4 và bằng `protocolQuote` trong API quote; EVM integers trong object này mã hóa canonical decimal strings kể cả productVersion/feeBps; address hex 20 bytes, bytes32 đủ 64 hex digits. API nghiệp vụ có thể trả feeBps/productVersion dưới dạng number an toàn; adapter chuyển một lần theo schema. Core `maxTimeoutSeconds` vẫn là JSON number theo x402 types.

`maxTimeoutSeconds` không biến thành rolling expiry; validUntil tuyệt đối luôn quyết định. Giữ requirements ổn định suốt quote, không `now+timeout` lại mỗi retry. Không thêm phần args/file vào header. `extra.assetTransferMethod="default"` không được gửi; sentinel này chỉ ở SDK config.

### 5.2 PAYMENT-SIGNATURE

```text
{
  x402Version: 2,
  accepted: exact selected PaymentRequirements,
  resource: same resource,
  payload: {
    authorization: {quoteDigest, grantId, grantEpoch},
    signature: "0x..."
  }
}
```

Signature field là hex bytes signature, không private key. Quote lấy từ persisted requirements, không cho client thay struct ở payload. Server so accepted với requirements immutable và body.quoteId; mọi economic/hash field phải khớp. Không đưa chúng vào `dynamicExtraFields` để né matching.

### 5.3 PAYMENT-RESPONSE

Thành công: `{success:true,transaction:<hold txHash>,network:"eip155:43113",payer:<buyer>,amount:<gross>,extra:{schemeVersion:"1",invocationId,quoteId,holdId:<invocationKey>}}`.

Pending khi đã broadcast: `{success:false,transaction:<known txHash>,network:"eip155:43113",payer:<buyer>,errorReason:"settlement_pending"}`. HTTP core có thể trả 402 dù đang pending; bảo toàn receipt và chuyển client sang status polling. Timeout chưa có hash vẫn UNKNOWN, lookup invocation/journal; không ký mới tự động. Không `success:true` trước finality gate, không dùng hash rỗng làm bằng chứng đã giữ.

HTTP 500 sau hold không phủ định successful payment receipt. Poll/result/answer/revision miễn phí không yêu cầu payment header và không replay debit; vẫn cần bearer/cookie đúng buyer.

## 6. Client/server/facilitator implementation

Dùng `@x402/core` revision đã pin trong research, không fork core. Ba adapters riêng theo SchemeNetworkClient/Server/Facilitator; common codec/digest vectors chia sẻ được. Không giả định public SDK có sẵn mechanism Payvoke.

### 6.1 Client

1. Kiểm tra authenticated buyer, quote ID/session/product/command/input và deterministic spending policy.
2. So network/asset/vault/domain config; từ chối redirect/cross-origin hoặc quote yêu cầu asset/vault lạ.
3. Đọc grant/balance hiện tại như preview; không coi preview là reserve.
4. Tạo DebitAuthorization, ký local bằng grant key; persist mapping invocation/quote/digest trước submit. Không chuyển private key vào tool input/MCP server từ xa.
5. Retry cùng identity/signature sau mất response; query status trước khi cân nhắc thao tác mới. Có thể retrieve receipt đã settle sau grant expired/revoked bằng read authorization.

### 6.2 Resource server

Auth → zod validation → owner/product/quote/input gate trong middleware và handler Hono → core processHTTPRequest → receipt HELD → SQL commit payment+outbox → 202. `@x402/fastify` source đang settle ở onRequest nên không gắn stock middleware lẫn adapter vào cùng route.

Với upfront, SDK không gọi facilitator verify; check bắt buộc không đặt chỉ ở verify/hook. `beforeHandlerSettlement` phải được giữ và truyền cho processSettlement để echo, không settle lại. Hooks thường nuốt exception; fail-closed gates phải có kết quả/lỗi thực sự ở orchestration/mechanism, không chỉ `throw` trong after hook.

### 6.3 Private facilitator

Facilitator cung cấp các thao tác x402 chuẩn supported/verify/settle (route cụ thể đọc từ code); chỉ gateway/service credential có quyền; verify/settle nhận `{x402Version,paymentPayload,paymentRequirements}`. Không bật public arbitrary relay.

Supported trả đúng v2/scheme/Fuji; `extra:{vault,schemeVersion:"1"}`, `signers:{"eip155:*":[relayerAddress]}`. Signers là relay gas payer, không buyer/session signer. Gateway fail startup nếu capability mismatch.

`verify`: shape/network/asset/vault/version/accepted bindings, quote persisted source, domain/digests, grant/signature, time/caps/balance, simulation. Read-only, không consume nonce/charge.

`settle` thực hiện **đầy đủ checks của verify lần nữa**, không tin verify đã chạy:

1. Lock/CAS durable operation theo invocationKey, kiểm tra existing hold trước khi check expiry/revoke của một admission mới.
2. Existing same authorizationDigest/quote → trả receipt cũ/state, không broadcast; existing khác → 409/terminal `invocation_conflict`.
3. Active pending attempt → reconcile đúng txHashes, không cấp nonce/charge mới. Core tự retry settle một lần khi errorReason=settlement_pending; custom mechanism phải idempotent.
4. Mới: validate trước, simulate calldata, reserve relay nonce, ký tx, persist signed bytes/hash trước broadcast. Process API không có relay key; facilitator worker giữ key.
5. Chờ gate §7 có timeout hữu hạn. Trả pending nếu chưa rõ; terminal failure chỉ khi có bằng chứng revert/reject hoặc grant/time không hợp lệ và không có hold/attempt đang mơ hồ.

Operation/journal lưu bền vững trong Postgres, không dùng InMemoryPendingSettlementStore TTL làm nguồn sự thật. Settlement signer chỉ whitelist vault/function/network; trần gas/fee, rate limit và tổng AVAX budget bắt buộc. SDK/provider key không được cấp quyền relay tùy ý.

## 7. Finality, DB và provider gate

Thành công phải có receipt `status=success`, đúng chain/vault event và hold khớp authorizationDigest/gross/provider. Block phải canonical và đã nằm trong phạm vi finalized/settled theo RPC node Fuji đang dùng. Có thể đọc `getHold` ở finalized state để đối chiếu. `newAcceptedTransactions` có thể xảy ra trước execution, không đủ. [R2]

Sau xác nhận, **một SQL transaction** cập nhật HELD và tạo `InvocationReady` unique. Không gọi provider giữa broadcast và commit. Cursor indexer durable, backfill finalized logs; WebSocket chỉ wakeup. Nếu có hold nhưng DB commit mất, reconciler tạo lại transition/outbox idempotently; nếu mất snapshot/input thì cách ly để recovery/refund, không dựng nội dung từ hash.

At-most-once debit là bất biến contract; một logical job là uniqueness DB; SSE/provider side effect là at-least-once có dedupe theo S01. Không tuyên bố chain+Postgres atomic hoặc exactly-once toàn hệ thống.

## 8. Interface contract đề xuất

Tên dưới đây là ABI mục tiêu; `packages/vault/contracts/PayvokeVault.sol` hiện thực interface này và được kiểm tra parity ABI/selector trong `packages/shared/test/protocol.test.ts`. Nếu code và đặc tả lệch nhau, sửa một trong hai kèm test, không âm thầm chấp nhận. Solidity struct types ở §4 phải dùng chung, không đổi field order để tiết kiệm gas mà không tăng scheme/domain version.

```solidity
function deposit(uint256 amount) external;
function withdrawAvailable(uint256 amount) external;
function registerGrant(bytes32 grantId, GrantConfig calldata config) external;
function updateGrant(bytes32 grantId, GrantConfig calldata config) external;
function revokeGrant(bytes32 grantId) external;
function reserveHold(InvocationQuote calldata quote,
    DebitAuthorization calldata authorization, bytes calldata signature)
    external returns (bytes32 holdId);
function applyDecision(ResolutionDecision calldata decision,
    address approver, bytes calldata approvalSignature) external;
function reclaim(bytes32 holdId) external;
function withdrawProvider(uint256 amount) external;
function withdrawPlatform(uint256 amount) external;
function getGrant(address buyer, bytes32 grantId) external view returns (GrantView memory);
function getHold(bytes32 holdId) external view returns (HoldView memory);
function availableBalance(address buyer) external view returns (uint256);
function hashQuote(InvocationQuote calldata quote) external view returns (bytes32);
function hashAuthorization(DebitAuthorization calldata authorization) external view returns (bytes32);
```

### 8.1 Structs và roles còn lại

```solidity
struct GrantConfig {
    address signer;
    uint48 expiresAt;
    uint256 maxPerCall;
    uint32 periodSeconds;
    uint256 maxPerPeriod;
    uint256 maxTotal;
}

struct ResolutionDecision {
    bytes32 holdId;
    bytes32 decisionId;
    uint64 expectedVersion;
    uint256 refundAmount;
    bool releaseRemainder;
    uint48 validUntil;
}
```

`GrantView` gồm GrantConfig, uint64 epoch, uint256 spentTotal/spentInPeriod, uint64 currentPeriod, bool revoked. `HoldView` gồm quoteDigest/authorizationDigest, buyer/provider/feeRecipient, gross/refunded/remaining/providerReleased/feeReleased, feeBps, deliveryDeadline/releaseNotBefore/resolveBy, closed, uint64 version và grantId. Event lưu invocationKey/quoteDigest để index mapping; transaction hash được lấy từ receipt, không contract state.

- `RELAYER_ROLE`: reserveHold có buyer authorization hợp lệ; không quyền rút/giải ngân.
- `FINANCE_EXECUTOR_ROLE`: gửi applyDecision nhưng vẫn cần chữ ký approver hợp lệ.
- `REFUND_APPROVER_ROLE`: duyệt decision có refundAmount > 0.
- `RELEASE_APPROVER_ROLE`: duyệt releaseRemainder; nếu vừa refund vừa release thì signer phải có cả hai role.
- `PAUSER_ROLE`: dừng admission mới. Admin/cap/role changes dùng delayed admin/multisig, không tùy ý lấy buyerAvailable hoặc upgrade implementation.

ResolutionDecision ký EIP-712 cùng domain, primaryType `ResolutionDecision`, đúng field order/width ở trên. SignatureChecker kiểm tra `approver` supplied có role đúng và ký đúng digest; không tin approver string từ worker. decisionId single-use, expectedVersion khớp, now<validUntil và now<resolveBy, refundAmount<=remaining; zero-refund/no-release/no-effect bị từ chối. Payvoke không có quy trình tranh chấp: finance worker ký decision bằng khóa approver theo policy tự động (§8.5) và gửi bằng khóa executor riêng; contract từ chối approver trùng executor.

### 8.2 reserveHold

- Chỉ relay đúng role; recompute quoteDigest và authorizationDigest.
- Nếu hold đã tồn tại với cùng digest, trả holdId không debit/counter/event mới; digest khác revert `InvocationConflict`. Facilitator vẫn ưu tiên đọc state để tránh mất gas duplicate.
- Với hold mới: pause gate; asset fixed; buyer/provider/feeRecipient khác zero; feeBps dưới cap; deadline ordering/caps; grant active/epoch/signature; sufficient available và gross/cumulative caps.
- Atomic: consume invocation, tăng grant spend, available trừ gross, held tăng gross; emit HoldReserved. Không chuyển USDC ra provider ở đây.
- Contract không xác minh inputSchema/giá catalog/chất lượng; gateway chỉ relay quote do platform phát và đã approved. Consent buyer được contract ràng buộc toàn quote, nhưng không quảng cáo giá catalog được chứng minh onchain.

### 8.3 Refund, release và reclaim

- `applyDecision` refundAmount trả về buyer available của chính hold. Refund từng phần chỉ giảm remaining; không ghi provider/platform income trước release.
- releaseRemainder chỉ khi now>=releaseNotBefore, now<resolveBy, state hợp lệ và decision đủ role. Khoản phí cuối = floor((gross - refundedTotal) * feeBps / 10000); provider nhận phần net còn lại. Release terminal, không release lần hai.
- Full refund hoặc remaining=0 đóng hold. Không refund từ hold đã release. Không `force payout` trước earliest deadline vì buyer đã bấm accept.
- Buyer `reclaim` khi now>=resolveBy, remaining>0, kể cả khi pause; trả phần còn giữ về available, đóng hold. applyDecision sau mốc này bị chặn để loại race capture/reclaim.
- Rút provider/platform chỉ từ claimable của msg.sender; available của buyer chỉ rút về buyer. Pause không chặn revoke, withdrawAvailable, reclaim. USDC freeze/blacklist vẫn có thể làm token transfer fail, không hứa chống lại issuer.

### 8.5 Policy hoàn tiền/giải ngân tự động

Payvoke không phân xử chất lượng nội dung. finance worker (`apps/api/src/workers/finance.ts`) quyết định mỗi hold đang mở theo đúng một trong các quy tắc sau, dựa trên evidence mới nhất, execution status và deadline trong hold đã finalized:

| Điều kiện                                                                                     | Decision                   |
| --------------------------------------------------------------------------------------------- | -------------------------- |
| Evidence đạt `minEvidence`, quan sát trước `deliveryDeadline`, block time >= earliest release | `releaseRemainder`         |
| Evidence đạt chuẩn nhưng quan sát từ `deliveryDeadline` trở đi                                | refund toàn bộ `remaining` |
| Earliest release >= `resolveBy`                                                               | refund toàn bộ `remaining` |
| Không có evidence đạt chuẩn và execution `FAILED`                                             | refund toàn bộ `remaining` |
| Không có evidence đạt chuẩn và block time >= `deliveryDeadline`                               | refund toàn bộ `remaining` |

Mỗi hold có tối đa một decision đang xử lý và tối đa ba lần thử; sau đó buyer tự reclaim sau `resolveBy`.

### 8.4 Bất biến và events

```text
tokenBalance >= sum(buyerAvailable + heldRemaining + providerClaimable + platformClaimable)
gross = refunded + remaining + providerReleased + feeReleased  (mỗi hold)
spentTotal/period tăng theo gross admission, không giảm theo refund
invocationKey chỉ reserve một lần
providerReleased + feeReleased chỉ tăng khi release đủ điều kiện
```

Token donation trực tiếp tạo surplus, không tự thành buyer balance. Không có admin sweep tùy ý vào liabilities; hỗ trợ duy nhất USDC fixed, không fee-on-transfer/rebasing arbitrary tokens. SafeERC20, EIP712/SignatureChecker, CEI, ReentrancyGuard và delayed roles theo OpenZeppelin đã pin. [R3]

Events tối thiểu: `Deposited(buyer,amount)`, `AvailableWithdrawn(buyer,amount)`, `GrantRegistered/GrantUpdated/GrantRevoked(buyer,grantId,epoch)`, `HoldReserved(holdId,buyer,quoteDigest,authorizationDigest,gross)`, `DecisionApplied(holdId,decisionId,version,refundAmount,providerAmount,feeAmount)`, `HoldReclaimed(holdId,buyer,amount)`, `ProviderWithdrawn`, `PlatformWithdrawn`, pause/role/cap changes. HoldView/read methods cung cấp những field không nằm trong log.

Custom error codes mục tiêu: `InvalidAsset`, `InvalidSignature`, `GrantExpired`, `GrantRevoked`, `GrantEpochMismatch`, `InsufficientAvailable`, `PerCallLimitExceeded`, `PeriodLimitExceeded`, `TotalLimitExceeded`, `QuoteExpired`, `DeadlineInvalid`, `FeeCapExceeded`, `InvocationConflict`, `HoldClosed`, `DecisionReplay`, `HoldVersionMismatch`, `ReleaseTooEarly`, `ResolutionExpired`, `ReclaimTooEarly`, `Unauthorized`. Mapping facilitator giữ errorReason machine-readable, không gom mọi lỗi thành “không đủ tiền”.

## 9. Persistence và recovery matrix

| Sự cố                             | Hành vi bắt buộc                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Hai paid requests cùng invocation | SQL/CAS một active operation; contract consume-once; cả hai đọc cùng receipt/job.                                 |
| RPC timeout sau send              | UNKNOWN, tra signed hash/nonce/hold; không ký lệnh debit mới.                                                     |
| Worker chết sau ký trước send     | Journal đã có signed bytes/hash; gửi lại chính tx.                                                                |
| Receipt revert                    | Không dispatch; lưu lỗi/nonce; cho user sửa quyền/số dư rồi thao tác theo state machine, không đổi input ngầm.    |
| Core retry settle pending         | Reconcile operation cũ, không broadcast lần nữa chỉ vì SDK gọi lần hai.                                           |
| Chain held nhưng DB chưa commit   | Reconciler phục hồi HELD và outbox, không cần browser online.                                                     |
| Provider offline/timeout sau hold | Job không mất; quá hạn giao thì finance worker hoàn toàn bộ, không thu thêm để retry.                             |
| Quote/grant hết hạn sau hold      | Đọc lại receipt và job vẫn hợp lệ, không reserve lại hoặc xóa hold.                                               |
| Balance projection lệch chain     | Dừng admission, reconcile; không sửa số dư DB như nguồn tiền độc lập.                                             |
| Refund muộn sau terminal payout   | Ngoài hold v1; cần reserve USDC riêng cấp vốn vào available bằng transfer thực. Không lấy số dư buyer khác để bù. |

## 10. Test vectors và gate nghiệm thu

Fixture máy đọc tại [fixtures/x402-v1.json](fixtures/x402-v1.json), được tính bằng viem đang cài trong workspace. Private key fixture là Hardhat key công khai, **không được dùng cho tài sản thật**. Fixture quote dùng input `{}` và terms/policy marker chỉ để kiểm thử hashing, không pass API/business schema; không coi là quote có thể bán.

Tests phải xác minh quoteDigest, authorizationDigest, recovered session signer và signature đúng fixture; Solidity hashQuote/hashAuthorization phải bằng TS. Hash/sign đã được tính bằng viem khi viết tài liệu; nay test vault (`PayvokeVault.ts`, "matches the exact published vector…") và test protocol xác nhận Solidity `hashQuote`/`hashAuthorization` khớp fixture.

Mutation tests: chain/vault/version/provider/amount/fee/input/terms/session/product/command/deadline/grantEpoch thay một trường thì fail consent hoặc mismatch. Ngoài ra:

1. Concurrent spend/withdraw/revoke không vượt cap hoặc âm balance.
2. Refund không reset allowance, period boundary đúng fixed epoch, update không reset counters.
3. Multiple partial refunds + terminal release ra fee đúng net, rounding không tạo tiền.
4. Decision replay/expectedVersion sai/worker thiếu approval không thay tiền.
5. Policy tự động refund khi lỗi/không giao/giao trễ và release khi giao đúng hạn; reclaim sau resolveBy hoạt động khi pause.
6. Invalid POST/body/quote ownership fail trước settlement; HTTP500/pending/timeout không mất receipt hoặc charge lại.
7. Kill/restart trên mọi điểm matrix; một hold chỉ có một logical provider ready event.
8. Fuji end-to-end với test USDC, receipt/event/finalized read và balance delta; công bố địa chỉ/roles/ABI/txHashes trước demo.

Deployment policy chưa chọn con số kinh tế: fee bps/cap, quote lifetime, max durations, resolution grace và gas budgets phải được chủ dự án duyệt và version hóa. Contract tests dùng fixture policy ngắn để test thời gian; không biến chúng thành production defaults.

## 11. Đối chiếu nghiên cứu bảo mật x402

Bảng dưới ánh xạ các quy tắc, bất biến và biện pháp trong nghiên cứu x402 năm 2026 vào yêu cầu của S02. Ký hiệu nguồn theo [danh mục paper](../research/agentic-payments-literature.md#danh-mục-paper): [P1] 2607.19545, [P2] 2605.30998, [P3] 2605.11781, [P4] 2609.00060, [P5] 2604.11430. Cột "Trạng thái" dùng cùng nghĩa với [payment-acceptance](../payment-acceptance.md).

| Nguồn                      | Yêu cầu                                              | Mục S02 chịu trách nhiệm | Trạng thái                      |
| -------------------------- | ---------------------------------------------------- | ------------------------ | ------------------------------- |
| [P1] SR1, [P4] P1/P9       | Payload khớp requirements đã persist, encoding chuẩn | §5.1–5.2, §3.1 (JCS)     | Local                           |
| [P1] SR2, [P4] P18         | Xác thực chữ ký đúng signer của grant/epoch          | §4                       | Local                           |
| [P1] SR3, [P4] P17         | Hết hạn/revoke có hiệu lực trước hold                | §2, §3.3                 | Local                           |
| [P1] SR4, [P3] M4, [P4] P5 | Chỉ success khi hold đã finalized                    | §5.3, §7                 | Local                           |
| [P1] SR5                   | Fail fast với payment không settle được/vô nghĩa     | §3.2, §6.3 bước 4, §8.2  | Local (giá sàn policy)          |
| [P1] SR6, [P4] P13         | Trần gas/phí và ngân sách sponsor                    | §6.3                     | Local; ngân sách thật chờ duyệt |
| [P1] SR7                   | `settle` kiểm tra lại toàn bộ                        | §6.3                     | Local                           |
| [P1] SR8                   | Chỉ settle calldata đã allowlist                     | §6.3                     | Local                           |
| [P2] F1 (I3), [P3] M3      | Chữ ký gắn đúng invocation/resource                  | §3.1, §4                 | Local                           |
| [P2] F2 (I4), [P4] P3      | Một authorization, một hold                          | §4, §6.3 bước 1–3, §9    | Local                           |
| [P2] F3 (I2), [P4] P8      | Không overdraft cap                                  | §2, §8.2                 | Local (không dùng `upto`)       |
| [P2] F4 (I1, I5)           | Không giao việc trước khi tiền được giữ              | §1 (`upfront`), §7       | Local                           |
| [P3] M2                    | Chỉ facilitator được ủy quyền mới settle             | §8.1 `RELAYER_ROLE`      | Local                           |
| [P3] M5, [P4] P16, [P5]    | Không cache/log header; không PII trong metadata     | §5, S01 §2               | Local                           |
| [P4] P4, P6                | Hold/refund/release/reclaim cùng tham chiếu hold     | §8.3, §9                 | Local                           |

**Conformance suite (R01):** `bun run --cwd apps/api test:conformance` chạy backend, protocol và vault suites một lần rồi đối chiếu từng mã ở cột "Nguồn" với các ca âm tính trong manifest `apps/api/test/e2e/conformance/rules.ts`. Suite fail nếu một quy tắc không có ca pass, hoặc nếu một ca trong manifest bị đổi tên, skip hay fail. M6 (chống steering ở discovery) được báo là DEFERRED vì thuộc R06, không được tính là pass. Các paper khảo sát scheme `exact`/`upto` công khai; bảng này chỉ khẳng định scheme `payvoke-vault` có yêu cầu và test tương ứng, không khẳng định đã được bên thứ ba kiểm toán.

## Nguồn

- R1: EIP-712, hashing và replay caveat: https://eips.ethereum.org/EIPS/eip-712 ; JCS: https://www.rfc-editor.org/rfc/rfc8785
- R2: Avalanche C-Chain RPC, acceptance/execution/finalized: https://build.avax.network/docs/api-reference/c-chain/api
- R3: https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography ; https://docs.openzeppelin.com/contracts/5.x/access-control ; https://docs.openzeppelin.com/contracts/5.x/api/token/erc20
- SDK source pin `faa1c694c66a3732aaabbce93bdae140e521a67d`: [mechanism interfaces](https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/types/mechanisms.ts), [resource server/pending retry](https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/server/x402ResourceServer.ts), [HTTP engine](https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/core/src/http/x402HTTPResourceServer.ts), [Fastify adapter](https://github.com/x402-foundation/x402/blob/faa1c694c66a3732aaabbce93bdae140e521a67d/typescript/packages/http/fastify/src/index.ts).
- Payvoke cần triển khai các struct/ABI/roles trong tài liệu; x402 và OpenZeppelin không cung cấp sẵn ABI này.
