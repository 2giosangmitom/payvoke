# Roadmap triển khai Payvoke

> Ghi chú 23/10/2026: mô hình đã chuyển từ Product/ProductVersion/UsageSession sang App/AppCommandRevision/ChatThread. Các task cũ nhắc product/version/session được giữ làm lịch sử; khi triển khai, đọc App là đơn vị bán, command revision là bản bất biến và thread là hội thoại.
> Trạng thái: T001/T002 đã hoàn tất baseline và mapping kiểm thử ngày 20/10/2026; checkbox của các task khác vẫn cần nghiệm thu đầy đủ. Mốc lập: 19/10/2026. Phạm vi phát hành: Avalanche Fuji với USDC testnet; không bao gồm triển khai mainnet hoặc nhận tài sản thật.

**Cập nhật triển khai 23/10/2026:** đã có phần lớn đường đi chat AG-UI + OpenUI từ provider đến buyer, phiên/quote và kết quả JSON xác minh bằng host; đã chạy test API/PGlite, SSE HTTP thật, renderer React và frontend build. Đã có thêm multi-run question/answer, revision theo policy, action `QuestionForm` không charge, cursor expiry và ghi stream theo batch. Xem [S04](specs/04-ag-ui-a2ui-streaming.md) để biết chính xác phần có mã và khoảng trống nghiệm thu. Các mô tả skeleton/baseline bên dưới ghi lại trạng thái **19–20/10**, không phải báo cáo hiện trạng hôm nay; checkbox task vẫn chỉ được đánh dấu khi đủ bằng chứng nghiệm thu.

## 1. Thứ tự và cách sử dụng

Nền tảng → contract → backend/API → x402 và recovery → provider/job → tài chính và Fuji → frontend → MCP → kiểm thử/phát hành. Phần thanh toán phải được kiểm chứng trên backend trước khi làm giao diện.

- Nguồn yêu cầu: [S01 API/provider](specs/01-api-and-provider-protocol.md), [S02 x402/vault](specs/02-x402-and-vault.md), [S03 MCP](specs/03-mcp-client.md), [S04 streaming AG-UI/OpenUI](specs/04-ag-ui-a2ui-streaming.md), [GLOSSARY](../GLOSSARY.md).
- Roadmap có 130 task trong 10 giai đoạn. Tất cả ban đầu là TODO; tài liệu hoặc sample code có sẵn chưa đủ để đánh dấu hoàn thành.
- Làm một task hoặc một nhóm rất nhỏ có cùng mục tiêu trên mỗi PR. Task tài chính cần cả negative tests, không chỉ happy path. Nếu task còn lớn hơn một PR dễ review, tách thành subtask `Txxx.a`, `Txxx.b`, giữ dependency gốc.
- Chỉ đánh dấu DONE khi có code, tests và bằng chứng nghiệm thu. Ghi commit/PR, lệnh kiểm tra và kết quả ngay dưới task hoặc trong PR liên kết; không tạo một bảng tiến độ mâu thuẫn khác.
- Cột phụ thuộc ghi điều kiện kỹ thuật trực tiếp; task vẫn phải qua gate của giai đoạn trước, trừ các nhánh song song nêu ở §14. Dependency phải có code và pass tests trước khi bắt đầu task.
- Không gán lịch ngày/tuần khi chưa biết số người và tốc độ. Ưu tiên thứ tự và gate; sau hai milestone đầu mới ước lượng lịch bằng dữ liệu thực tế.

### Definition of Done áp dụng cho mọi task

1. Bám đặc tả; mọi thay đổi contract/schema có migration/version tương ứng, không tự đổi nghiệp vụ.
2. Có test đúng lớp: unit cho tính toán, integration cho DB/chain, HTTP contract cho endpoint, E2E cho luồng người dùng. Không mock mất phần đang cần chứng minh.
3. Formatting, lint, typecheck và test liên quan pass; không thêm secret/key thật vào repo/log.
4. Idempotency, quyền sở hữu, timeout và lỗi được xử lý nếu task có side effect.
5. Task không tự thêm Redis/Kafka, đa chain, hosted custody hay tính năng ngoài phạm vi để “chuẩn bị tương lai”.

## 2. Mốc hiện tại và layout mục tiêu

**Hiện trạng 25/10/2026** (kiểm tra lại trên commit `a7b97ec`):

- Backend Fastify có auth SIWE (Better Auth), catalog/store/star, provider app/key/command revision, thread, quote, x402 gateway, facilitator riêng, settlement worker, finance, AG-UI/OpenUI stream và công cụ vận hành Fuji. 10 migration Prisma; `pnpm --dir apps/backend test` 112 pass, 6 skip (EVM/PostgreSQL cần cờ riêng). `tsc --noEmit` đầy đủ đã pass; lỗi `thread-stream` ghi ở baseline không còn.
- `PayvokeVault.sol` đã thay Counter sample: 82 test pass (71 Solidity gồm adversarial/fuzz/invariant, 11 Node.js) và Ignition module.
- `packages/payvoke-protocol` (8 test vectors/ABI), `packages/payvoke-x402`, `packages/openui-components` đã tồn tại.
- Frontend có store, chat, Studio, renderer OpenUI và ký thanh toán; build pass; 4 test renderer chạy được bằng tsx nhưng chưa có script `test`.
- Chưa có: deployment Fuji, endpoint file/dispute/acceptance/cancellation/pending-events, OpenAPI sinh từ code, CI, Dockerfile/cấu hình deploy backend, `apps/mcp`, `packages/payvoke-client`. `oxfmt --check` còn lỗi format ở một số file.

Thứ tự thực tế lệch roadmap: frontend đã được làm trước gate T092. Điều này không làm các gate cũ mất hiệu lực; T092/T109 vẫn phải có bằng chứng trước khi coi là đạt. Checkbox bên dưới chưa được đánh dấu vì chưa đối chiếu đủ acceptance từng task; khi đánh dấu phải kèm commit và lệnh kiểm tra như §1. [Baseline T001](baseline.md) giữ trạng thái ngày 20/10 để làm lịch sử.

Các vùng hiện có:

- `packages/payvoke-vault`: Solidity, contract tests, deployment, ABI export.
- `apps/backend`: API và các module domain; entrypoint API tách entrypoint worker giữ khóa.
- `apps/frontend`: web UI (store, chat, Studio).
- `packages/payvoke-protocol`: schemas, canonical snapshots, typed data, codes và codec dùng chung; không xây framework đa chain.
- `packages/payvoke-x402`: adapter client/server/facilitator của scheme `payvoke-vault`.
- `packages/openui-components`: catalog OpenUI dùng chung backend/frontend.
- Đề xuất `packages/payvoke-client`: phần client ký/gửi x402 dùng lại cho headless/browser/MCP; bắt đầu hẹp ở T016, không chứa UI hay khóa hardcode.
- Đề xuất `apps/mcp`: local stdio bridge, chỉ bắt đầu sau core buyer API; không là server custody từ xa.
- Provider fixture chạy ngoài tiến trình Payvoke, giao tiếp qua HTTP/SSE như provider thật; không chạy code provider trong backend.

Tên package mới là layout triển khai đề xuất; chốt exports khi làm task, không cần tạo cả cây thư mục rỗng trước.

