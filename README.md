# Payvoke

Payvoke là marketplace mua bán app AI, thanh toán bằng USDC theo từng lần gọi. Mỗi app dùng chung một giao diện chat, một danh sách thread và các slash command riêng.

Provider tự vận hành app. Payvoke cung cấp store, thread chat, quản lý command, giữ tiền qua x402/PayvokeVault, chuyển việc, lưu kết quả và tự động hoàn tiền/giải ngân. Buyer có thể dùng qua web hoặc MCP bridge local dành cho ứng dụng AI.

> Payvoke chạy trên Avalanche Fuji với USDC testnet, chưa dùng mainnet hay tiền thật.

## Mục lục

- [1. Payvoke giải quyết bài toán gì?](#1-payvoke-giải-quyết-bài-toán-gì)
- [2. App, command và thread](#2-app-command-và-thread)
- [3. Các khái niệm cốt lõi](#3-các-khái-niệm-cốt-lõi)
- [4. Cách tính tiền](#4-cách-tính-tiền)
- [5. Hành trình của buyer](#5-hành-trình-của-buyer)
- [6. Vai trò của x402](#6-vai-trò-của-x402)
- [7. PayvokeVault và vòng đời tiền](#7-payvokevault-và-vòng-đời-tiền)
- [8. Chữ ký và snapshots](#8-chữ-ký-và-snapshots)
- [9. Provider tích hợp như thế nào?](#9-provider-tích-hợp-như-thế-nào)
- [10. Chống trùng và phục hồi sự cố](#10-chống-trùng-và-phục-hồi-sự-cố)
- [11. Trạng thái tiền và công việc](#11-trạng-thái-tiền-và-công-việc)
- [12. Kết quả, file, sửa và hoàn tiền](#12-kết-quả-file-sửa-và-hoàn-tiền)
- [13. MCP cho ứng dụng AI](#13-mcp-cho-ứng-dụng-ai)
- [14. Kiến trúc kỹ thuật và database](#14-kiến-trúc-kỹ-thuật-và-database)
- [15. Mười module chức năng](#15-mười-module-chức-năng)
- [16. Phạm vi](#16-phạm-vi)
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

## 2. App, command và thread

Mỗi đơn vị được bán là một **App**. Không còn phân biệt tool hay agent: buyer dùng mọi app qua **một giao diện chat** (thread), giống một Discord bot.

- **Provider đăng ký slash command qua API** (tên, mô tả, options, điều khoản, trần giá tùy chọn). Payvoke lưu lại để gợi ý khi buyer gõ `/` và hiển thị trong store. Studio chỉ sửa thông tin app và API key; danh sách command chỉ đọc.
- **Mỗi tin nhắn hoặc slash command là một interaction miễn phí** gửi cho bot của provider (có giới hạn số tin trước khi trả).
- Bot phản hồi bằng một trong ba loại:

| Phản hồi  | Nội dung                                                      | Phía buyer                                                                  |
| --------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `message` | Text                                                          | Tin nhắn của app trong thread                                               |
| `form`    | `{title, description?, schema}`, JSON Schema phẳng, có ô file | Form trong thread; trả lời một lần, Payvoke kiểm tra rồi chuyển lại cho bot |
| `offer`   | Giá, tóm tắt, thời gian giao, arguments đã chốt               | Card "Chấp nhận và trả" → quote → ký x402                                   |

**Giá luôn đến từ offer của bot**, nên bot tự tính theo cách nào cũng được (cố định, theo độ dài, theo file, theo độ khó). Kết quả có thể là text/markdown, JSON hoặc file; không bắt buộc output schema. Câu hỏi có schema và widget OpenUI trong lúc chạy vẫn hiện trong thread.

Công nghệ thực thi không bị áp đặt; app có thể dùng LLM hoặc không. Giao diện chia hai khu: site công khai (`/`, `/store`) và **console** (`/console`) chứa chat, activity (mọi khoản đang giữ và deadline) và Studio.

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

Mỗi app có một hoặc nhiều command. Quote luôn ghim một `commandRevisionId`; command id ổn định qua các lần sửa. Free text là tin nhắn cho bot; `/lệnh văn bản` điền vào tham số vị trí của lệnh, còn lệnh có tham số bắt buộc khác mở form. Offer chấp nhận được Payvoke đổi thành quote và khoá cả nội dung đã thương lượng vào `inputHash` (S01 §6.5). Quote hiển thị thành card ghim ngay trên composer, nhưng không thay đổi giao thức x402/vault.

App `PUBLIC` chưa archive xuất hiện trong store; app suspend vẫn hiển thị unavailable để giữ star nhưng không nhận quote/thread mới. App `PRIVATE` chỉ owner thấy và chat. Availability suy ra từ trạng thái `ACTIVE`, có default command và heartbeat trong 45 giây gần nhất.

**Chuẩn UI:** chat dùng **assistant-ui** với **AG-UI** để hiển thị token/chunk LLM tăng dần, cùng event stream mang widget **OpenUI Lang** từ catalog Payvoke. Provider gửi `CUSTOM payvoke.openui` vào gateway; buyer nhận `ACTIVITY_SNAPSHOT openui-surface` chứa chương trình OpenUI Lang đầy đủ, có replay/snapshot. Result đang stream là preview; `DELIVERED` chỉ đến sau verification. Không tích hợp MCP Apps. Xem [S04](docs/specs/04-ag-ui-a2ui-streaming.md).

## 3. Các khái niệm cốt lõi

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

## 4. Cách tính tiền

Mọi giá đến từ **offer của bot** cho từng lần gọi (xem §2). Payvoke chỉ đặt các luật bảo vệ:

- Offer không thấp hơn **giá sàn** của policy (bù gas hold + release do Payvoke trả).
- Command có thể khai **trần giá** `maxAmount`; offer vượt trần bị từ chối và store hiển thị trần đó.
- Offer chỉ được rút ngắn thời gian giao; refund, side effects, số lần sửa và mức bằng chứng luôn lấy từ điều khoản đã đăng ký của command.
- Giá không bao giờ lấy từ text của bot; chỉ offer có cấu trúc mới thành quote, và buyer luôn thấy quote rồi tự ký.

Payvoke luôn ra **một số tiền chính xác** trước khi ký; tính theo invocation, không theo token hoặc thời gian chạy. Tin nhắn trước khi trả miễn phí nhưng giới hạn số lượng.

Ví dụ minh họa, không phải giá mặc định:

```text
/summarize  bot báo 0,01 USDC cho đoạn văn ngắn
/ocr        bot báo theo số trang trong file, trần 2 USDC
/research   bot hỏi phạm vi bằng form rồi báo 5 USDC
```

Một invocation có thể gồm buyer gửi yêu cầu, provider hỏi lại, buyer trả lời, provider giao kết quả và buyer yêu cầu sửa trong phạm vi đã mua. Những bước tiếp tục đúng phạm vi không thu thêm tiền.

Yêu cầu mới, đổi mục tiêu, sửa ngoài phạm vi hoặc chạy command khác có thể cần invocation và quote mới. Không có cờ tùy ý như `free:true` để biến công việc mới thành miễn phí.

Tin nhắn mới không tham chiếu câu hỏi hoặc yêu cầu sửa không tự được coi là phần tiếp tục miễn phí. Trước mỗi lần tính phí mới, UI phải thể hiện giá, dữ liệu gửi và quyền chi áp dụng.

## 5. Hành trình của buyer

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

Buyer xem tiến độ, trả lời câu hỏi, nhận kết quả đã được kiểm tra, yêu cầu sửa đúng phạm vi hoặc đề nghị hủy.

### Bước 10: Kết thúc tài chính

Finance worker tự kết thúc từng khoản giữ: giao đúng hạn và đã kiểm tra thì giải ngân sau review window; không giao, lỗi hoặc giao trễ thì hoàn toàn bộ cho buyer. Nếu không có quyết định nào trước hạn cuối, buyer tự reclaim phần còn giữ.

## 6. Vai trò của x402

x402 xử lý thanh toán ở lớp HTTP. Payvoke quản lý catalog, giao việc, kết quả và hoàn tiền/giải ngân.

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

Auth, body validation và kiểm tra ownership/quote phải chạy trước settlement. Adapter tích hợp ở Fastify `preHandler`; dùng stock middleware settle ở `onRequest` có thể khiến request sai nghiệp vụ vẫn bị thu tiền.

Pending có thể vẫn trả HTTP 402 kèm transaction receipt. Client phải đọc trạng thái và reconcile, không coi mọi 402 là chưa trả tiền. Không tự fallback sang scheme `exact`, chain khác hoặc public facilitator.

### Đối chiếu với nghiên cứu bảo mật x402

Các nghiên cứu năm 2026 tìm thấy lỗ hổng ở mọi facilitator x402 công khai được thử: báo thành công khi chưa settle, một chữ ký dùng cho resource khác, settle trùng khi request đồng thời, overdraft allowance, gas abuse và lộ PII trong metadata. Scheme `payvoke-vault` được thiết kế để chặn từng lớp lỗi này: chữ ký gắn đúng invocation/quote/input, consume-once onchain, chỉ `RELAYER_ROLE` settle được, `settle` kiểm tra lại toàn bộ, trần gas, finality gate và header chỉ chứa hash. Giá sàn so với gas nằm trong policy deployment. Xem [S02 §11](docs/specs/02-x402-and-vault.md#11-đối-chiếu-nghiên-cứu-bảo-mật-x402) và [M06](docs/modules/06-x402-payments-and-refunds.md).

## 7. PayvokeVault và vòng đời tiền

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

Refund đưa tiền về buyer available, không tự chuyển ra ví ngoài và không reset spending counters.

### Deadline

| Mốc                | Ý nghĩa                                          |
| ------------------ | ------------------------------------------------ |
| `validUntil`       | Hạn bắt đầu thanh toán                           |
| `deliveryDeadline` | Hạn giao                                         |
| `releaseNotBefore` | Thời điểm sớm nhất được giải ngân                |
| `resolveBy`        | Mốc cuối giải quyết; sau đó buyer có thể reclaim |

Các mốc được chốt trước ký, không tính lại mỗi retry. Buyer bấm chấp nhận không cho phép bỏ qua thời điểm release tối thiểu.

Nếu giao muộn hoặc buyer không truy cập được file, thời gian review thực tế phải được bảo vệ. Không tự kéo dài hold bằng cách sửa chữ ký cũ; nếu không đủ thời gian trước `resolveBy` thì hoàn tiền.

### Phân quyền tài chính

- **Relayer:** giữ tiền theo buyer authorization, không tự rút/giải ngân.
- **Refund/release approver:** ký quyết định hoàn/giải ngân theo policy tự động.
- **Finance executor:** gửi quyết định đã được ký.
- **Pauser:** dừng admission mới.

Executor chỉ gửi quyết định đã được duyệt. Approval ràng buộc decision ID, expected hold version và expiry; không replay quyết định cũ. Approver và executor là hai khóa riêng trong finance worker; contract từ chối nếu trùng địa chỉ.

Pause không được khóa vô thời hạn quyền revoke grant, rút available hoặc reclaim đủ điều kiện. Contract không có quyền admin tùy ý lấy số dư buyer. Tuy vậy, token issuer vẫn có thể freeze/blacklist khiến transfer thất bại.

### Bất biến kế toán

```text
tokenBalance >= tổng buyerAvailable + heldRemaining
                + providerClaimable + platformClaimable

gross = refunded + remaining + providerReleased + feeReleased
```

Gửi token trực tiếp vào contract không qua deposit chỉ tạo surplus, không tự thành số dư buyer. Một invocation chỉ reserve một lần; release terminal không được thực hiện lại.

## 8. Chữ ký và snapshots

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

## 9. Provider tích hợp như thế nào?

### Tạo app và API key

Provider đăng nhập bằng ví để quản lý app. Provider worker dùng bearer API key với scope đọc events, ACK, reports, files và ghi command. Mỗi app có tối đa một key active; tạo key mới thu hồi key cũ ngay lập tức.

Secret chỉ hiện một lần khi cấp; backend lưu hash. API key không tự đổi payout wallet hoặc cấp operator role. Chủ app vẫn có thể quản lý bằng phiên đăng nhập ví mà không cần API key.

### Đăng ký commands

Bot đăng ký command bằng API key (scope `products:write`), giống Discord application commands. Cách gọn nhất là ghi đè cả danh sách:

```text
PUT /v1/provider/apps/:appId/commands
[{
  name: ocr
  description: Đọc chữ trong ảnh
  options:
    image: FILE, bắt buộc, accept [image/*], maxBytes 10 MB
    language: STRING, vi | en
  maxAmount: 2000000              # tùy chọn, trần giá offer (atomic USDC)
  terms:
    deliverySeconds, reviewSeconds, revisionPolicy,
    refundPolicy, sideEffects, dataUse, verification?
}]
```

Payvoke khớp theo tên: command không đổi giữ revision, command đổi tạo revision mới, command thiếu bị archive; default command giữ nếu còn, không thì lấy command đầu. Các route tạo/sửa/xoá từng command vẫn dùng được. Không có `pricing` hay `outputSchema` khi đăng ký.

Kiểu option: `STRING`, `INTEGER`, `NUMBER`, `BOOLEAN`, `FILE` (`accept`, `maxBytes`, `multiple`). Options được biên dịch thành subset JSON Schema 2020-12 có giới hạn; không nhận remote `$ref`, code hoặc schema không được kiểm soát. Defaults được áp một lần rồi đóng băng.

UI chuyển slash shortcut thành `commandId + arguments`. Backend không shell-eval chuỗi slash thô hoặc nhờ LLM đoán command/giá. Các action điều hướng như help/status/cancel không được biến thành paid command tùy ý.

### Interaction, form và file

- Buyer gửi tin (`content`), slash command (`commandId + arguments`) hoặc câu trả lời form (`replyToId + arguments`). Arguments được kiểm tra theo schema của command hoặc form.
- Bot gửi form bằng tin nhắn kèm `form: {title, description?, schema}`. Schema là object phẳng gồm field scalar, enum, file (`{type: "string", format: "file", accept?, maxBytes?}`) hoặc mảng file. Mỗi form chỉ được trả lời một lần.
- Field file nhận `fileId` của file buyer đã tải lên thread (trạng thái READY, đúng `accept`, không vượt `maxBytes`). Bot chỉ thấy metadata (tên, loại, kích thước, sha256); nội dung tải được sau khi tiền đã vào vault.
- File mà offer nhắc tới trong arguments được quote đóng băng vào `inputHash`, nên không đổi được sau khi ký.

### Command revision, availability và tự công khai

Thay đổi schema, giá, default command, payout hoặc điều khoản tạo revision mới hoặc cập nhật app. Không sửa ngầm revision đang phục vụ. Quote/invocation cũ pin revision cũ.

App được xem là available khi `status = ACTIVE`, có default command và heartbeat trong 45 giây gần nhất. Store trả app `PUBLIC` chưa archive, kể cả app suspend ở trạng thái unavailable; owner vẫn xem được app `PRIVATE` trong Studio và thread của mình.

Dừng bán không xóa nghĩa vụ với job đã trả tiền. Đã hold thì giao theo revision cũ hoặc xử lý hoàn, không đổi provider ngầm.

### Nhận việc qua SSE

Provider chủ động mở kết nối SSE tới Payvoke. Không yêu cầu Payvoke gọi webhook vào server provider.

Events gồm:

- `thread.message` (interaction miễn phí: tin nhắn, slash command, câu trả lời form)
- `invocation.ready`
- `invocation.answer`
- `invocation.revision_requested`
- `invocation.cancel_requested`

Mỗi app có một active stream lease, dùng fencing để stream mới thay stream cũ. Provider có thể tự phân phối job cho worker của mình.

### ACK khác hoàn thành

Provider nhận event, lưu job/dedupe bền vững, ACK, xử lý rồi gửi reports. ACK xác nhận đã tiếp nhận; provider gửi result sau khi xử lý.

Reports gồm started, progress, question, result, failed, unknown và cancelled. Report có ID chống trùng và sequence tăng theo invocation; report sai thứ tự/state bị từ chối.

Provider không được gửi report tự đổi payment status, refund hoặc payout. Questions không được dùng để xin khóa, tăng giá hoặc lấy thêm dữ liệu ngoài scope.

## 10. Chống trùng và phục hồi sự cố

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

## 11. Trạng thái tiền và công việc

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

## 12. Kết quả, file, sửa và hoàn tiền

### Kết quả

Provider gửi result (text/markdown, JSON và/hoặc file) → `VERIFYING`, chưa phải `DELIVERED`. Payvoke kiểm tra kết quả không rỗng (và output schema nếu revision cũ có khai), file đúng invocation/provider, dữ liệu đủ, loại/kích thước/checksum, an toàn theo policy và khả năng buyer truy cập.

Các kiểm tra này không xác minh nội dung chuyên môn. Tiến độ tạm thời tách khỏi artifact cuối; platform ghi thời điểm giao, không dùng timestamp provider để lùi ngày giao.

### File

- Bytes nằm ở object storage S3-compatible; PostgreSQL lưu metadata.
- Chỉ file `READY` được chọn làm input.
- Download kiểm tra quyền rồi cấp URL ngắn hạn.
- Signed URL không nằm trong snapshot thanh toán hoặc log công khai.
- Không tự tải URL Internet bất kỳ do provider đưa, tránh SSRF.
- Retention theo điều khoản.
- Upload đi thẳng lên storage bằng presigned URL. Server copy sang key riêng, tính lại sha256/size rồi mới đánh dấu `READY`, nên URL upload cũ không ghi đè được file đã kiểm tra.
- Local dùng RustFS trong docker compose, production dùng Neon S3 storage; chỉ khác giá trị các biến `S3_*`.

Upload xong không tự có nghĩa artifact đã giao. Kết quả có file chỉ được ghi bằng chứng `REC` khi mọi file còn nguyên trong storage; chi tiết endpoint ở [S01 §5.4](docs/specs/01-api-and-provider-protocol.md#54-file).

### Revision

Sửa đúng phạm vi giữ invocation cũ, không thu thêm tiền, tạo artifact version mới và giữ bản cũ. Sửa ngoài phạm vi cần lần mua mới, không tự động charge.

### Cancellation

Bấm hủy tạo đề nghị dừng. Cần xác nhận riêng việc provider đã dừng, side effect đã xảy ra hay chưa và tiền đã hoàn hay chưa.

### Hoàn tiền và giải ngân tự động

Payvoke không phân xử chất lượng nội dung và không có quy trình tranh chấp; chất lượng dựa vào uy tín provider và đánh giá của buyer. Finance worker chỉ áp dụng các quy tắc kiểm chứng được:

| Tình huống                                                               | Kết quả      |
| ------------------------------------------------------------------------ | ------------ |
| Kết quả đạt `minEvidence` trước `deliveryDeadline`, đã hết review window | Giải ngân    |
| Provider báo `FAILED` mà chưa có kết quả đạt chuẩn                       | Hoàn toàn bộ |
| Quá `deliveryDeadline` mà chưa giao, hoặc giao trễ                       | Hoàn toàn bộ |
| Review window kéo quá `resolveBy`                                        | Hoàn toàn bộ |

Nếu worker dừng hoặc quyết định thất bại liên tục, buyer vẫn reclaim được phần còn giữ sau `resolveBy`, kể cả khi vault đang pause.

Sau terminal release, không thể refund từ chính hold đã đóng. Bồi hoàn muộn cần nguồn tiền riêng; không được lấy tiền buyer khác để bù.

### Đánh giá và vận hành

Buyer đánh giá invocation đã trả tiền và được giao. Đánh giá gắn với phiên bản sản phẩm, sửa có lịch sử. Mẫu quảng cáo provider không được trình bày như đánh giá buyer.

Vì Payvoke trả gas cho giao dịch giữ tiền, số invocation có thể bị làm giả rẻ như đã thấy trên x402 công khai. Store nên hiển thị số buyer độc lập đã xác minh và rating theo command revision thay cho số giao dịch thô; giải ngân nên dựa trên mức bằng chứng tối thiểu mà command đã khai báo. Xem [M05](docs/modules/05-artifacts-and-verification.md) và [M09](docs/modules/09-reputation-and-operations.md).

Operator có thể dừng bán, revoke key lộ và xử lý sự cố theo quyền. Mọi hành động cần audit: ai làm, lý do, thời điểm và điều kiện mở lại. Provider offline không làm biến mất job đã trả; outcome chưa rõ phải điều tra trước khi phát lại.

## 13. MCP cho ứng dụng AI

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

### Tools

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

Buyer phê duyệt quote qua trusted local CLI ngoài MCP. Approval gắn với đúng quote/digest/invocation/profile và spending policy; retry cùng invocation có thể dùng quyết định cũ, invocation mới phải được duyệt mới.

Bridge chỉ ký khi đồng thời hợp lệ: API authorization, owner/workspace, quote, explicit approval, local policy, grant, reservation/balance và payment challenge. Không để LLM đánh giá thay các kiểm tra deterministic này.

Mô tả command, tài liệu hoặc output provider là dữ liệu không đáng tin, không được thay policy, đổi vault hoặc yêu cầu submit thêm để “mở khóa kết quả”. Tools không nhận private key, token, RPC, chain, vault, calldata hoặc origin tùy ý.

### Lưu khóa và giới hạn

Khóa/token ở OS keychain. Không có secure storage phù hợp thì paid mode phải tắt, không fallback plaintext.

Local reservation/journal khóa chống race giữa các process; timeout không giải phóng ngân sách nếu chưa rõ đã giữ tiền hay chưa. Submit trả job ID sau API acceptance, không đợi provider chạy xong; host đọc trạng thái bằng polling.

Bridge không hỗ trợ remote paid signing, tự đọc filesystem/upload file, tự fetch URL hoặc tự render script từ kết quả. File đầu vào được upload trên web trước. Stdio stdout chỉ dành cho protocol, log đã redact đi stderr. Dùng SDK/protocol đã pin và kiểm tra tương thích host, không mặc định mọi host MCP đều tương thích.

## 14. Kiến trúc kỹ thuật và database

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

Stack:

- **Fastify:** API.
- **PostgreSQL + Prisma:** persistence.
- **Solidity + Hardhat:** vault và contract tests.
- **viem:** EVM và typed data.
- **React/TanStack:** frontend.
- **Local stdio MCP bridge:** tích hợp ứng dụng AI.
- **S3-compatible storage:** khi bật file.

Điều phối dùng PostgreSQL outbox, transaction, lease và fencing, không cần Redis/Kafka. API process và process giữ khóa settlement phải tách quyền; facilitator không nhận yêu cầu relay tùy ý từ bên ngoài.

### Layout repository

| Đường dẫn                    | Vai trò                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `apps/api`                   | API Fastify cho frontend và provider (auth, catalog, quote, x402 gateway, AG-UI) |
| `apps/facilitator`           | Facilitator x402 nội bộ, không giữ khóa                                          |
| `apps/settlement-worker`     | Worker gửi `reserveHold`, giữ khóa relayer                                       |
| `apps/finance-worker`        | Worker tự động hoàn tiền/giải ngân, giữ khóa approver và executor                |
| `packages/payvoke-db`        | Prisma schema, migrations và client dùng chung                                   |
| `packages/payvoke-payments`  | Domain thanh toán: journal, admission, settlement, finance                       |
| `packages/payvoke-server`    | Env loader, redaction, cấu hình deployment vault dùng chung cho service          |
| `packages/payvoke-testkit`   | Fixture test: PGlite, local EVM, vault reader                                    |
| `tests/payments-e2e`         | Test tích hợp xuyên service và conformance x402                                  |
| `packages/payvoke-vault`     | Solidity, tests, deployment và ABI                                               |
| `apps/frontend`              | Web UI: store, chat, Studio                                                      |
| `apps/slide`                 | Slide pitch                                                                      |
| `docs`                       | Modules, specs và nghiên cứu                                                     |
| `packages/payvoke-protocol`  | Schemas, snapshots, typed data và codecs dùng chung                              |
| `packages/payvoke-x402`      | Adapter client/server/facilitator của scheme `payvoke-vault`                     |
| `packages/openui-components` | Catalog OpenUI dùng chung backend/frontend                                       |

### Services và deploy

Mỗi service có Dockerfile riêng (build context là root repo) và đọc `.env` của chính nó; copy từ `.env.example` cùng thư mục.

| Service                  | Lệnh local                            | Dockerfile                          | Giữ khóa                                                       |
| ------------------------ | ------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `apps/frontend`          | `pnpm --filter frontend dev`          | `apps/frontend/Dockerfile`          | Không                                                          |
| `apps/api`               | `pnpm --filter api dev`               | `apps/api/Dockerfile`               | Không                                                          |
| `apps/facilitator`       | `pnpm --filter facilitator dev`       | `apps/facilitator/Dockerfile`       | Không (chỉ `RELAYER_ADDRESS`)                                  |
| `apps/settlement-worker` | `pnpm --filter settlement-worker dev` | `apps/settlement-worker/Dockerfile` | `RELAYER_PRIVATE_KEY`                                          |
| `apps/finance-worker`    | `pnpm --filter finance-worker dev`    | `apps/finance-worker/Dockerfile`    | `FINANCE_APPROVER_PRIVATE_KEY`, `FINANCE_EXECUTOR_PRIVATE_KEY` |
| `apps/job-worker`        | `pnpm --filter job-worker dev`        | `apps/job-worker/Dockerfile`        | Không                                                          |
| migrations (one-shot)    | `pnpm --filter @payvoke/db migrate`   | `packages/payvoke-db/Dockerfile`    | Không                                                          |

`compose.yml` là stack production tự host: Postgres, Redis, RustFS (S3), migrate, các service trên và web.

```sh
cp .env.example .env          # POSTGRES_PASSWORD, S3 keys, WEB_ORIGIN/API_ORIGIN/S3_PUBLIC_ENDPOINT
docker compose up -d --build
docker build -f apps/api/Dockerfile -t payvoke-api .   # build riêng một service
```

- Chỉ web, API và RustFS được publish (trên `BIND_ADDRESS`, mặc định loopback); đặt reverse proxy TLS phía trước. Postgres không publish; Redis chỉ mở trên loopback của host.
- Facilitator chạy container riêng, không publish; API gọi `http://facilitator:3002` trong mạng nội bộ của compose. Deploy tách máy thì facilitator phải đặt sau TLS. `FACILITATOR_TOKEN` phải giống nhau giữa API và facilitator; `RELAYER_ADDRESS` giống nhau giữa facilitator và worker.
- Compose ghi đè `DATABASE_URL`, `REDIS_URL`, `API_ORIGIN` và `S3_*` trong `.env` của từng service để mọi container dùng hạ tầng của stack.
- **DB mới cần một deployment policy đã duyệt** (vault, phí, giá sàn, thời gian giữ tiền) trong bảng `deployment_policies` với `activeSlot = 'active'`. Thiếu bản ghi này thì facilitator từ chối khởi động (`deployment_policy_mismatch`) và API chờ theo.

### Vai trò của Prisma schema

[Prisma schema](packages/payvoke-db/prisma/schema.prisma) bao phủ:

| Nhóm              | Models tiêu biểu                                                              |
| ----------------- | ----------------------------------------------------------------------------- |
| Danh tính         | `Account`, `LoginChallenge`, `WebSession`                                     |
| Quyền             | `OperatorRoleAssignment`, `ClientAuthorization`, `ClientWorkspaceAccess`      |
| Provider          | `App`, `AppApiKey`, `AppCommand`, `AppCommandRevision`                        |
| Store             | `AppStar`                                                                     |
| Workspace/context | `ChatThread`, `MessageVersion`, `WorkspaceBriefVersion`                       |
| Công việc         | `Invocation`, questions, answers, revisions, cancellations                    |
| Thanh toán        | `Quote`, `PaymentAuthorization`, `PaymentAttempt`                             |
| Chain             | `ChainOperation`, `ChainTransaction`, `ChainEvent`, nonce slots, sync cursors |
| Vault projections | `SpendGrant`, `VaultBalance`, `VaultHold`                                     |
| Provider delivery | `OutboxEvent`, connection, delivery, receipt, report                          |
| Kết quả/file      | `ArtifactVersion`, `ArtifactCheck`, `FileAsset`                               |
| Tài chính         | evidence, `FinancialDecision`                                                 |
| Kiểm toán         | `AuditLog`, `IdempotencyRecord`, ratings                                      |

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

## 15. Mười module chức năng

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
| [M09 — Operations](docs/modules/09-reputation-and-operations.md)           | Đánh giá, sự cố, audit                                       |
| [M10 — Vault](docs/modules/10-payvoke-vault.md)                            | Deposit, withdraw, grants, holds, payout                     |

## 16. Phạm vi

Config sai chain, vault hoặc capability phải fail closed. Giá trị fixture không được dùng làm cấu hình thật.

Ngoài phạm vi:

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
- [Nghiên cứu kiến trúc x402](docs/research/x402-integration-architecture.md).
- [Nghiên cứu agentic payments áp dụng cho Payvoke](docs/research/agentic-payments-literature.md).
- [Ma trận bằng chứng thanh toán](docs/payment-acceptance.md).

README là bản giải thích tổng thể. S01–S04 là đặc tả quy tắc nghiệp vụ và giao thức; nếu khác với phác thảo nghiên cứu cũ thì ưu tiên đặc tả. Tài liệu không liệt kê routes API: method, path và request/response lấy từ code trong `apps/api/src/modules/*`, là nguồn sự thật duy nhất.

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
