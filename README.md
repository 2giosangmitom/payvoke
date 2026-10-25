# Payvoke

Payvoke là marketplace mua bán app AI, thanh toán bằng USDC theo từng lần gọi. Mỗi app dùng chung một giao diện chat, một danh sách thread và các slash command riêng.

Provider tự vận hành app. Payvoke cung cấp store, thread chat, quản lý command, giữ tiền qua x402/PayvokeVault, chuyển việc, lưu kết quả và xử lý tài chính/tranh chấp. Buyer có thể dùng qua web hoặc MCP bridge local dành cho ứng dụng AI.

> Phạm vi hiện tại là Avalanche Fuji và USDC testnet, chưa phải mainnet hay tiền thật. Phần dưới mô tả thiết kế mục tiêu; không có nghĩa toàn bộ tính năng đã được triển khai.

## Mục lục

- [1. Payvoke giải quyết bài toán gì?](#1-payvoke-giải-quyết-bài-toán-gì)
- [2. Trạng thái hiện tại](#2-trạng-thái-hiện-tại)
- [3. App, command và thread](#3-app-command-và-thread)
- [4. Các khái niệm cốt lõi](#4-các-khái-niệm-cốt-lõi)
- [5. Cách tính tiền](#5-cách-tính-tiền)
- [6. Hành trình của buyer](#6-hành-trình-của-buyer)
- [7. Vai trò của x402](#7-vai-trò-của-x402)
- [8. PayvokeVault và vòng đời tiền](#8-payvokevault-và-vòng-đời-tiền)
- [9. Chữ ký và snapshots](#9-chữ-ký-và-snapshots)
- [10. Provider tích hợp như thế nào?](#10-provider-tích-hợp-như-thế-nào)
- [11. Chống trùng và phục hồi sự cố](#11-chống-trùng-và-phục-hồi-sự-cố)
- [12. Trạng thái tiền và công việc](#12-trạng-thái-tiền-và-công-việc)
- [13. Kết quả, file, sửa và tranh chấp](#13-kết-quả-file-sửa-và-tranh-chấp)
- [14. MCP cho ứng dụng AI](#14-mcp-cho-ứng-dụng-ai)
- [15. Kiến trúc kỹ thuật và database](#15-kiến-trúc-kỹ-thuật-và-database)
- [16. Mười module chức năng](#16-mười-module-chức-năng)
- [17. Roadmap triển khai](#17-roadmap-triển-khai)
- [18. Quyết định còn mở và ranh giới MVP](#18-quyết-định-còn-mở-và-ranh-giới-mvp)
- [Tài liệu chi tiết](#tài-liệu-chi-tiết)
- [Tài liệu tham khảo và lời cảm ơn](#tài-liệu-tham-khảo-và-lời-cảm-ơn)

## 1. Payvoke giải quyết bài toán gì?

Ba bên chính trong hệ thống:

- **Buyer:** người mua và sử dụng dịch vụ.
- **Provider:** bên tạo, đăng bán và tự vận hành app.
- **Payvoke:** nền tảng điều phối công việc và thanh toán.

Provider có thể bán app nghiên cứu, app viết nội dung, app tóm tắt văn bản, app chuyển đổi file hoặc app phân tích dữ liệu. App không bắt buộc dùng LLM.

Buyer chọn app trong store hoặc từ danh sách thread, nhập yêu cầu, xem quote và gửi một lần gọi. Payvoke giữ khoản tiền tương ứng rồi mới giao việc cho provider.

Provider tự chạy phần mềm, quản lý hạ tầng thực thi và giao kết quả. Payvoke cung cấp giao thức nhận việc/báo cáo cùng các quy tắc thanh toán, dữ liệu và vận hành.

## 2. Trạng thái hiện tại

Kiểm tra lại ngày 25/10/2026 trên commit `a7b97ec`.

Hiện tại đã có:

- Tổng quan sản phẩm, mười module chức năng, bốn đặc tả (API/provider, x402/vault, MCP, AG-UI/OpenUI) và bộ thuật ngữ.
- `PayvokeVault.sol` với 82 test pass (71 Solidity gồm adversarial, fuzz và invariant; 11 Node.js) và Ignition module.
- `packages/payvoke-protocol` (EIP-712, JCS, snapshots; 8 test vectors/ABI), `packages/payvoke-x402` (adapter client/server/facilitator của scheme `payvoke-vault`) và `packages/openui-components` (catalog widget).
- Backend Fastify: đăng nhập SIWE, store/star, provider app/key/command revision, thread, quote, x402 gateway, facilitator riêng, settlement worker, finance (refund/release/reclaim), provider SSE/ACK/report, AG-UI/OpenUI stream, question/answer và revision. 10 migration Prisma; 112 test pass, 6 skip (case EVM/PostgreSQL cần cờ riêng); typecheck đầy đủ pass.
- Frontend: store, chat, Studio, renderer OpenUI và ký thanh toán; typecheck và build pass.
- Đối chiếu thiết kế với 13 nghiên cứu về x402 và agentic payments ([chi tiết](docs/research/agentic-payments-literature.md)).

Chưa có:

- Deployment vault trên Fuji và bằng chứng end-to-end trên Fuji.
- File, dispute, acceptance, cancellation, đọc kết quả riêng và resync event chưa ACK khi cursor hết hạn.
- Verifier cho file artifact (mức bằng chứng `REC` tự động). Mức bằng chứng tối thiểu trước khi giải ngân đã có (R03/R04): hiện chỉ có `SIGN` từ verifier JSON và attestation thủ công.
- OpenAPI sinh từ code, CI, cấu hình deploy backend/worker; frontend chưa có script `test` và browser E2E.
- MCP bridge (`apps/mcp`) và `packages/payvoke-client`.
- Migration production không phá huỷ; migration hiện tại được phép reset vì chưa release.
- Policy đã duyệt cho phí, deadline, con số giá sàn `minGrossAmount` (cơ chế đã có), ngân sách AVAX và chủ sở hữu key/role.

Có thể demo trên local/staging: Hardhat node chain ID 43113 + PostgreSQL + backend, facilitator, settlement worker + frontend. Chưa nên coi marketplace đủ điều kiện phát hành trên Fuji cho đến khi qua các gate T092/T129 của roadmap.

## 3. App, command và thread

Payvoke không còn tách Agent và Tool. Mỗi đơn vị được bán là một **App**. App là một bề mặt chat do provider vận hành; buyer không mở nhiều loại giao diện khác nhau cho từng app.

| Thuộc tính         | App                                                            |
| ------------------ | -------------------------------------------------------------- |
| Giao diện          | Một thread chat dùng chung assistant-ui                        |
| Cách gọi           | Slash command hoặc free text map vào command đang chọn/default |
| Hỏi lại buyer      | Câu hỏi có schema và widget OpenUI trong thread                |
| Kết quả            | Timeline, verified output và lịch sử invocation                |
| Công nghệ thực thi | Không áp đặt engine; có thể dùng LLM hoặc không                |

Ví dụ app nghiên cứu:

```text
Buyer: /research Phân tích các đối thủ của sản phẩm này.
App: Bạn muốn tập trung thị trường nào?
Buyer: Việt Nam.
App: Trả báo cáo.
```

Ví dụ app tóm tắt:

```text
/research text: Nội dung cần tóm tắt
/research language: vi
/research maxWords: 150

[Quote] → [Authorize] → Kết quả
```

Mỗi app có một hoặc nhiều command. Quote luôn ghim một `commandRevisionId`; command id ổn định qua các lần sửa. Free text trong composer được ánh xạ vào tham số vị trí của command mặc định (hoặc command người dùng chọn). Quote hiển thị thành card ghim ngay trên composer, nhưng không thay đổi giao thức x402/vault.

App `PUBLIC` chưa archive xuất hiện trong store; app suspend vẫn hiển thị unavailable để giữ star nhưng không nhận quote/thread mới. App `PRIVATE` chỉ owner thấy và chat. Availability suy ra từ trạng thái `ACTIVE`, có default command và heartbeat trong 45 giây gần nhất.

**Chuẩn UI đã chọn (23/10/2026; widget chuyển sang OpenUI Lang 25/10/2026):** chat dùng **assistant-ui** với **AG-UI** để hiển thị token/chunk LLM tăng dần, cùng event stream mang widget **OpenUI Lang** từ catalog Payvoke. Provider gửi `CUSTOM payvoke.openui` vào gateway; buyer nhận `ACTIVITY_SNAPSHOT openui-surface` chứa chương trình OpenUI Lang đầy đủ, có replay/snapshot. Result đang stream là preview; `DELIVERED` chỉ đến sau verification. Không tích hợp MCP Apps. Xem [S04](docs/specs/04-ag-ui-a2ui-streaming.md).

## 4. Các khái niệm cốt lõi

### App

Một bề mặt chat do provider sở hữu, có tên, mô tả, payout address, visibility và danh sách command. App không có thuộc tính `kind`; mọi app đều dùng cùng một thread UI.

Provider quản lý app trong Studio bằng phiên đăng nhập ví. Provider worker dùng bearer API key để nhận event và gửi report.

### Command và command revision

Một command là chức năng ổn định của app, ví dụ `/summarize` hoặc `/research`. Command có id ổn định, tên chỉ duy nhất trong app và một revision đang active.

Mỗi lần sửa schema, giá hoặc điều khoản tạo một `AppCommandRevision` mới. Revision là bất biến. Quote ghim `commandRevisionId`; invocation cũ và quote đã phát hành không bị ảnh hưởng khi provider sửa command.

### Thread (hội thoại)

Một thread gắn cố định với một buyer và đúng một app. Thread chứa prompt, câu trả lời, câu hỏi, revision, widget OpenUI và lịch sử invocation.

Danh sách thread trộn mọi app, giống hộp thư hội thoại. Buyer có thể đổi tên hoặc archive thread; archive không xoá lịch sử thanh toán. Mỗi thread chỉ có tối đa một invocation đang xử lý tại một thời điểm, kể cả khi đang chờ buyer, kiểm tra kết quả hoặc chưa rõ kết quả thực thi.

### Command revision trong quote

Quote chốt app, command id, `commandRevisionId`, input thực tế sau defaults, giá, điều khoản và deadline. API quote nhận `threadId` và `commandId`; document x402 vẫn giữ các field dây cũ (`sessionId`, `productId`, `productVersion`) để không phá hợp đồng thanh toán on-chain.

### Invocation (lần gọi)

Một công việc cụ thể được mua, chốt app/command revision, input, context, giá, điều khoản và deadline.

Thread có nhiều invocation theo thời gian. Invocation đã giao có thể giải phóng execution slot dù tiền còn đang giữ chờ review.

### Quote (báo giá)

Báo giá có thời hạn cho một invocation, chốt giá, dữ liệu, command revision và điều khoản của lần gọi. Tạo quote chưa giữ tiền và chưa giao việc. Quote được trình bày thành card ghim trên composer.

### Spending grant (quyền chi)

Quyền buyer cấp onchain cho một khóa ký do client giữ. Grant khác hoàn toàn với session đăng nhập, thread và API token.

### Hold (khoản giữ)

Khoản tiền được dành riêng cho một invocation. Tiền đã chuyển từ số dư khả dụng sang khoản giữ, chưa được trả cho provider.

## 5. Cách tính tiền

Provider đăng ký giá USDC cố định cho từng command trong từng phiên bản sản phẩm. Payvoke tính tiền theo invocation, không mặc định theo tin nhắn, token hoặc thời gian chạy.

Ví dụ minh họa, không phải giá mặc định:

```text
/summarize: 0,01 USDC/lần
/analyze:   0,10 USDC/lần
```

Một invocation có thể gồm buyer gửi yêu cầu, provider hỏi lại, buyer trả lời, provider giao kết quả và buyer yêu cầu sửa trong phạm vi đã mua. Những bước tiếp tục đúng phạm vi không thu thêm tiền.

Yêu cầu mới, đổi mục tiêu, sửa ngoài phạm vi hoặc chạy command khác có thể cần invocation và quote mới. Không có cờ tùy ý như `free:true` để biến công việc mới thành miễn phí.

Tin nhắn mới không tham chiếu câu hỏi hoặc yêu cầu sửa không tự được coi là phần tiếp tục miễn phí. Trước mỗi lần tính phí mới, UI phải thể hiện giá, dữ liệu gửi và quyền chi áp dụng.

## 6. Hành trình của buyer

### Bước 1: Đăng nhập bằng ví

Buyer ký challenge để chứng minh quyền sở hữu địa chỉ ví. Backend tạo phiên đăng nhập web. Đăng nhập không tự cấp quyền lấy tiền trong vault.

### Bước 2: Nạp USDC

Buyer nạp USDC vào PayvokeVault; trước đó có thể cần cấp allowance ERC-20. USDC nằm trong vault và buyer có số dư khả dụng tương ứng.

Gas giao dịch trên Fuji dùng AVAX testnet, tách khỏi giá dịch vụ bằng USDC.

### Bước 3: Cấp quyền chi có hạn

Client tạo khóa chi riêng và giữ khóa ở phía buyer. Buyer dùng ví chính đăng ký public signer vào vault, kèm giới hạn tối đa mỗi lần, mỗi kỳ, tổng cộng và thời điểm hết hạn.

Client ký từng lần mua bằng khóa chi trong hạn mức đã cấp, vẫn cần sự đồng ý của buyer.

### Bước 4: Chọn app và mở thread

Buyer chọn app trong store hoặc từ danh sách thread. Tạo thread không thu tiền. App offline vẫn đọc được thread cũ nhưng không nhận quote mới.

### Bước 5: Nhập yêu cầu hoặc slash command

Buyer gõ free text để dùng command đang chọn/default, hoặc gõ `/` để chọn command khác. Nếu command không có tham số vị trí, form arguments mở ra. Buyer có thể chọn context được chia sẻ nếu app hỗ trợ.

### Bước 6: Chuẩn bị quote

Backend kiểm tra quyền, schema, command revision, giá, dữ liệu và availability của app. Quote trả input thực tế sau defaults, context được chia sẻ, giá/phí, provider payout, deadline, snapshots và digest để kiểm tra trước ký. Card quote xuất hiện ngay trên composer.

### Bước 7: Thanh toán qua x402

Client nhận payment challenge, kiểm tra rồi ký bằng khóa chi. Hệ thống gửi giao dịch giữ tiền vào vault.

### Bước 8: Giao việc

Chỉ sau khi xác nhận hold thành công, backend mới tạo event để provider nhận việc.

### Bước 9: Theo dõi và nhận kết quả

Buyer xem tiến độ, trả lời câu hỏi, nhận kết quả đã được kiểm tra, yêu cầu sửa đúng phạm vi, đề nghị hủy hoặc mở tranh chấp.

### Bước 10: Kết thúc tài chính

Tiền được hoàn toàn bộ, hoàn một phần rồi giải ngân phần còn lại, giải ngân theo điều kiện hoặc buyer reclaim phần còn giữ khi quá hạn cuối.

## 7. Vai trò của x402

x402 xử lý thanh toán ở lớp HTTP. Payvoke quản lý catalog, giao việc, kết quả và tranh chấp.

```text
Client gửi yêu cầu mua
        ↓
API trả HTTP 402 + PAYMENT-REQUIRED
        ↓
Client kiểm tra và ký authorization
        ↓
Gửi lại với PAYMENT-SIGNATURE
        ↓
Facilitator thực hiện giữ tiền onchain
        ↓
API trả receipt và invocation
```

Cấu hình mục tiêu:

```text
x402 version: 2
scheme: payvoke-vault
scheme version: 1
flow: upfront
network: eip155:43113
```

Scheme riêng này cần ba adapter; client/facilitator x402 bên ngoài không mặc định hỗ trợ:

1. **Client:** kiểm tra yêu cầu thanh toán và ký.
2. **Server:** gắn thanh toán vào API đúng thời điểm.
3. **Facilitator:** kiểm tra và thực thi giao dịch.

### Giữ tiền trước khi giao việc

`payTo` là vault, không phải ví payout của provider. Settlement thành công nghĩa là hold đã thực thi và được xác nhận; payout/refund là lifecycle riêng.

Facilitator không giữ khóa buyer. Nó giữ khóa relayer để trả gas và gửi giao dịch được phép; buyer chỉ gửi chứng từ đã ký.

Flow upfront của SDK không bảo đảm gọi `/verify` trước `/settle`. Vì vậy `/settle` phải kiểm tra đầy đủ, không tin dữ liệu đã được xác minh trước đó.

### Tích hợp với API

Luồng chính: chuẩn bị quote trả `quoteId`, `invocationId` và snapshots; submit quote đó trả HTTP 402 khi chưa có payment và trả kết quả thành công khi hold đã xác nhận và job được queue. Route cụ thể đọc từ code backend.

Paid submit dùng `Idempotency-Key` bằng `invocationId`; bước submit không nhận input/giá mới để thay quote. Các request đọc trạng thái, kết quả và continuation đúng phạm vi không thực hiện debit mới.

Auth, body validation và kiểm tra ownership/quote phải chạy trước settlement. Adapter dự kiến tích hợp ở Fastify `preHandler`; dùng stock middleware settle ở `onRequest` có thể khiến request sai nghiệp vụ vẫn bị thu tiền.

Pending có thể vẫn trả HTTP 402 kèm transaction receipt. Client phải đọc trạng thái và reconcile, không coi mọi 402 là chưa trả tiền. Không tự fallback sang scheme `exact`, chain khác hoặc public facilitator.

### Đối chiếu với nghiên cứu bảo mật x402

Các nghiên cứu năm 2026 tìm thấy lỗ hổng ở mọi facilitator x402 công khai được thử: báo thành công khi chưa settle, một chữ ký dùng cho resource khác, settle trùng khi request đồng thời, overdraft allowance, gas abuse và lộ PII trong metadata. Scheme `payvoke-vault` có yêu cầu và test local cho từng lớp lỗi này: chữ ký gắn đúng invocation/quote/input, consume-once onchain, chỉ `RELAYER_ROLE` settle được, `settle` kiểm tra lại toàn bộ, trần gas, finality gate và header chỉ chứa hash. Giá sàn so với gas nằm trong policy deployment, và `pnpm --dir tests/payments-e2e test:conformance` kiểm tra từng quy tắc bằng ca âm tính có tên. Xem [S02 §11](docs/specs/02-x402-and-vault.md#11-đối-chiếu-nghiên-cứu-bảo-mật-x402) và [M06](docs/modules/06-x402-payments-and-refunds.md).

## 8. PayvokeVault và vòng đời tiền

Vault là smart contract giữ USDC và thực thi các quy tắc tài chính. Có bốn nhóm số dư:

```text
buyerAvailable
heldRemaining
providerClaimable
platformClaimable
```

```text
Buyer nạp
   ↓
Buyer available
   ↓ reserveHold
Held
   ├── refund → Buyer available
   ├── release → Provider claimable + Platform claimable
   └── quá hạn cuối → Buyer reclaim → Buyer available
```

Provider/platform rút từ claimable của mình. Buyer rút từ available của mình.

### Hạn mức chi

Grant được định danh bởi `(buyer, grantId)`, gồm signer, epoch, expiry, caps và counters.

- Thu hồi/cập nhật grant làm tăng epoch; authorization epoch cũ chưa settle mất hiệu lực.
- Refund không khôi phục allowance đã tiêu.
- Cập nhật grant không reset lịch sử chi; grant ID đã dùng không đăng ký lại.
- Hạn mức kỳ là fixed period, không phải rolling window.
- Nhiều grant không tự tạo một hạn mức tổng cho toàn ví.
- API token còn hiệu lực không thay thế grant đã revoke, và ngược lại.

### Điều kiện giải ngân

Provider gửi result chỉ chuyển yêu cầu sang kiểm tra. Contract không biết bài viết hay/dở hoặc báo cáo đúng/sai chuyên môn.

Release cần quyết định nghiệp vụ phù hợp và authorization tài chính hợp lệ. Đến deadline không tự chứng minh đã giao hàng.

### Phí nền tảng

Phí tính trên phần còn lại sau refund:

```text
net = gross - tổng refund
fee = floor(net × feeBps / 10.000)
provider = net - fee
```

Ví dụ minh họa: giá 1 USDC, hoàn 0,2 USDC, phí giả định 5%. Khi release, platform nhận 0,04 USDC, provider nhận 0,76 USDC; buyer đã được hoàn 0,2 USDC.

Tỷ lệ phí thực tế chưa được chốt. Refund đưa tiền về buyer available, không tự chuyển ra ví ngoài và không reset spending counters.

### Deadline

| Mốc                | Ý nghĩa                                          |
| ------------------ | ------------------------------------------------ |
| `validUntil`       | Hạn bắt đầu thanh toán                           |
| `deliveryDeadline` | Hạn giao                                         |
| `releaseNotBefore` | Thời điểm sớm nhất được giải ngân                |
| `resolveBy`        | Mốc cuối giải quyết; sau đó buyer có thể reclaim |

Các mốc được chốt trước ký, không tính lại mỗi retry. Buyer bấm chấp nhận không cho phép bỏ qua thời điểm release tối thiểu.

Nếu giao muộn hoặc buyer không truy cập được file, thời gian review thực tế phải được bảo vệ. Không tự kéo dài hold bằng cách sửa chữ ký cũ; nếu không đủ thời gian trước `resolveBy` thì chuyển resolver/refund.

### Phân quyền tài chính

- **Relayer:** giữ tiền theo buyer authorization, không tự rút/giải ngân.
- **Refund/release approver:** duyệt quyết định hoàn/giải ngân.
- **Dispute resolver:** cần thêm khi xử lý disputed hold.
- **Finance executor:** gửi quyết định đã được duyệt.
- **Pauser:** dừng admission mới.

Executor chỉ gửi quyết định đã được duyệt. Approval ràng buộc decision ID, expected hold version và expiry; không replay quyết định cũ. Khi vận hành, approver và executor phải dùng khóa riêng.

Pause không được khóa vô thời hạn quyền revoke grant, rút available hoặc reclaim đủ điều kiện. Contract không có quyền admin tùy ý lấy số dư buyer. Tuy vậy, token issuer vẫn có thể freeze/blacklist khiến transfer thất bại.

### Bất biến kế toán

```text
tokenBalance >= tổng buyerAvailable + heldRemaining
                + providerClaimable + platformClaimable

gross = refunded + remaining + providerReleased + feeReleased
```

Gửi token trực tiếp vào contract không qua deposit chỉ tạo surplus, không tự thành số dư buyer. Một invocation chỉ reserve một lần; release terminal không được thực hiện lại.

## 9. Chữ ký và snapshots

Authorization EIP-712 ràng buộc chữ ký buyer với các trường của quote:

- Buyer, invocation và thread (field dây cũ `sessionId`).
- App, command revision và command (field dây cũ `productId`/`productVersion`/`commandId`).
- Input hash, terms hash và policy hash.
- Provider, asset và giá.
- Phí, người nhận phí và các deadline.
- Chain và vault thông qua signing domain.
- Grant ID và epoch thông qua debit authorization.

Dữ liệu được đóng băng thành:

1. **InputSnapshot:** effective arguments cùng ID/version/content hash của context đã chọn.
2. **TermsSnapshot:** phiên bản điều khoản và hạn giao.
3. **PolicySnapshot:** policy triển khai, phí và giới hạn thời gian liên quan.

JSON được canonicalize bằng JCS trước khi hash. Client được đọc snapshots để tự kiểm tra, không chỉ nhận hash opaque. Domain là `PayvokeVault`, version `1`, chain `43113` và đúng địa chỉ vault deployment.

Khóa chi ký `DebitAuthorization` chứa quote digest, grant ID và grant epoch. Không dùng `personal_sign` để thay thế typed data này. Contract consume invocation key để chống replay; EIP-712 một mình không tự chống replay.

Các ràng buộc này ngăn hệ thống thực thi giá/input khác với giá/input buyer đã ký. Hash/chữ ký không chứng minh chất lượng đầu ra; contract cũng không kiểm chứng giá catalog.

## 10. Provider tích hợp như thế nào?

### Tạo app và API key

Provider đăng nhập bằng ví để quản lý app. Provider worker dùng bearer API key với scope đọc events, ACK, reports, files và ghi command. Mỗi app có tối đa một key active; tạo key mới thu hồi key cũ ngay lập tức.

Secret chỉ hiện một lần khi cấp; backend lưu hash. API key không tự đổi payout wallet hoặc cấp operator role. Chủ app vẫn có thể quản lý bằng phiên đăng nhập ví mà không cần API key.

### Đăng ký commands

Provider gửi structured definition qua API, ví dụ:

```text
name: summarize

input:
  text: string, bắt buộc
  language: vi | en
  maxWords: integer

output:
  summary: string

price:
  grossAmount

terms:
  deliverySeconds
  reviewSeconds
  revisionPolicy
  refundPolicy
  sideEffects
  dataUse
```

Web và API dùng cùng validation; không bắt buộc manifest file. Provider app, key, store catalog, heartbeat availability, ready/ACK/report, AG-UI streaming, OpenUI projection, question/answer continuation và revision trong phạm vi policy đã có đường đi thử nghiệm. OpenAPI, file artifacts, lease/fencing nhiều writer và nghiệm thu Fuji end-to-end vẫn chưa hoàn tất.

Input/output dùng subset JSON Schema 2020-12 có giới hạn. Không nhận remote `$ref`, code hoặc schema không được kiểm soát. Defaults được áp một lần lúc chuẩn bị quote rồi đóng băng.

UI chuyển slash shortcut thành `commandId + arguments`. Backend không shell-eval chuỗi slash thô hoặc nhờ LLM đoán command/giá. Các action điều hướng như help/status/cancel không được biến thành paid command tùy ý.

### Command revision, availability và tự công khai

Thay đổi schema, giá, default command, payout hoặc điều khoản tạo revision mới hoặc cập nhật app. Không sửa ngầm revision đang phục vụ. Quote/invocation cũ pin revision cũ.

App được xem là available khi `status = ACTIVE`, có default command và heartbeat trong 45 giây gần nhất. Store trả app `PUBLIC` chưa archive, kể cả app suspend ở trạng thái unavailable; owner vẫn xem được app `PRIVATE` trong Studio và thread của mình.

Dừng bán không xóa nghĩa vụ với job đã trả tiền. Đã hold thì giao theo revision cũ hoặc xử lý hoàn, không đổi provider ngầm.

### Nhận việc qua SSE

Provider chủ động mở kết nối SSE tới Payvoke. Không yêu cầu Payvoke gọi webhook vào server provider.

Events gồm:

- `invocation.ready`
- `invocation.answer`
- `invocation.revision_requested`
- `invocation.cancel_requested`

MVP một active stream lease/app, dùng fencing để stream mới thay stream cũ. Provider có thể tự phân phối job cho worker của mình.

### ACK khác hoàn thành

Provider nhận event, lưu job/dedupe bền vững, ACK, xử lý rồi gửi reports. ACK xác nhận đã tiếp nhận; provider gửi result sau khi xử lý.

Reports gồm started, progress, question, result, failed, unknown và cancelled. Report có ID chống trùng và sequence tăng theo invocation; report sai thứ tự/state bị từ chối.

Provider không được gửi report tự đổi payment status, refund hoặc payout. Questions không được dùng để xin khóa, tăng giá hoặc lấy thêm dữ liệu ngoài scope.

## 11. Chống trùng và phục hồi sự cố

Ba lớp bảo vệ:

| Lớp          | Bảo vệ                                        |
| ------------ | --------------------------------------------- |
| API/database | Cùng thao tác trả lại cùng logical invocation |
| Vault        | Một invocation key chỉ debit một lần          |
| Provider     | Dedupe event/job trước ACK và side effect     |

### Idempotency

Mỗi thao tác thay đổi nghiệp vụ có business key. Cùng key/cùng dữ liệu trả kết quả cũ; cùng key/khác dữ liệu trả conflict. Paid submit dùng invocation ID làm `Idempotency-Key`.

Timeout không phải lý do tự tạo invocation mới. Dedupe thanh toán bền vững không hết hiệu lực chỉ vì HTTP replay cache hết TTL.

### SSE không phải exactly-once

Event có thể được gửi lại khi reconnect hoặc mất ACK. `Last-Event-ID` là cursor, không thay ACK. Provider phải chống chạy lặp; cursor hết retention có đường resync pending events.

Với side effect như gửi email hoặc tạo tài nguyên, provider truyền idempotency key nếu nơi nhận hỗ trợ. Nếu không biết tác động đã xảy ra chưa, báo `UNKNOWN`, không tự chạy lại chỉ vì thiếu response.

Payvoke không bảo đảm exactly-once toàn hệ thống vì chain và PostgreSQL không có một transaction atomic chung.

### Recovery thanh toán

Thiết kế xử lý các trường hợp:

- Worker chết sau ký nhưng trước broadcast.
- RPC timeout sau broadcast.
- Hold thành công nhưng DB chưa commit.
- API trả lỗi dù tiền đã giữ.
- Provider offline sau khi buyer trả tiền.
- Client mất response hoặc restart.

Signed transaction/hash, nonce và operation được lưu bền vững để reconcile. Replacement transaction giữ lịch sử, không ghi đè bằng chứng cũ.

Chỉ giao việc khi có receipt thành công, đúng hold và bằng chứng finality phù hợp. Broadcast hoặc thông báo accepted transaction không đủ chứng minh execution thành công.

Sau xác nhận, một SQL transaction cập nhật `HELD` và tạo logical ready event. Nếu commit mất, reconciler phục hồi idempotently. Nếu thiếu snapshot/input thì cách ly để recovery/refund, không dựng nội dung từ hash.

## 12. Trạng thái tiền và công việc

Payvoke lưu payment status và execution status riêng.

Luồng payment tổng quát:

```text
UNPAID → PENDING/UNKNOWN → HELD
                            ├── PARTIALLY_REFUNDED
                            ├── REFUNDED
                            ├── RELEASED
                            └── RECLAIMED
```

Luồng execution tổng quát:

```text
DRAFT → PAYMENT_PENDING → QUEUED → SENT → ACKED → RUNNING
                                                   ├── WAITING_BUYER
                                                   ├── VERIFYING → DELIVERED
                                                   ├── FAILED
                                                   ├── UNKNOWN
                                                   └── CANCELLED
```

Đây là sơ đồ khái quát, không liệt kê mọi transition. Các transition cụ thể bị giới hạn theo đặc tả. Answer/revision hợp lệ có thể đưa công việc về queue mà không thu thêm tiền; revision phải chiếm lại execution slot, không chạy chồng invocation khác trong session.

Hai tổ hợp hợp lệ:

```text
Execution: FAILED       Payment: HELD
→ Công việc lỗi nhưng tài chính chưa hoàn tất.

Execution: DELIVERED    Payment: HELD
→ Đã giao, đang chờ review hoặc điều kiện giải ngân.
```

Quote hết hạn có thể giải phóng draft slot nếu chưa submit; pending/unknown chỉ giải phóng sau reconciliation, không dựa vào timeout đơn thuần.

## 13. Kết quả, file, sửa và tranh chấp

### Kết quả

Provider gửi result → `VERIFYING`, chưa phải `DELIVERED`. Payvoke kiểm tra output schema, file đúng invocation/provider, dữ liệu đủ, loại/kích thước/checksum, an toàn theo policy và khả năng buyer truy cập.

Các kiểm tra này không xác minh nội dung chuyên môn. Tiến độ tạm thời tách khỏi artifact cuối; platform ghi thời điểm giao, không dùng timestamp provider để lùi ngày giao.

### File

- Bytes nằm ở object storage S3-compatible; PostgreSQL lưu metadata.
- Chỉ file `READY` được chọn làm input.
- Download kiểm tra quyền rồi cấp URL ngắn hạn.
- Signed URL không nằm trong snapshot thanh toán hoặc log công khai.
- Không tự tải URL Internet bất kỳ do provider đưa, tránh SSRF.
- Retention theo điều khoản; legal hold của dispute có thể ngăn xóa.

Upload xong không tự có nghĩa artifact đã giao.

### Revision

Sửa đúng phạm vi giữ invocation cũ, không thu thêm tiền, tạo artifact version mới và giữ bản cũ. Sửa ngoài phạm vi cần lần mua mới, không tự động charge.

### Cancellation

Bấm hủy tạo đề nghị dừng. Cần xác nhận riêng việc provider đã dừng, side effect đã xảy ra hay chưa và tiền đã hoàn hay chưa.

### Dispute

Tranh chấp có hồ sơ trong backend và giao dịch trên contract. Chỉ giao dịch tranh chấp onchain đã xác nhận mới kích hoạt quy tắc disputed hold và chặn payout onchain; ticket trong database chưa đủ.

Operator xem điều khoản, kết quả, bằng chứng và phản hồi để quyết định tài chính. Hold disputed cần đúng quyền resolver khi giải quyết. Sau `resolveBy`, buyer có thể reclaim phần còn giữ, kể cả khi paused/disputed.

Sau terminal release, không thể refund từ chính hold đã đóng. Bồi hoàn muộn cần nguồn tiền riêng; không được lấy tiền buyer khác để bù.

### Đánh giá và vận hành

Buyer đánh giá invocation đã trả tiền và được giao. Đánh giá gắn với phiên bản sản phẩm, sửa có lịch sử. Mẫu quảng cáo provider không được trình bày như đánh giá buyer.

Vì Payvoke trả gas cho giao dịch giữ tiền, số invocation có thể bị làm giả rẻ như đã thấy trên x402 công khai. Store nên hiển thị số buyer độc lập đã xác minh và rating theo command revision thay cho số giao dịch thô; giải ngân nên dựa trên mức bằng chứng tối thiểu mà command đã khai báo. Đây là đề xuất, xem [M05](docs/modules/05-artifacts-and-verification.md) và [M09](docs/modules/09-reputation-and-operations.md).

Operator có thể dừng bán, revoke key lộ và xử lý sự cố theo quyền. Mọi hành động cần audit: ai làm, lý do, thời điểm và điều kiện mở lại. Provider offline không làm biến mất job đã trả; outcome chưa rõ phải điều tra trước khi phát lại.

## 14. MCP cho ứng dụng AI

MCP giúp ứng dụng AI bên ngoài sử dụng Payvoke:

```text
AI trong IDE/desktop
    ↓ MCP qua stdio
Payvoke bridge trên máy buyer
    ↓ HTTPS
Payvoke buyer API
    ↓
x402 / Vault / Provider
```

Bridge chạy trên máy buyer, giữ khóa local, làm MCP server đối với AI host và HTTP client đối với Payvoke. Bridge dùng cùng buyer API/x402, không gọi provider trực tiếp hoặc tự tính giá.

### Tools dự kiến

- `search_apps`
- `get_app`
- `list_commands`
- `create_thread`
- `prepare_invocation`
- `submit_invocation`
- `get_invocation`
- `get_result`
- `answer`
- `revise`
- `cancel`

Command provider được đọc qua catalog, không tự đăng từng slash command thành MCP tool mới. Slash command Payvoke không phải MCP prompt và không bảo đảm host sẽ hiện slash UI.

### Pairing và hai quyền riêng biệt

User tự chạy CLI pairing ngoài MCP, mở web đăng nhập ví và duyệt scopes/workspaces cho bridge. Proof-of-possession cho phép CLI nhận token một lần; đây là pairing riêng Payvoke, không gọi là MCP OAuth.

Bridge cần cả:

1. Token cho phép gọi buyer API với scope/workspace giới hạn.
2. Grant onchain cho phép khóa local chi tiền.

Có một quyền không thay thế quyền kia. API revoke và grant revoke là hai thao tác riêng; logout không tự hoàn tiền hoặc thu hồi onchain. Quyền hiệu lực còn bị giới hạn bởi local policy và số dư.

### AI không tự phê duyệt chi tiền

`confirmed:true` hoặc model nói “người dùng đã đồng ý” không phải approval hợp lệ.

MVP yêu cầu buyer phê duyệt quote qua trusted local CLI ngoài MCP. Approval gắn với đúng quote/digest/invocation/profile và spending policy; retry cùng invocation có thể dùng quyết định cũ, invocation mới phải được duyệt mới.

Bridge chỉ ký khi đồng thời hợp lệ: API authorization, owner/workspace, quote, explicit approval, local policy, grant, reservation/balance và payment challenge. Không để LLM đánh giá thay các kiểm tra deterministic này.

Mô tả command, tài liệu hoặc output provider là dữ liệu không đáng tin, không được thay policy, đổi vault hoặc yêu cầu submit thêm để “mở khóa kết quả”. Tools không nhận private key, token, RPC, chain, vault, calldata hoặc origin tùy ý.

### Lưu khóa và giới hạn MVP

Khóa/token ở OS keychain. Không có secure storage phù hợp thì paid mode phải tắt, không fallback plaintext.

Local reservation/journal khóa chống race giữa các process; timeout không giải phóng ngân sách nếu chưa rõ đã giữ tiền hay chưa. Submit trả job ID sau API acceptance, không đợi provider chạy xong; host đọc trạng thái bằng polling.

MVP không có remote paid signing, tự đọc filesystem/upload file, tự fetch URL hoặc tự render script từ kết quả. File đầu vào được upload trên web trước. Stdio stdout chỉ dành cho protocol, log đã redact đi stderr. Dùng SDK/protocol đã pin và kiểm tra tương thích host, không mặc định mọi host MCP đều tương thích.

## 15. Kiến trúc kỹ thuật và database

### Kiến trúc tổng thể

```text
Web frontend                         Local MCP bridge
       └──────────────┬─────────────────────┘
                      ↓
                Fastify API
                      ↕
                 PostgreSQL
                      ↕
              Worker processes
               ├── Settlement
               ├── Chain indexing/recovery
               ├── Provider outbox delivery
               └── Verification/finance workflows

Settlement ↔ Avalanche Fuji / PayvokeVault
Provider   ↔ SSE + ACK/reports API
Files      ↔ Object storage
```

Stack đã chọn:

- **Fastify:** API.
- **PostgreSQL + Prisma:** persistence.
- **Solidity + Hardhat:** vault và contract tests.
- **viem:** EVM và typed data.
- **React/TanStack:** frontend.
- **Local stdio MCP bridge:** tích hợp ứng dụng AI.
- **S3-compatible storage:** khi bật file.

Ban đầu dùng PostgreSQL outbox, transaction, lease và fencing, chưa thêm Redis/Kafka. API process và process giữ khóa settlement phải tách quyền; facilitator không nhận yêu cầu relay tùy ý từ bên ngoài.

### Layout repository

| Đường dẫn                    | Vai trò                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `apps/api`                   | API Fastify cho frontend và provider (auth, catalog, quote, x402 gateway, AG-UI)     |
| `apps/facilitator`           | Facilitator x402 nội bộ, không giữ khóa                                              |
| `apps/settlement-worker`     | Worker gửi `reserveHold`, giữ khóa relayer                                           |
| `apps/ops`                   | CLI vận hành Fuji và finance (operator, approver, executor tách env)                 |
| `packages/payvoke-db`        | Prisma schema, migrations và client dùng chung                                       |
| `packages/payvoke-payments`  | Domain thanh toán: journal, admission, settlement, finance                           |
| `packages/payvoke-server`    | Env loader, redaction, cấu hình deployment vault dùng chung cho service              |
| `packages/payvoke-testkit`   | Fixture test: PGlite, local EVM, vault reader                                        |
| `tests/payments-e2e`         | Test tích hợp xuyên service và conformance x402                                      |
| `packages/payvoke-vault`     | Solidity, tests, deployment và ABI                                                   |
| `apps/frontend`              | Web UI: store, chat, Studio                                                          |
| `apps/slide`                 | Slide pitch                                                                          |
| `docs`                       | Modules, specs, nghiên cứu và roadmap                                                |
| `packages/payvoke-protocol`  | Schemas, snapshots, typed data và codecs dùng chung                                  |
| `packages/payvoke-x402`      | Adapter client/server/facilitator của scheme `payvoke-vault`                         |
| `packages/openui-components` | Catalog OpenUI dùng chung backend/frontend                                           |
| `packages/payvoke-client`    | Đề xuất: client x402 dùng lại cho headless/browser/MCP                               |
| `apps/mcp`                   | Đề xuất: bridge local stdio                                                          |

Những đường dẫn đánh dấu đề xuất là layout mục tiêu, chưa tồn tại. Provider fixture sẽ chạy ngoài process Payvoke như provider thật.

### Vai trò của Prisma schema

[Schema hiện tại](packages/payvoke-db/prisma/schema.prisma) bao phủ:

| Nhóm                 | Models tiêu biểu                                                              |
| -------------------- | ----------------------------------------------------------------------------- |
| Danh tính            | `Account`, `LoginChallenge`, `WebSession`                                     |
| Quyền                | `OperatorRoleAssignment`, `ClientAuthorization`, `ClientWorkspaceAccess`      |
| Provider             | `App`, `AppApiKey`, `AppCommand`, `AppCommandRevision`                        |
| Store                | `AppStar`                                                                     |
| Workspace/context    | `ChatThread`, `MessageVersion`, `WorkspaceBriefVersion`                       |
| Công việc            | `Invocation`, questions, answers, revisions, cancellations                    |
| Thanh toán           | `Quote`, `PaymentAuthorization`, `PaymentAttempt`                             |
| Chain                | `ChainOperation`, `ChainTransaction`, `ChainEvent`, nonce slots, sync cursors |
| Vault projections    | `SpendGrant`, `VaultBalance`, `VaultHold`                                     |
| Provider delivery    | `OutboxEvent`, connection, delivery, receipt, report                          |
| Kết quả/file         | `ArtifactVersion`, `ArtifactCheck`, `FileAsset`                               |
| Tài chính/tranh chấp | `Dispute`, evidence, `FinancialDecision`                                      |
| Kiểm toán            | `AuditLog`, `IdempotencyRecord`, ratings                                      |

Quy tắc lưu trữ:

- Tiền dùng `Decimal(78, 0)`, không dùng float; vẫn phải kiểm tra bounds unsigned/uint256.
- USDC qua API dùng chuỗi atomic integer; 6 decimals nghĩa `"10000"` = 0,01 USDC.
- Composite foreign keys ràng buộc các quan hệ ownership/app/thread/invocation quan trọng.
- Slot tables giúp thực thi giới hạn concurrency ở database, không chỉ mutex trong process.
- Transaction replacement không ghi đè lịch sử giao dịch cũ.
- Token/API key lưu hash, không plaintext secret; không lưu private key buyer.
- Payload authorization nhạy cảm lưu ciphertext khi cần, với key management bên ngoài.

`prisma validate` kiểm tra cấu trúc schema. Để thực thi và kiểm chứng business rules, cần logic trong transaction, SQL CHECK/trigger khi triển khai migration, contract tests, integration và recovery tests.

Số dư DB là projection từ chain, không phải nguồn tự tạo tiền/quyền chi. Nếu projection lệch phải dừng admission và reconcile. PostgreSQL tmpfs trong môi trường test không thay thế storage bền vững cho deployment.

## 16. Mười module chức năng

| Module                                                                     | Trách nhiệm                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [M01 — Identity](docs/modules/01-identity-and-access.md)                   | Đăng nhập ví, sessions, access control                       |
| [M02 — Thread chat](docs/modules/02-workspace-and-conversation.md)         | Một chat shell, thread list, command và context được chia sẻ |
| [M03 — Pricing](docs/modules/03-per-use-pricing.md)                        | Giá, quote và phạm vi từng invocation                        |
| [M04 — Provider gateway](docs/modules/04-provider-requests-and-gateway.md) | SSE, ACK, reports, execution                                 |
| [M05 — Artifacts](docs/modules/05-artifacts-and-verification.md)           | Kiểm tra, giao kết quả, version, revision                    |
| [M06 — Payments](docs/modules/06-x402-payments-and-refunds.md)             | x402, settlement, refund, reconciliation                     |
| [M07 — Publishing](docs/modules/07-provider-publishing.md)                 | App, visibility, command revision, key và availability       |
| [M08 — External clients](docs/modules/08-external-client-access.md)        | MCP local và scoped authorization                            |
| [M09 — Operations](docs/modules/09-reputation-and-operations.md)           | Đánh giá, tranh chấp, sự cố, audit                           |
| [M10 — Vault](docs/modules/10-payvoke-vault.md)                            | Deposit, withdraw, grants, holds, payout                     |

M01–M10 chia theo chức năng sản phẩm; M0–M9 trong roadmap chia theo giai đoạn triển khai.

## 17. Roadmap triển khai

[Roadmap](docs/roadmap.md) chia 130 task theo dependency và acceptance criteria, cộng 8 task R01–R08 bổ sung từ nghiên cứu ([§17](docs/roadmap.md#17-bổ-sung-từ-nghiên-cứu-25102026)):

| Giai đoạn | Mục tiêu                            |
| --------- | ----------------------------------- |
| M0        | Môi trường, config, checks, CI      |
| M1        | Shared schemas, snapshots, signing  |
| M2        | Vault hoàn chỉnh ở local            |
| M3        | Backend identity và command catalog |
| M4        | Quote, x402, settlement, recovery   |
| M5        | Provider gateway, execution, files  |
| M6        | Finance, fault injection, Fuji      |
| M7        | Frontend                            |
| M8        | MCP local                           |
| M9        | Hardening và phát hành Fuji         |

Gate T092 yêu cầu kiểm chứng luồng backend/payment/provider/finance/recovery qua client headless trên Fuji trước khi bắt đầu frontend. Tests phải chứng minh không trừ tiền hai lần, chỉ giao việc sau thanh toán và phục hồi được sau crash. Task chỉ hoàn tất khi có code, tests và bằng chứng nghiệm thu.

## 18. Quyết định còn mở và ranh giới MVP

Trước khi bật giao dịch deployment cần duyệt:

- Phí và trần phí.
- Thời hạn quote.
- Thời gian giao/review/resolve tối đa.
- Gas/AVAX budgets.
- Upload, retention và rate limits.
- Token expiry.
- Địa chỉ deployment, ABI/codehash và cấu hình chain/token.
- Chủ sở hữu keys/roles và quy trình phê duyệt tài chính/vận hành.

Không biến giá trị fixture thành cấu hình thật. Thiếu policy thật không chặn local development với fixture riêng, nhưng phải chặn bật giao dịch deployment. Config sai chain, vault hoặc capability phải fail closed.

Ngoài phạm vi hiện tại:

- Mainnet và tài sản thật.
- Multi-chain.
- Payvoke hosting code provider.
- Remote custody khóa buyer.
- Remote MCP paid signing.
- Bảo đảm tuyệt đối chất lượng nội dung.
- Exactly-once với mọi side effect bên ngoài.
- Tự động thực thi công việc mới mà không có consent phù hợp.

## Tài liệu chi tiết

- [Tổng quan chức năng](docs/README.md).
- [Thuật ngữ chuẩn](GLOSSARY.md).
- [Chỉ mục đặc tả](docs/specs/README.md).
- [S01 — API và provider protocol](docs/specs/01-api-and-provider-protocol.md).
- [S02 — x402 và PayvokeVault](docs/specs/02-x402-and-vault.md).
- [S03 — MCP client](docs/specs/03-mcp-client.md).
- [S04 — AG-UI chat streaming và OpenUI widgets](docs/specs/04-ag-ui-a2ui-streaming.md).
- [Prisma schema](packages/payvoke-db/prisma/schema.prisma).
- [Roadmap 130 task + R01–R08](docs/roadmap.md).
- [Nghiên cứu kiến trúc x402](docs/research/x402-integration-architecture.md).
- [Nghiên cứu agentic payments áp dụng cho Payvoke](docs/research/agentic-payments-literature.md).
- [Ma trận bằng chứng thanh toán](docs/payment-acceptance.md).

README là bản giải thích tổng thể. S01–S04 là đặc tả quy tắc nghiệp vụ và giao thức; nếu khác với phác thảo nghiên cứu cũ thì ưu tiên đặc tả. Tài liệu không liệt kê routes API: method, path và request/response lấy từ code trong `apps/api/src/modules/*`, là nguồn sự thật duy nhất. Không coi ABI trong tài liệu là tính năng đã tồn tại trước khi có implementation và tests tương ứng.

## Tài liệu tham khảo và lời cảm ơn

Thiết kế bảo mật thanh toán, cơ chế bằng chứng giao hàng và chỉ số uy tín của Payvoke được rà soát và bổ sung dựa trên các nghiên cứu dưới đây. Chúng tôi chân thành cảm ơn các tác giả đã công bố công trình của mình, đặc biệt những nhóm đã công khai phương pháp, dữ liệu, công cụ và báo cáo có trách nhiệm các lỗ hổng cho bên bị ảnh hưởng. Những công trình này giúp hệ sinh thái agentic payments an toàn hơn và giúp Payvoke kiểm tra thiết kế của mình bằng những bằng chứng cụ thể thay vì giả định.

Payvoke chỉ dùng các nghiên cứu này làm checklist và định hướng thiết kế; mọi sai sót khi diễn giải hoặc áp dụng thuộc về chúng tôi, không thuộc về tác giả. Cách từng paper được áp dụng nằm ở [nghiên cứu agentic payments](docs/research/agentic-payments-literature.md).

| Paper                                                                                                                                                    | Tác giả                                                                                  | Áp dụng tại            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| [When HTTP 402 Meets the Blockchain: Risks on Emerging x402 Payments](https://arxiv.org/abs/2607.19545) (arXiv:2607.19545)                               | Qinying Wang, Yong Yang, Yuan Chen, Shouling Ji, Mathias Payer                           | M06, S02 §11           |
| [Free-Riding the Agentic Web: A Systematic Security Analysis of x402 Payments](https://arxiv.org/abs/2605.30998) (arXiv:2605.30998)                      | Shengchen Ling, Yihang Huang, Yuefeng Du, Yuan Chen, Yajin Zhou, Lei Wu, Cong Wang       | M03, M06, S02 §11      |
| [Five Attacks on x402 Agentic Payment Protocol](https://arxiv.org/abs/2605.11781) (arXiv:2605.11781)                                                     | Zelin Li, Qin Wang, Zhipeng Wang                                                         | M06, M09, M10, S02 §11 |
| [A Formal Analysis of Agent Payment Protocols](https://arxiv.org/abs/2609.00060) (arXiv:2609.00060)                                                      | Ke Jiang, Mohan Yu, Yuan Chang, Mohit Kumar Jangid, Jianyu Niu, Cong Wang, Yinqian Zhang | S02 §11                |
| [Hardening x402: PII-Safe Agentic Payments via Pre-Execution Metadata Filtering](https://arxiv.org/abs/2604.11430) (arXiv:2604.11430)                    | Vladimir Stantchev                                                                       | M06, S02 §11           |
| [How Agentic Is Agentic Commerce? A Population-Scale Measurement of x402 Adoption and Authenticity](https://arxiv.org/abs/2607.12575) (arXiv:2607.12575) | Shengchen Ling, Yajin Zhou, Lei Wu, Cong Wang                                            | M09                    |
| [TessPay: Verify-then-Pay Infrastructure for Trusted Agentic Commerce](https://arxiv.org/abs/2602.00213) (arXiv:2602.00213)                              | Mehul Goenka, Tejas Pathak, Siddharth Asthana                                            | M05                    |
| [RAILS: Verification-Native Clearing for Agentic Commerce](https://arxiv.org/abs/2606.08790) (arXiv:2606.08790)                                          | Adrian de Valois-Franklin, Alex Bogdan                                                   | M05, S01 §4.2          |
| [A402: Binding Cryptocurrency Payments to Service Execution for Agentic Commerce](https://arxiv.org/abs/2603.01179) (arXiv:2603.01179)                   | Yue Li, Lei Wang, Kaixuan Wang, Zhiqiang Yang, Ke Wang, Zhi Guan, Jianbo Gao             | M10                    |
| [402Pilot: An x402 Decision Layer for Autonomous Agent Micropayments](https://arxiv.org/abs/2608.01341) (arXiv:2608.01341)                               | Yin Li, Yanbo He, Boo-Ho Yang, Rav Lawana, Ziyue Li, Wei Zeng, Jing Tang, Fugee Tsung    | M08, S03 §8            |
| [Agentic Commerce Bench: Measuring Fraud Detection for Agents That Spend Money](https://arxiv.org/abs/2609.35886) (arXiv:2609.35886)                     | Ankit Srivastava, Debjyoti Paul                                                          | M09                    |
| [Whispers of Wealth: A Systematic Red-Teaming Study of the Agent Payments Protocol (AP2)](https://arxiv.org/abs/2601.22569) (arXiv:2601.22569)           | Tanusree Debi, Wentian Zhu, Pranjol Sen Gupta                                            | M08, S03 §8            |
| [LEGIT: Credentialing Protocol for Trustworthy AI Agent Marketplaces](https://arxiv.org/abs/2609.21325) (arXiv:2609.21325)                               | Steve Drew, Jiayu Zhou                                                                   | M09                    |