## 3. M0 — Nền tảng và môi trường có thể lặp lại

**Mục tiêu:** một người mới clone repo có thể chạy checks và DB test mà không phải đoán cấu hình. Chưa làm frontend, chưa kết nối tiền thật.

| Task     | Phụ thuộc  | Việc làm / đầu ra                                                                                                            | Nghiệm thu                                                                                           |
| -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [x] T001 | Không      | Ghi baseline code hiện có, scripts chạy được, phiên bản runtime và những sample chưa phải sản phẩm.                          | Có checklist tái hiện baseline; không xóa sample/chỉnh code lạ khi chưa xác định nguồn.              |
| [x] T002 | T001       | Ánh xạ requirement S01–S03 vào test suites; ghi các bất biến: một product/session, một hold/invocation, tool không composer. | Mỗi bất biến có test surface và milestone chịu trách nhiệm, không chỉ một danh sách tính năng.       |
| [ ] T003 | T001       | Thiết kế config có schema: API/DB/RPC/origin, chain/token/vault, worker roles và redaction.                                  | Thiếu config bắt buộc hoặc sai chain/origin thì fail startup; không default sang public facilitator. |
| [ ] T004 | T003       | Tách profile `test-local` và `fuji`; fixture policy thời gian/ngân sách ngắn cho test, policy vận hành phải được duyệt sau.  | Test profile không dùng được ở deployment Fuji chỉ bằng đổi RPC; không có cap vô hạn ngầm.           |
| [ ] T005 | T001       | Kiểm tra package artifact thực tế của x402, viem, OpenZeppelin, Hardhat và runtime; pin version/lockfile tương thích.        | Import/export được kiểm tra với artifact cài thật, không chỉ chép API từ source nghiên cứu.          |
| [ ] T006 | T005       | Thêm scripts theo workspace: format/lint/typecheck, backend unit/integration, contract compile/test.                         | Có lệnh rõ cho mỗi suite; test không chạy và lỗi compile không bị exit code thành công.              |
| [ ] T007 | T003, T006 | Chuẩn hóa PostgreSQL test cô lập, migration/reset/seed fixture; phân biệt tmpfs test với volume bền vững deployment.         | Chạy integration suite hai lần độc lập; không reset DB ngoài test bằng nhầm biến môi trường.         |
| [ ] T008 | T006, T007 | CI nền tảng chạy format/lint/typecheck và tests hiện có; cung cấp env mẫu không secret.                                      | PR làm hỏng check bị chặn; log không lộ credential; CI không đòi browser/frontend đã xong.           |

**Bằng chứng T001 — 20/10/2026:** [baseline và checklist tái hiện](baseline.md), khảo sát trên commit `d14bd98c6854284f195d3b6be9be7007f9ae51ac`. Prisma validate, frontend typecheck/build, vault compile/typecheck và 5 Counter tests pass; HTTP skeleton phản hồi 404. Format root và backend typecheck fail đã ghi nguyên trạng; lint có 1 warning. Không sửa implementation. DB integration chờ URL Neon cloud từ chủ dự án; Docker local giữ nguyên làm tùy chọn dev API, chưa chạy. Đây không phải bằng chứng Gate M0 đã đạt.

**Gate M0:** môi trường và checks tái hiện được; thiếu policy thật không chặn viết code local nhưng phải chặn bật giao dịch deployment.

**Bằng chứng T002 — 20/10/2026:** [mapping S01–S03](test-mapping.md) có test surfaces, ca hợp lệ/negative, task/milestone và đối chiếu toàn bộ acceptance lists S01 §9, S02 §10, S03 §14. Ba bất biến tối thiểu nằm tại API-01/PAY-06/API-02; crash/recovery và release gates có mục xuyên lớp. Chỉ bổ sung tài liệu, chưa có suites mới hoặc bằng chứng pass implementation; không cần URL Neon để hoàn tất mapping.

## 4. M1 — Shared contracts, schemas và signing client hẹp

**Mục tiêu:** backend, contract, browser và MCP dùng chung schema quote và enum.

| Task     | Phụ thuộc        | Việc làm / đầu ra                                                                                                | Nghiệm thu                                                                                                      |
| -------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [ ] T009 | T008             | Tạo package protocol hẹp; schema money/ID/address/time, product kind, payment/execution status và common errors. | Money float/âm, address sai, status lạ bị từ chối; schema không phụ thuộc Fastify hoặc UI.                      |
| [ ] T010 | T009             | Schema command/input/output/terms, defaults và subset JSON Schema được hỗ trợ theo S01.                          | Required/enum/bounds/default hoạt động; remote refs, schema quá sâu hoặc field lạ bị chặn.                      |
| [ ] T011 | T009, T010       | Canonical InputSnapshot/TermsSnapshot/PolicySnapshot, JCS và ID → bytes32 theo S02.                              | Golden tests cho null/array/order/Unicode/number; thay nội dung hoặc version đổi hash đúng dự kiến.             |
| [ ] T012 | T011             | Implement InvocationQuote/DebitAuthorization typed data và chạy fixture EIP-712 đã có.                           | TS tính đúng digests/recovered signer; mutation từng field/domain làm mất ràng buộc như expected.               |
| [ ] T013 | T009             | Hàm transition payment/execution và decision rules có kết quả lỗi xác định.                                      | Invalid state không âm thầm nhảy bước; payment HELD không đồng nghĩa DELIVERED.                                 |
| [ ] T014 | T009, T010       | Khai báo DTO/route schemas và pipeline sinh OpenAPI từ cùng nguồn schema.                                        | OpenAPI parse/validate được; API schema drift tạo check lỗi thay vì sửa Markdown bằng tay.                      |
| [ ] T015 | T010–T013        | Fixture nghiệp vụ hợp lệ: một agent `/ask`, một tool `/summarize`, quote/terms/grants và các actor riêng.        | Fixture hash-only `{}` không bị dùng làm input quote thật; mọi sample nghiệp vụ pass schema.                    |
| [ ] T016 | T005, T012, T015 | Client adapter hẹp cho chuẩn bị/kiểm tra payload và signer interface; có signer local cho test, chưa cần UI.     | Sign đúng quote; từ chối origin/chain/asset/vault/digest sai; không nhúng test private key vào package runtime. |

**Gate M1:** golden fixtures pass; schema và chữ ký có một định nghĩa chung. Không tạo generic repository hoặc multi-chain plugin framework.

## 5. M2 — Smart contract PayvokeVault hoàn chỉnh ở local

**Mục tiêu:** chứng minh tiền và quyền chi độc lập với backend trước khi ghép x402. Mỗi task phải có test fail trước khi có implementation tương ứng khi khả thi.

| Task     | Phụ thuộc        | Việc làm / đầu ra                                                                                             | Nghiệm thu                                                                                                 |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [ ] T017 | M1               | Mock USDC 6 decimals cho tests, gồm transfer failure/freeze và donation fixture.                              | Tests phân biệt asset đúng, transfer lỗi và token gửi trực tiếp không qua deposit.                         |
| [ ] T018 | T017             | Vault constructor/storage/config: immutable asset, roles, pause admission, fee/duration caps.                 | Zero address/cap sai bị reject; không có admin arbitrary withdrawal/upgrade ngoài đặc tả.                  |
| [ ] T019 | T018             | `deposit`, `availableBalance`, `withdrawAvailable`; SafeERC20 và reentrancy protection.                       | Chỉ ghi balance sau transfer hợp lệ; chỉ rút về owner; transfer fail không làm sai ledger.                 |
| [ ] T020 | T018             | `registerGrant`/`getGrant`, expiry, per-call/period/lifetime caps và epoch ban đầu.                           | Chỉ buyer đăng ký; grantId không được tái dùng; config/cap sai bị chặn.                                    |
| [ ] T021 | T020             | `updateGrant`/`revokeGrant`; giữ counters, tăng epoch, fixed-period semantics.                                | Chữ ký epoch cũ hết quyền; refund/update không reset spent; giảm cap không underflow.                      |
| [ ] T022 | T012, T018       | `hashQuote`, `hashAuthorization`, signature validation và shared Solidity types.                              | Solidity hash bằng TS fixture; sai chain/vault/field/signer thất bại; không dùng personal_sign.            |
| [ ] T023 | T020–T022        | Admission checks cho quote/grant: deadlines, asset/provider, fee cap, epoch và signature.                     | Có negative tests cho từng custom error; verification không tự đổi số dư.                                  |
| [ ] T024 | T019, T023       | `reserveHold` atomic: available → held, spend counters, invocation consume và HoldReserved.                   | Một tx vừa cập nhật tiền vừa consume; không có nhánh giữ tiền một nửa khi revert.                          |
| [ ] T025 | T024             | Replay/idempotency của reserveHold: cùng digest trả hold cũ, khác digest conflict.                            | Gửi lại không trừ tiền/counter hoặc emit HoldReserved mới; đổi grant/quote không charge lại invocation.    |
| [ ] T026 | T021, T024       | Tests cap kỳ/lifetime, period boundary, withdrawal/debit/revoke ordering và nhiều grant.                      | Không vượt cap/số dư; thể hiện đúng giới hạn fixed-period và không giả có cap toàn ví.                     |
| [ ] T027 | T018, T022, T024 | ResolutionDecision typed data, approver roles, executor role, single-use ID và expectedVersion.               | Executor không tự duyệt; sai approval/role/version/expiry không thay tiền.                                 |
| [ ] T028 | T027             | `applyDecision` refund toàn bộ/từng phần, đóng hold khi remaining=0.                                          | Không hoàn quá held, không hoàn sai buyer, không tái dùng decision, không reset grant cap.                 |
| [ ] T029 | T028             | Release remaining, tính fee trên net sau refund và provider/platform claimable.                               | Không release sớm/hai lần; rounding đúng qua nhiều partial refunds; ledger bảo toàn.                       |
| [ ] T030 | T024, T027       | `openDispute` và điều kiện resolver khi disputed hold.                                                        | Chỉ buyer mở; approval thường không giải ngân disputed hold; ticket DB không phải bằng chứng chain.        |
| [ ] T031 | T028, T030       | `reclaim` sau resolveBy; phân xử race decision/reclaim đúng deadline.                                         | Buyer lấy lại remaining khi expired, cả paused/disputed; sau deadline không capture được.                  |
| [ ] T032 | T019, T029, T031 | `withdrawProvider`/`withdrawPlatform`, role/pause tests và mọi read/event cần indexer.                        | Chỉ rút claimable của caller; pause không khóa revoke/available withdrawal/reclaim.                        |
| [ ] T033 | T025–T032        | Invariant/fuzz tests: liabilities, gross decomposition, no double spend, donation surplus, adversarial calls. | Random action sequences không phá bất biến; transfer failure/reentrancy không làm sinh tiền.               |
| [ ] T034 | T033             | Local deployment script, export ABI/types/deployment manifest và regression suite contract.                   | Deploy local từ đầu, nạp → grant → hold → refund/release/reclaim → rút chạy được; ABI artifact có version. |

**Gate M2:** contract local xanh cả positive/negative/invariant tests. Chưa triển khai Fuji ở giai đoạn này; Counter sample chỉ bỏ khỏi đường chạy sản phẩm sau khi đã kiểm tra không còn phụ thuộc cần giữ.

## 6. M3 — Backend nền tảng, identity và command catalog

**Cập nhật quyết định 22/10/2026:** Publishing hợp lệ tự công khai, không cần operator review ở T043. Provider app có tối đa một API key hiệu lực; catalog hỗ trợ star và collection riêng tư. Phần provider gateway chưa có nên sản phẩm mới hiện `NOT_READY` và quote bị chặn. Checkbox task vẫn theo tiêu chí nghiệm thu đầy đủ, không coi UI/catalog slice này là Gate M3.

**Mục tiêu:** API kiểm tra quyền và lưu dữ liệu bền vững; kiểm thử được qua HTTP mà không cần frontend.

| Task     | Phụ thuộc        | Việc làm / đầu ra                                                                                             | Nghiệm thu                                                                                                    |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [ ] T035 | M2               | Fastify app factory, config boot, health/readiness, errors, CORS/CSRF và shutdown sạch.                       | HTTP tests không cần listen port thật; readiness phản ánh DB/config, không chỉ process còn sống.              |
| [ ] T036 | T007, T009, T035 | Prisma models/migrations cho identity, provider app/key, product/version/command, workspace/session và audit. | Migrate từ DB rỗng, seed test, constraints/ownership có integration tests.                                    |
| [ ] T037 | T036             | SIWE challenge một lần với domain/URI/Fuji/issued/expiry và signature verification.                           | Replay, hết hạn, domain/chain/address sai bị reject; nonce consume atomic.                                    |
| [ ] T038 | T037             | Login/logout/session cookie, owner middleware và operator role bootstrap có audit.                            | Cookie/CSRF đúng; logout revoke session; provider không tự thành operator hoặc có quyền chi.                  |
| [ ] T039 | T038             | Provider app management và payout identity do ví owner quản lý.                                               | App khác owner không sửa được; API key không đổi payout/owner; mọi thay đổi có audit.                         |
| [ ] T040 | T039             | Cấp/revoke/rotate provider API key và scopes theo app.                                                        | Secret hiện một lần, chỉ hash lưu DB; lost response không replay plaintext secret; revoked key bị chặn.       |
| [ ] T041 | T036, T039       | Product CRUD draft, immutable kind/owner, tạo product version mới.                                            | Không đổi tool thành agent cùng product; không mutate active version đang có quote.                           |
| [ ] T042 | T010, T040, T041 | API đăng ký/sửa slash commands có parameters, schema/default/price/terms và optimistic revision.              | Duplicate name/invalid schema bị reject; chỉ draft sửa được; API key đúng app mới đăng ký được.               |
| [ ] T043 | T038, T042       | Submit/review/approve/reject/suspend và catalog GET cho approved products/commands.                           | Draft/rejected không bán; suspend chặn lượt mới, không xóa job hoặc obligations cũ.                           |
| [ ] T044 | T036, T038, T043 | Workspace và usage session khóa một product/kind; read history có ownership.                                  | Cross-buyer/workspace ID bị chặn; product/provider khác phải tạo session mới.                                 |
| [ ] T045 | T036, T044       | Durable HTTP idempotency, body hash, conflict và transaction locking; primitives cho session execution slot.  | Cùng key/body trả cùng resource; khác body conflict; nhiều replica không dựa vào mutex RAM.                   |
| [ ] T046 | T038, T045       | Scoped external bearer authorization và revocation; phân biệt token API với grant onchain.                    | Token không mở quyền ví/provider/operator; owner/workspace/scope kiểm tra trên từng request.                  |
| [ ] T047 | T046             | Pairing init/lookup theo S03, verifier challenge, code expiry/attempt/rate limits.                            | Code/verifier không lộ log; lookup cần web auth; pairing không tự cấp quyền hoặc giữ tiền.                    |
| [ ] T048 | T047             | Pairing approval/exchange single-use, workspace/scope subset và audit thiết bị.                               | CSRF/phishing controls; verifier khác không đổi token; exchange mất response không phát secret lần hai.       |
| [ ] T049 | T014, T043–T048  | HTTP contract/ownership tests và xuất OpenAPI phần auth/catalog/session/pairing.                              | Endpoint thực khớp DTO/status/errors; signed headless wallet đăng nhập và provider đăng command qua API được. |

**Gate M3:** có thể tạo hai sản phẩm agent/tool, commands có schema và session qua API; chưa thể chạy công việc trả phí vì chưa ghép payment. Không tạo admin bypass chỉ để seed tests.

## 7. M4 — Quote, x402, settlement worker và recovery

**Mục tiêu:** client headless tạo quote và trả tiền qua x402; backend chỉ giao việc sau khi xác nhận hold onchain.

| Task     | Phụ thuộc              | Việc làm / đầu ra                                                                                  | Nghiệm thu                                                                                                         |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [ ] T050 | M3, T034               | Migrations invocation/quote/payment attempt/nonce slot/tx history/chain event/outbox và uniques.   | Một nonce slot giữ được nhiều replacement txHash; invocation uniqueness không hết hạn theo cache.                  |
| [ ] T051 | T011, T042, T044, T050 | Resolve effective arguments/context từ persisted versions; đóng băng input/terms/policy snapshots. | Không tin file/history client tự khai; signed URL không làm đổi hash; tool không nhận message history.             |
| [ ] T052 | T045, T051             | Quote API: reserve invocation ID, execution slot, giá cố định, deadlines, digest và expiry.        | Retry cùng key nhận quote cũ; đổi args conflict; quote hết hạn không auto-requote khi payment chưa rõ.             |
| [ ] T053 | T034, T050             | Vault read adapter và buyer balance/grant projection để preview, cùng deployment checks.           | Sai chain/asset/ABI/version fail; preview không được diễn giải là reserve thành công.                              |
| [ ] T054 | T016, T052, T053       | Custom scheme server và Fastify preHandler adapter; unpaid invoke trả 402 đúng persisted quote.    | Auth/schema/input/owner gate trước settle; requirements ổn định; không gắn stock middleware trùng route.           |
| [ ] T055 | T005, T023, T050, T054 | Private facilitator capability/verify/settle validation, supported discovery và service auth.      | `/supported` đúng Fuji/vault/scheme; settle tự kiểm tra đầy đủ vì upfront bỏ `/verify`; reject arbitrary calldata. |
| [ ] T056 | T034, T050, T055       | Worker nonce queue, signer isolation, signed-tx journal trước broadcast và gas/fee limits.         | Kill sau ký trước send còn đủ hash/raw tx để phục hồi; API process không giữ relay private key.                    |
| [ ] T057 | T024, T056             | Settle orchestration gọi reserveHold từ durable operation; xử lý success/revert/conflict.          | Hold thật trên local chain; replay đọc hold cũ, không cấp nonce/charge mới theo mỗi HTTP retry.                    |
| [ ] T058 | T057                   | Receipt/event/hold finality gate theo node/RPC config; giữ blockHash và chain evidence.            | Tx hash/accepted event đơn lẻ không mở gate; đúng vault/buyer/digest/amount mới xác nhận HELD.                     |
| [ ] T059 | T045, T050, T058       | Transaction HELD + một logical outbox ready event; trả 202 và receipt chính xác.                   | Crash DB commit không tạo hai logical job; không gọi provider trước confirmed hold.                                |
| [ ] T060 | T055–T059              | Pending/UNKNOWN, SDK auto-retry một lần, HTTP timeout và failure receipt sau hold.                 | Pending 402/timeout không bị coi là unpaid; settle gọi lại reconcile operation cũ, không double broadcast.         |
| [ ] T061 | T059, T060             | Payment status/receipt read API và lookup invocation khi signature/grant/quote đã hết hạn.         | Read bằng owner auth không charge; lost response trả receipt cũ, không bắt ký khoản mới.                           |
| [ ] T062 | T034, T050, T058       | Finalized event indexer, durable cursor/backfill, projections và idempotent reduce.                | Bỏ lỡ WebSocket/restart vẫn bắt đủ event; reindex không cộng/trừ tiền hai lần.                                     |
| [ ] T063 | T060–T062              | Reconciler cho pending/unknown, replacement tx, chain-held/DB-missing và orphan operations.        | Kill sau broadcast/receipt/commit rồi restart phục hồi; mất input snapshot thì cách ly, không dựng job từ hash.    |
| [ ] T064 | T016, T049, T052–T063  | Headless buyer test: wallet login → quote → 402 → session sign → hold → 202/read.                  | Chạy bằng client HTTP thật trên local chain; 2 submit đồng thời chỉ một debit và một logical ready event.          |

**Gate M4:** payment admission và recovery hoạt động không cần web. Việc nhận và giao kết quả của provider sẽ được kiểm chứng ở M5.

## 8. M5 — Provider gateway, execution, continuation và file

**Mục tiêu:** hoàn thành một công việc end-to-end và hỗ trợ cả agent/tool qua cùng protocol. Ưu tiên text trước, rồi mở file trong cùng giai đoạn.

| Task       | Phụ thuộc                | Việc làm / đầu ra                                                                                                                       | Nghiệm thu                                                                                                                         |
| ---------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [ ] T065   | M4, T040                 | SSE app stream xác thực, lease/fencing và outbox sender có buffer hữu hạn.                                                              | App chỉ nhận event của mình; một stream active/app; chưa HELD không có ready event.                                                |
| [ ] T066   | T065                     | ACK endpoint, replay cùng ID, Last-Event-ID, expired cursor và pending-events resync.                                                   | Cursor không thay ACK; ACK mất response/reconnect không tạo invocation mới hoặc mất event.                                         |
| [ ] T067   | T013, T066               | Provider reports started/progress, reportId/body hash/sequence và state transitions.                                                    | Trùng trả kết quả cũ, trái sequence/state conflict; provider không sửa paymentStatus.                                              |
| [ ] T067.a | T067                     | Ingress NDJSON AG-UI theo runId từ provider, chunk sequence/dedupe/fencing/cursor, OpenUI validation theo S04.                          | Hai text deltas và OpenUI surface được persist trước broadcast; reconnect không lặp; malformed/cross-app bị chặn.                  |
| [ ] T068   | T051, T067               | Question schema và buyer answer có questionId; continuation event cùng invocation.                                                      | Agent/tool đều hỏi được; answer không signer/charge; stale/foreign question bị reject.                                             |
| [ ] T069   | T010, T067               | Result text/structured output → VERIFYING → DELIVERED; lưu artifact version và server delivery time.                                    | Output sai schema không được giao; provider báo xong chưa tự release tiền.                                                         |
| [ ] T070   | T045, T068, T069         | In-scope revision quota/window, chiếm lại session slot và phiên bản kết quả mới.                                                        | Revision miễn phí đúng phạm vi; vượt phạm vi yêu cầu lượt mới; SESSION_BUSY không chạy chồng.                                      |
| [ ] T071   | T067, T069               | Cancellation request/report, cooperative stop và side-effect UNKNOWN handling.                                                          | Click cancel không hứa đã dừng/refund; unknown side effect không tự rerun.                                                         |
| [ ] T072   | T036, T040, T051         | File metadata, upload intent/completion, checksum/size/type validation.                                                                 | Buyer/provider upload đúng ownership/invocation; chỉ READY được chọn vào quote/result.                                             |
| [ ] T073   | T003, T072               | S3-compatible storage adapter, URL ngắn hạn, quyền download/refresh, safety/quarantine policy.                                          | Cross-owner/app download bị chặn; không fetch URL Internet tùy ý hoặc log bearer URL.                                              |
| [ ] T074   | T069, T073               | Artifact file delivery/version/retention, trạng thái không truy cập được và review timing.                                              | File chưa READY/không đọc được không DELIVERED; giữ bản cũ cho revision/dispute.                                                   |
| [ ] T075   | T065–T074, T067.a        | Provider fixture độc lập cho agent `/ask` và tool `/summarize`, persist dedupe trước ACK; agent stream AG-UI và OpenUI.                 | Fixture dùng HTTP/SSE thực; text xuất hiện trước result; mất kết nối/replay không trùng side effect/chunk.                         |
| [ ] T076   | T061, T068–T074          | GET invocation/result và session timeline/run history, nextActions rõ ràng.                                                             | Status tiền/execution tách biệt; tool nhận cấu trúc form/result, không phải transcript chat giả.                                   |
| [ ] T076.a | T067.a, T076             | Buyer AG-UI SSE projection, session cursor/replay/snapshot, OpenUI `ACTIVITY_SNAPSHOT openui-surface` và mapping report state theo S04. | Refresh/mất mạng không mất/nhân đôi text/surface; `source` tích lũy render lại được; `RUN_FINISHED` không tự DELIVERED hay charge. |
| [ ] T077   | T043, T065, T075         | Heartbeat/availability/offline policy, delivery backpressure và rate limits provider.                                                   | Offline dừng bán mới theo policy; hold/job cũ không mất hoặc tự chuyển provider.                                                   |
| [ ] T078   | T066–T077, T076.a        | Fault tests SSE/ACK/report/results/files/chunks: crash, replay, out-of-order, expired cursor và storage lỗi.                            | Prefix bền vững; lỗi không tự charge/lộ dữ liệu hoặc nhân đôi message/widget.                                                      |
| [ ] T079   | T064, T075, T076.a, T078 | Headless full execution gate cho cả hai product kinds, gồm question, revision và AG-UI + OpenUI.                                        | Login → quote → hold → ACK → streamed text/widget → VERIFYING → result; recovery thật, không frontend.                             |

**Bằng chứng triển khai 23/10/2026 (chưa đạt nghiệm thu đầy đủ):** T067.a/T068/T070/T076.a có mã và test HTTP/PGlite cho stream text/OpenUI, question → `WAITING_BUYER` → `/answers` tạo run mới, revision theo `revisionPolicy` với artifactVersion mới, cursor expiry/replay và snapshot khôi phục. T075 vẫn thiếu fixture provider độc lập chạy ngoài tiến trình; T078/T079 còn thiếu fault matrix đầy đủ, file artifacts và headless full flow. Không đánh dấu checkbox vì chưa đủ acceptance của từng task.

**Gate M5:** backend xử lý được luồng từ thanh toán đến giao kết quả. T069 có thể dùng làm demo text-only nội bộ; chỉ hoàn thành M5 khi có cả hỗ trợ file đã cam kết.

## 9. M6 — Tài chính, vận hành, fault injection và Fuji

**Mục tiêu:** kiểm chứng tài chính, vận hành và phục hồi sự cố trên Fuji trước khi bắt đầu frontend sản phẩm.

| Task     | Phụ thuộc                    | Việc làm / đầu ra                                                                                            | Nghiệm thu                                                                                                             |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| [ ] T080 | M5, T027                     | Financial decision records/API operator: approver, evidence/reason, amount, expectedVersion, audit.          | Người không đúng role không duyệt; provider report không tự tạo quyết định chuyển tiền.                                |
| [ ] T081 | T028, T029, T056, T080       | Decision signing/execution worker riêng quyền; journal tx, reconcile partial/full refund và release.         | Executor thiếu approval không thay tiền; replay decision không refund/payout hai lần.                                  |
| [ ] T082 | T069, T074, T081             | Release eligibility theo delivery/review thực tế, access outage và signed earliest deadline.                 | Buyer accept không payout sớm; chưa đủ review trước resolveBy thì xử lý resolver/refund, không sửa hold.               |
| [ ] T083 | T030, T076, T080             | Dispute hồ sơ + onchain intent/status; headless buyer mở dispute trực tiếp và đối soát.                      | DB-only/pending dispute không được báo đã khóa payout; dispute confirmed chặn release thường.                          |
| [ ] T084 | T031, T063, T081, T083       | Hạn xử lý/reclaim, read states sau refund/release và quyết định quá hạn.                                     | Reclaim hoạt động sau resolveBy cả paused/disputed; late refund không lấy tiền buyer khác.                             |
| [ ] T085 | T062, T081, T084             | Reconcile toàn vault liabilities/balances, accounting projections và donation surplus.                       | Lệch thật dừng admission/cảnh báo; donation không bị hạch toán thành buyer tiền mới hoặc insolvency.                   |
| [ ] T086 | T003, T056, T063, T077, T085 | Metrics/log correlation/alerts, admission rate limits, relayer AVAX và fee/gas cost mỗi invocation.          | Cảnh báo pending age/queue lag/liability mismatch; secret/signature/prompt không lộ log.                               |
| [ ] T087 | T007, T050, T062, T085       | Persistent deployment DB, backup/restore và phục hồi cursor/journal/outbox.                                  | Restore sang DB mới rồi reconcile chain; không mất dedupe hoặc tự charge/dispatch lại.                                 |
| [ ] T088 | T078, T081–T087              | Full crash matrix: trước/sau sign/send/receipt/DB commit/ACK/report/decision.                                | Recovery không phụ thuộc browser; từng failpoint chứng minh số debit/job/decision đúng.                                |
| [ ] T089 | T004, T082, T086             | Duyệt policy Fuji và role/key ownership thực tế; lập deployment allowlist/manifest.                          | Có giá trị cụ thể được duyệt cho fee/caps/deadlines/token/gas; không dùng fixture key hoặc thời hạn test làm mặc định. |
| [ ] T090 | T034, T088, T089             | Deploy vault Fuji, publish source/ABI/address/roles/token/code checks; cấu hình facilitator đúng deployment. | Deployment tái hiện được; key tách quyền; deposit/grant/hold/refund/release/reclaim smoke pass bằng USDC testnet.      |
| [ ] T091 | T079, T090                   | Headless Fuji E2E với provider thật theo protocol, receipt/finalized state và controlled RPC failures.       | Lưu tx hashes/balance delta; lost response/pending không charge lại; không dùng mempool/accepted thay execution.       |
| [ ] T092 | T049, T079, T082–T091        | **Backend-ready gate:** API/OpenAPI đầy đủ, authorization, tiền/execution/recovery/ops được kiểm chứng.      | Có bộ lệnh chạy lại full flow agent/tool và finance, không frontend, không fake settled flag hoặc admin bypass.        |

**Gate M6 / backend-ready:** chỉ sau T092 mới triển khai frontend ở M7. Kiểm chứng backend bằng client headless và các tài khoản test đúng quyền.

## 10. M7 — Frontend trên backend đã chạy thật

**Mục tiêu:** frontend dùng API cho logic tiền, quyền và chuyển trạng thái; browser chỉ giữ spend key của mình.

| Task       | Phụ thuộc                          | Việc làm / đầu ra                                                                                                                                   | Nghiệm thu                                                                                                               |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [ ] T093   | T092                               | App shell/routes, typed API client từ schemas, error/loading/session-expiry handling.                                                               | Không endpoint giả hoặc business enums copy lệch; auth error không bị xử lý như payment challenge.                       |
| [ ] T094   | T093, T037, T038                   | Kết nối ví Fuji, SIWE login/logout và CSRF/cookie integration.                                                                                      | Wallet sai chain/đổi account/hết session xử lý rõ; login không tự bật chi.                                               |
| [ ] T095   | T094, T019, T053                   | Màn hình số dư/approve/deposit/withdraw available và tx status.                                                                                     | Chờ chain confirmation, cập nhật từ API/chain; không tự cộng balance từ optimistic UI.                                   |
| [ ] T096   | T095, T020, T021                   | Browser spend key in-memory, đăng ký/cập nhật/revoke grant và hiển thị caps/expiry.                                                                 | Private key không lên API/localStorage; refresh mất key có UX tạo grant mới, không giả còn quyền ký.                     |
| [ ] T097   | T093, T043, T044                   | Catalog, product/commands, workspace và mở usage session đúng kind.                                                                                 | Một session không đổi product/provider; mở product khác tạo phiên mới và chọn context lại.                               |
| [ ] T098   | T097, T051, T076                   | Agent chat timeline/composer, default command mapping và dữ liệu chia sẻ có chọn.                                                                   | Tin nhắn thường map đúng string parameter; không auto gửi toàn workspace hoặc charge draft.                              |
| [ ] T098.a | T098, T076.a                       | Agent chat nhận AG-UI SSE và render `TEXT_MESSAGE_*`, progress, reconnection/snapshot theo S04.                                                     | Text hiện tăng dần trước result; refresh/replay không trùng message; chờ VERIFYING được hiển thị đúng.                   |
| [ ] T099   | T010, T042, T098                   | Slash palette/parser parameters, form field validation/defaults và command help.                                                                    | Named/positional args đúng schema; command lạ/flag trùng bị chặn; không eval/raw LLM routing.                            |
| [ ] T100   | T097, T010, T076                   | Tool run form, command selection, progress/result/history riêng.                                                                                    | Không chat composer; chọn tool từ palette mở tool session, không nhét vào agent thread.                                  |
| [ ] T101   | T016, T054, T060, T096, T099, T100 | Quote preview → local sign → x402 submit → receipt/pending recovery UX.                                                                             | Giá/input/phí rõ trước ký; retry/reload/502/pending402 không tạo lần mua mới.                                            |
| [ ] T102   | T068, T076, T101                   | Progress/question UI: agent trả lời trong chat, tool trả lời bằng form.                                                                             | Gắn đúng questionId; stale question báo lỗi; trả lời không mở ví/ký khoản thu khác.                                      |
| [ ] T103   | T069, T070, T074, T102             | Kết quả/version/file và request revision trong phạm vi.                                                                                             | Không render HTML/file nguy hiểm; không nhận result chưa giao; revision vượt phạm vi yêu cầu quote mới rõ ràng.          |
| [ ] T103.a | T103, T098.a                       | React OpenUI Lang renderer/catalog Payvoke, nhận `ACTIVITY_SNAPSHOT openui-surface` theo S04, binding/surface updates và action question allowlist. | Widget được update dần trong chat; component ngoài catalog/script và cross-owner actions bị chặn; fallback typed output. |
| [ ] T104   | T071, T083, T084, T101             | Cancellation, dispute transaction và reclaim UI với trạng thái tiền riêng.                                                                          | Click cancel không báo đã hoàn; dispute pending khác confirmed; reclaim/withdraw dùng đúng ví owner.                     |
| [ ] T105   | T039, T040, T094                   | Provider app/key console và rotate/revoke key.                                                                                                      | Secret hiện một lần, không vào analytics; không cho API key đổi payout hoặc quyền owner.                                 |
| [ ] T106   | T041–T043, T105                    | Provider product/command editor, schema parameters preview, draft/version/review status.                                                            | Agent phải khai báo default chat parameter; tool không có cấu hình chat; sửa active tạo version mới.                     |
| [ ] T107   | T038, T043, T080–T084, T094        | Operator review/incident/financial decision UI theo role, audit và approval/execution separation.                                                   | Operator thường không tự lấy quyền tài chính; UI không ký approval bằng khóa worker trong browser.                       |
| [ ] T108   | T046–T048, T094, T096              | Web pairing approval/client authorization list, scope/workspace/expiry và revoke API/grant riêng.                                                   | User đối chiếu code/signer, CSRF/clickjacking protections; approve token không tự tạo grant.                             |
| [ ] T109   | T093–T108, T098.a, T103.a          | Browser E2E cho buyer/provider/operator, AG-UI stream/OpenUI widgets, accessibility, responsive và pending/offline.                                 | Agent chat stream, tool no-chat, reload/reconnect và full Fuji flow qua backend thật.                                    |

**Bằng chứng triển khai 23/10/2026 (chưa đạt nghiệm thu đầy đủ):** T098.a/T102/T103.a có renderer OpenUI Lang (react-lang), reconnect bằng snapshot + cursor, form `QuestionForm` gửi answer qua API không charge và điều khiển revision cho kết quả `DELIVERED`; có test React component và build frontend. T109 vẫn thiếu browser E2E với ví/Fuji và provider fixture ngoài tiến trình; chưa có accessibility/responsive/offline đầy đủ.

**Gate M7:** người dùng hoàn thành được các luồng sản phẩm trên web. Không cần animation phức tạp; business logic vẫn nằm ở backend.

## 11. M8 — MCP local cho ứng dụng AI

**Mục tiêu:** AI host dùng cùng sản phẩm, API và số dư với web; giữ khóa chi local và thanh toán qua cùng luồng x402.

| Task     | Phụ thuộc                    | Việc làm / đầu ra                                                                                       | Nghiệm thu                                                                                                 |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [ ] T110 | T092, T109                   | Package executable MCP stdio, SDK/protocol version pin và capability/tool list tĩnh.                    | Protocol smoke pass; stdout chỉ JSON-RPC, log stderr; host legacy không bị giả là tương thích.             |
| [ ] T111 | T110, T003                   | Trusted local profile và OS keychain adapter cho token/spend key; permission/egress limits.             | Không secure storage thì tắt paid mode; tools không nhận origin/token/private key/calldata tùy ý.          |
| [ ] T112 | T047, T048, T108, T111       | CLI pairing/verifier/poll exchange/logout và đọc grant của đúng signer/owner.                           | Hết hạn/rejected/consumed đúng semantics; token API và onchain grant thu hồi độc lập.                      |
| [ ] T113 | T110, T112, T043, T076       | Read tools search/get/list commands/get invocation/get result.                                          | Owner/workspace isolation, pagination/schema, untrusted output; không auto fetch file/URL.                 |
| [ ] T114 | T044, T052, T113             | create_thread/prepare_invocation tools và persist reserved IDs/digest.                                  | Same key trả cùng phiên/quote; command/session mismatch fail; prepare không signer/charge.                 |
| [ ] T115 | T111, T114                   | Trusted CLI approve-quote ngoài model và standing policy local có version/caps.                         | `confirmed:true`/prompt injection không tạo consent; approval bind đúng quote/digest/owner/policy/expiry.  |
| [ ] T116 | T016, T060, T061, T112, T115 | submit_invocation qua custom x402 và trả job handle ngay sau HELD.                                      | Cùng API/scheme/Idempotency-Key từ invocationId; không chuyển key lên platform hoặc fallback exact.        |
| [ ] T117 | T068, T070, T071, T116       | answer/revise/cancel tools, async polling và transport cancellation semantics.                          | Continuation không trả phí; đóng host/cancel JSON-RPC không tự cancel/refund job.                          |
| [ ] T118 | T063, T111, T115–T117        | Local durable journal, atomic budget reservations qua nhiều process và crash recovery.                  | Unknown giữ reservation; HELD chuyển sang spent; restart không quote/sign/mua lại tùy ý.                   |
| [ ] T119 | T113–T118                    | Output/error schemas, truncation, redaction và deterministic policy/injection tests.                    | Metadata/result/provider prompt không đổi origin/cap hoặc lấy secret; errors không lộ stack/key/signature. |
| [ ] T120 | T110–T119                    | Integration với Inspector/host hỗ trợ revision đã pin, cả agent và tool.                                | Host không có slash UI vẫn prepare/submit/poll/answer được; không hứa Tasks/notifications chưa hỗ trợ.     |
| [ ] T121 | T120, T091, T109             | MCP acceptance gate: web chuẩn bị quyền → CLI pairing/approval → AI host mua và nhận kết quả trên Fuji. | Web/MCP thấy cùng session/invocation/balance; revoke, pending, timeout và replay không bypass payment.     |

**Gate M8:** hoàn thành phạm vi MCP local trong S03. Remote Streamable HTTP paid submit, OAuth server mới và lưu khóa buyer trên cloud đều ngoài roadmap này.

## 12. M9 — Hardening, staging và phát hành Fuji

**Mục tiêu:** có bản phát hành triển khai lại được, kèm kiểm thử và quy trình vận hành.

| Task     | Phụ thuộc              | Việc làm / đầu ra                                                                                                    | Nghiệm thu                                                                                                                          |
| -------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [ ] T122 | T033, T088, T109, T121 | Security review contract + web/API/MCP; rà quyền, signatures, file isolation, injection và custody assumptions.      | Không còn lỗi chặn phát hành; issue còn lại có severity/owner và quyết định chấp nhận rõ. Không gọi review nội bộ là audit độc lập. |
| [ ] T123 | T008, T092, T109, T121 | CI đầy đủ: schema/OpenAPI/ABI drift, contracts, DB/API tests, client vectors, browser/MCP integration.               | PR checks xác định; suite chậm có lịch/gate riêng, không bỏ flaky test để xanh giả.                                                 |
| [ ] T124 | T086, T109, T121       | Load/soak vừa sức: nonce queue, DB claims, SSE slow consumers, reconnect và chi phí gas/tx.                          | Có baseline đo được và giới hạn admission/backpressure; không hứa throughput chưa đo.                                               |
| [ ] T125 | T087, T089, T123, T124 | Packaging/deploy API/worker/frontend/MCP versioned, persistent DB/object storage, secrets và migrations có thứ tự.   | API không có worker keys; rollback app không tự rollback chain; ABI/deployment compatibility được kiểm tra trước boot.              |
| [ ] T126 | T085–T088, T125        | Runbooks pause/revoke key, gas cạn, RPC lỗi, migration failure, DB restore, dispute và orphan hold.                  | Diễn tập có người làm theo được; pause admissions vẫn có lối status/withdraw/reclaim khi chain/token hoạt động.                     |
| [ ] T127 | T125, T126             | Fresh staging rehearsal với DB sạch, ví/key mới, provider độc lập và deployment manifest đúng.                       | Chạy cả web/MCP/finance từ đầu; không dựa seed đặc quyền, old cookie hoặc key fixture công khai.                                    |
| [ ] T128 | T127                   | Hai sản phẩm demo agent/tool và hướng dẫn buyer/provider từ đăng ký tới nhận tiền/rút tiền.                          | Người mới đăng command/params qua API rồi sử dụng được; demo lỗi/retry/refund giải thích đúng trạng thái.                           |
| [ ] T129 | T122–T128              | Go/no-go checklist: policy được duyệt, roles/addresses, backups, test evidence, known risks và scope Fuji.           | Người chịu trách nhiệm xác nhận; thiếu gate nào thì không mở admission công khai. Không triển khai mainnet theo checklist Fuji.     |
| [ ] T130 | T129                   | Tag/release artifacts, cập nhật docs theo implementation, liên kết OpenAPI/ABI/examples và bàn giao backlog sau MVP. | Release tái hiện được; docs phân biệt planned/implemented; không còn test secrets hoặc TODO chặn luồng chính bị che giấu.           |

**Gate M9:** bản phát hành Fuji đầy đủ theo phạm vi đã chốt. Việc mở mainnet/tài sản thật là quyết định và security/compliance workstream mới, không phải bước tự động tiếp theo.

## 13. Đường đi ngắn nhất và demo nội bộ

### Critical path

```text
M0 → M1 → M2 contract local
   → M3 identity/catalog/session
   → M4 quote/x402/hold/recovery
   → M5 provider execution
   → M6 finance/Fuji/backend-ready
   → M7 frontend
   → M8 MCP
   → M9 release
```

### Demo theo từng mốc

1. **Sau T034:** contract local nhận deposit/grant/hold rồi refund/release/reclaim; không cần HTTP.
2. **Sau T049:** provider đăng ký command có parameters qua API; buyer mở phiên đúng product.
3. **Sau T064:** headless buyer đi qua HTTP402 thật, giữ tiền và nhận receipt, replay không thu lại.
4. **Sau T079:** provider nhận SSE và giao kết quả; buyer trả lời/sửa trong phạm vi không mất thêm tiền.
5. **Sau T092:** cùng luồng và vòng đời tài chính trên Fuji; tất cả bằng chứng backend có trước UI.
6. **Sau T109:** người dùng thực hiện bằng web; agent và tool có hai kiểu giao diện đúng yêu cầu.
7. **Sau T121:** AI host dùng MCP mua cùng sản phẩm và xem cùng kết quả trên web.

Demo chỉ chứng minh phạm vi đã kiểm thử ở mốc đó. Cần qua đủ gate trước khi mở payment admission công khai.

## 14. Công việc có thể làm song song

Khi có nhiều người, không đổi thứ tự gate nhưng có thể giảm thời gian chờ:

- Sau M1: contract M2 và phần backend runtime/DB/identity/catalog của T035–T049 có thể làm song song trên schemas đã chốt. T049 không cần giả contract; payment integration vẫn đợi T034.
- Sau T050–T052: facilitator/transaction worker và provider SSE có thể thử với transport fixtures; **gate giao provider thật vẫn đợi HELD**. Unit fixture event không phải bằng chứng end-to-end.
- File storage T072–T074 có thể làm song song text execution sau T051/T067 đủ interfaces; không đưa URL tải vào hash.
- Sau T092: frontend M7 và MCP protocol/read-only scaffold T110/T113 có thể làm song song nếu có người; MCP paid pairing/approval vẫn đợi web/auth/grant paths tương ứng. Kế hoạch mặc định một luồng vẫn hoàn thành frontend rồi MCP.
- Test vectors, negative tests, CI và security review làm liên tục, không dồn toàn bộ tới M9.

Mọi thay đổi schema/typed data dùng chung phải qua cùng quy trình review và cập nhật tests/version, kể cả khi các nhóm làm song song.

## 15. Những quyết định phải duyệt và những việc không làm

### Duyệt trước T090, không cần chặn local development

- Phí/trần phí, quote lifetime, delivery/review/resolve duration caps, resolution grace và cách tài trợ gas.
- API/pairing/token/grant lifetimes, input/file sizes, retention và limits/budgets.
- Vai trò ai duyệt refund/release/dispute, ai giữ relay/executor/admin keys, địa chỉ triển khai và quy trình thay quyền.
- File policy/quarantine, backup retention, ngưỡng alert/admission pause; không dùng dữ liệu thật nhạy cảm để thử nếu policy chưa có.

Số trong fixture chỉ là dữ liệu test. T089 phải có cấu hình cụ thể được duyệt, không chỉ đánh dấu “đã xem tài liệu”.

### Ngoài phạm vi ban đầu

- Multi-chain/custom Avalanche L1, smart-account/bundler/paymaster bắt buộc, ZK/TEE và batch-settlement/payment channel.
- Redis/Kafka/RabbitMQ trước khi Postgres outbox/worker đã được đo và thấy không đáp ứng.
- Remote MCP paid signer, arbitrary provider code execution trong Payvoke, tool gọi chéo agent trong cùng phiên.
- LLM tự phân xử tranh chấp hoặc tự xác nhận đồng ý chi tiền thay người dùng.
- Phí theo token/parameter động trái giá cố định command, mainnet rollout hoặc hỗ trợ token tùy ý.

## 16. Năm task đầu tiên để bắt tay vào làm

Thực hiện T001 → T003 → T004 → T005 → T006, đồng thời hoàn thành mapping T002 trước gate M0. Sau đó làm T007/T008 và các schemas T009–T012.

Task triển khai đầu tiên nên giao theo dạng: “Làm T001/T003 trong phạm vi hiện có; báo các commands/config còn thiếu; không thêm tính năng frontend và không tự thay đổi policy kinh tế.” Mỗi lần tiếp theo chọn task có dependency đã DONE, kèm acceptance test trong bảng.

## 17. Bổ sung từ nghiên cứu (25/10/2026)

Các task dưới đây rút từ [nghiên cứu agentic payments](research/agentic-payments-literature.md). Chúng không đổi gate hiện có; mỗi task vẫn theo Definition of Done ở §1. **Tiến độ 25/10/2026:** R01–R04 đã có code và test local: `test:conformance`, `minGrossAmount` trong policy, `terms.verification.minEvidence` + Evidence Envelope, và release bị chặn khi `evidence_below_minimum`. Checkbox vẫn để trống cho đến khi có bằng chứng Fuji và con số sàn được duyệt (T089); `REC` tự động cho file phụ thuộc T072–T074. R03/R04 thay đổi TermsSnapshot nên phải tăng `schemaVersion` và cập nhật vectors.

| Task    | Phụ thuộc        | Việc làm / đầu ra                                                                                                                                                                                      | Nghiệm thu                                                                                                          |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| [ ] R01 | T055, T060, T064 | Conformance suite x402: mỗi ca đặt tên theo SR1–SR8, F1–F4, M1–M6 ([S02 §11](specs/02-x402-and-vault.md#11-đối-chiếu-nghiên-cứu-bảo-mật-x402)); gồm test header/log không chứa prompt, PII, signature. | Một lệnh chạy toàn bộ suite; mỗi quy tắc có ít nhất một ca âm tính; thiếu ca nào thì suite báo rõ, không pass ngầm. |
| [ ] R02 | T086, T089       | Policy giá sàn mỗi command so với chi phí gas ước tính của hold + release; quote dưới sàn bị từ chối khi đăng command.                                                                                 | Giá dưới sàn trả 422 khi tạo revision; con số sàn nằm trong policy đã duyệt, không hardcode.                        |
| [ ] R03 | T042, T069       | `terms.verification.minEvidence` trong command revision; lưu mức bằng chứng và Evidence Envelope cho mỗi artifact version ([M05](modules/05-artifacts-and-verification.md)).                           | Revision mới khi đổi mức; envelope hash ổn định với cùng output; TermsSnapshot vectors cập nhật.                    |
| [ ] R04 | R03, T082        | Finance chỉ tạo quyết định release khi mức bằng chứng đạt `minEvidence`; dispute dùng hash envelope làm `evidenceHash`.                                                                                | Artifact chỉ có `SELF` không release được; thiếu bằng chứng trước `resolveBy` đi nhánh resolver/refund.             |
| [ ] R05 | T076, T097       | Chỉ số store: buyer độc lập đã xác minh, rating posterior có chiết khấu theo command revision ([M09](modules/09-reputation-and-operations.md)).                                                        | Giao dịch từ ví owner/payout của app không tăng chỉ số; nhiều invocation từ một ví chỉ tính một buyer.              |
| [ ] R06 | R05              | Xếp hạng store chống Sybil/steering; đánh giá phương án provider deposit (cần quyết định kinh tế của chủ dự án).                                                                                       | Thứ tự không phụ thuộc văn bản provider tự viết; có tài liệu quyết định về deposit trước khi bật.                   |
| [ ] R07 | T113, T096       | Gợi ý app theo ngân sách cho MCP/store (tư vấn), dùng rating đã xác minh, giá và hạn mức grant còn lại.                                                                                                | Gợi ý không tạo quote, không ký và không bỏ qua approve-quote; injection trong mô tả app không đổi thứ tự gợi ý.    |
| [ ] R08 | T080, T083, T086 | Tín hiệu tự động cho dispute/incident (tỷ lệ FAILED/UNKNOWN, revision, dispute theo app); ngưỡng chuyển operator.                                                                                      | Tín hiệu không tự refund/khoá payout; dưới ngưỡng không tạo việc thủ công; có audit khi operator dùng tín hiệu.     |
