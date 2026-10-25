# T002 — Ánh xạ yêu cầu vào kiểm thử

> Ghi chú 23/10/2026: các ca cũ dùng Product/ProductVersion/UsageSession. Mô hình hiện tại là App/AppCommandRevision/ChatThread; đọc product là app, version là command revision và session là thread khi đối chiếu.

## Phạm vi và cách đọc

Bằng chứng implementation/test payment hiện tại: [Payment acceptance — S01/S02](payment-acceptance.md)
(22/10/2026). Tài liệu bên dưới là thiết kế ban đầu, không phải trạng thái nghiệm thu hiện tại.

Nguồn yêu cầu: [S01 API/provider](specs/01-api-and-provider-protocol.md), [S02 x402/vault](specs/02-x402-and-vault.md), [S03 MCP](specs/03-mcp-client.md); bổ sung [S04 AG-UI/OpenUI](specs/04-ag-ui-a2ui-streaming.md) ngày 23/10/2026. Mốc lập: 20/10/2026, sau [baseline T001](baseline.md).

Đây là thiết kế kiểm thử; phần lớn suites bên dưới **chưa được triển khai**. Ngoại lệ đã có bằng chứng pass là API-13 (AG-UI/OpenUI) ở mức HTTP/PGlite và renderer React, chưa phải browser/FLOW/Fuji. T002 không tạo framework, fixtures nghiệp vụ hoặc tests thực thi. Các ID `API-*`, `PAY-*`, `MCP-*`, `SYS-*` là ID truy vết của tài liệu này, không phải mã lỗi hoặc ID do đặc tả cấp. Khi triển khai, tham chiếu ID trong test/PR và ghi bằng chứng nghiệm thu dưới task tương ứng ở roadmap; không coi mapping này là bảng tiến độ tests.

Mỗi mục ghi nguồn, ca hợp lệ/ca phải chặn, test surface và task chịu trách nhiệm. Task là chủ sở hữu công việc, không phải người được giao. Mốc đầu tiên chứng minh từng lớp không thay thế gate tích hợp sau đó.

### Test surfaces dự kiến

- **UNIT**: hàm/schema/codec thuần trong package protocol/client dự kiến ở T009/T016; dùng table-driven/golden/mutation tests. Không cần DB hoặc chain.
- **VAULT**: Solidity unit/negative/fuzz/invariant trong `packages/payvoke-vault/contracts/*.t.sol`; TypeScript orchestration trong `packages/payvoke-vault/test/`. Compile trước typecheck; dùng simulated chain và mock USDC 6 decimals, không RPC Fuji cho suite local.
- **DB**: integration transaction/constraints/migrations trong `apps/api` và `tests/payments-e2e` (đường dẫn cụ thể chốt ở T006/T007); hai connection/worker độc lập để kiểm tra race, không mutex RAM hoặc mock DB.
- **HTTP**: contract/auth/ownership qua Fastify injection và DB thật; kiểm chứng DTO/status/error/headers với OpenAPI cùng nguồn schema. Không dùng server listen thật nếu không cần transport.
- **FLOW**: HTTP/SSE thật + local chain + PostgreSQL + provider fixture ngoài tiến trình. Dùng process restart/failpoints, không mock phần hold/finality/outbox cần chứng minh.
- **WEB**: browser component/parser tests và browser E2E trong `apps/frontend`; kiểm tra DOM/role/focus, không chỉ screenshot. E2E tài chính dùng backend thật.
- **MCP**: policy/codec/keychain-adapter tests và integration qua tiến trình stdio trong app MCP dự kiến T110; fake signer/secure-storage có đếm calls cho negative tests, API/chain thật ở acceptance gate.
- **FUJI**: headless/browser/MCP E2E trên deployment allowlist, USDC testnet; lưu manifest, tx hashes, finalized reads và balance deltas.
- **OPS**: config boot, log capture, backup/restore, load và deployment compatibility checks; dùng tài nguyên test cô lập.

Không ấn định tên test runner/CLI mới trong T002. T006/T008/T123 sẽ cung cấp lệnh và CI gates. DB integration chờ URL Neon test và cơ chế cô lập được chốt ở T007; Docker local là tùy chọn dev API, không là điều kiện để hoàn tất mapping.

## 1. S01 — API, sản phẩm và provider

### API-01 — App, command revision và thread bất biến

- Nguồn: S01 §1, §4.1, §5.1, §7.
- Chứng minh: buyer tạo thread đúng app; revision mới dùng được cho quote mới nhưng invocation cũ giữ revision cũ. Từ chối đổi app/owner/provider cùng thread, command của app khác và truy cập thread khác buyer; đổi app phải tạo thread mới, không tự sao chép context. App suspend/archive chặn quote/thread mới nhưng lịch sử cũ vẫn đọc được.
- Surface/gate: UNIT T009; DB/HTTP T041/T044/T049 (M3); FLOW T051/T064 (M4); WEB T097/T109 (M7).

### API-02 — Chat shell, slash command và form arguments

- Nguồn: S01 §1, §4.2–4.3, §5.3; S03 §2.
- Chứng minh: mọi app dùng chung chat shell; free text map vào positional parameter của command đang chọn/default; command không có positional mở form arguments và không tự gửi. Gõ `/` mở danh sách command của app; backend chỉ nhận `commandId + arguments`. Chặn reserved/unknown/repeated flags, sai type, positional không khai báo và enum/number/boolean sai kiểu. Raw slash không tới shell/eval/LLM router; object/array nhập qua form.
- Surface/gate: UNIT/HTTP T010/T042/T049 (M1/M3); WEB parser/component T098–T100/T102/T106 và E2E T109 (M7).

### API-03 — HTTP conventions và DTO

- Nguồn: S01 §2, §5; S03 §6.1.
- Chứng minh: opaque IDs giữ case, money atomic string, RFC3339/Unix time đúng lớp, pagination/filter/principal-bound cursor. Ca lỗi gồm float/âm, additional property, JSON hỏng, body/header quá lớn, cursor khác principal/filter; đúng status 400/401/403/404/409/410/422/429/503 và error envelope không lộ secret. OpenAPI parse được và lệch implementation làm check fail.
- Surface/gate: UNIT T009/T014 (M1); HTTP T035/T049/T054/T076 (M3–M5); drift CI T123 (M9).

### API-04 — Wallet login và quyền độc lập

- Nguồn: S01 §3.1–3.2.
- Chứng minh: EOA SIWE đúng domain/URI/chain/address/time tạo cookie; hai login đồng thời chỉ consume nonce một lần. Chặn replay/expired/sai signature, Origin/CSRF và CORS credentials wildcard; logout revoke web session nhưng không giả revoke grant. Login/token API không tự cấp quyền debit hoặc operator.
- Surface/gate: HTTP/DB T037/T038/T046/T049 (M3); WEB T094/T109 (M7). ERC-1271 wallet không được tuyên bố hỗ trợ nếu chưa có tests riêng.

### API-05 — Provider key, app và publishing

- Nguồn: S01 §3.3, §4.1–4.2, §5.1.
- Chứng minh: owner tạo app, key scoped đúng app, rotate/revoke; secret chỉ trả một lần, DB lưu hash. Mất response không replay secret; key không đổi payout/owner/role hoặc cấp quyền cao hơn. Draft/rejected không bán, sửa active tạo draft, stale revision conflict; suspend/offline chặn lượt mới nhưng không xóa job đã hold.
- Surface/gate: DB/HTTP T039–T043/T049 (M3); FLOW T077 (M5); WEB T105/T106/T109 (M7).

### API-06 — Command schemas và defaults

- Nguồn: S01 §4.2, §5.2.
- Chứng minh: enum/required/bounds/nested array và defaults hợp lệ; namespace command theo app, `commandId` ổn định qua revision. Chặn remote refs, schema quá sâu/lớn, property lạ, tên trùng/reserved, giá không dương/vượt cap và terms thiếu. Defaults áp một lần trước quote, retry không áp default/version mới; không có flag paid-command bypass x402.
- Surface/gate: UNIT T010/T015 (M1); HTTP T042/T049 (M3), T051/T054 (M4).

### API-07 — Context, file ownership và frozen quote

- Nguồn: S01 §5.2, §5.4; S02 §3.
- Chứng minh: server resolve context đã chọn từ persisted versions; chỉ gửi nội dung khớp hashes. Không tin history/file content client tự khai; không gửi toàn bộ lịch sử chat ngoài context được chọn. Chỉ READY files được chọn, file/brief/message khác owner bị chặn trước settlement. Quote creation chưa giữ tiền/dispatch; hết hạn chưa submit trả lỗi, pending không auto-requote.
- Surface/gate: DB/HTTP T051/T052/T054 (M4), T072–T074 (M5); WEB T098/T101/T109 (M7).

### API-08 — Durable HTTP idempotency và thread execution slot

- Nguồn: S01 §2, §1, §7.
- Chứng minh: cùng principal/operation/key/body trả cùng resource; đổi body conflict, principal/operation khác không đọc nhầm resource. Hai DB connections tranh slot chỉ một invocation active; WAITING_BUYER/VERIFYING/UNKNOWN giữ slot. DELIVERED/FAILED/CANCELLED giải phóng dù tiền còn HELD; revision chiếm lại slot hoặc THREAD_BUSY. DRAFT chỉ hết hạn giải phóng nếu không có signed/pending admission chưa đối soát. Read/reclaim không chiếm slot.
- Surface/gate: DB/HTTP T045/T050/T052 (M3/M4); FLOW T063/T064/T070/T078 (M4/M5). Replay sau cache TTL vẫn chịu payment uniqueness PAY-06.

### API-09 — SSE lease, ACK và replay

- Nguồn: S01 §6.1–6.3.
- Chứng minh: chỉ app đúng key mở stream; một active lease có fencing. Last-Event-ID không thay ACK; reconnect/ACK mất response replay cùng eventId/invocationId. Cursor expired trả CURSOR_EXPIRED, pending-events resync đủ envelope; slow consumer disconnect không mất unacked event. App A không ACK event app B; heartbeat không chứng minh capacity. Provider persist dedupe trước ACK, side effect nhận invocation idempotency key khi có hỗ trợ.
- Surface/gate: HTTP/FLOW T065/T066/T075/T077/T078 (M5); full flow T079. Không tuyên bố exactly-once external side effect.

### API-10 — Reports, output validation và trạng thái độc lập

- Nguồn: S01 §5.3, §6.2, §7.
- Chứng minh: duplicate reportId/body trả kết quả cũ; body đổi/out-of-order/terminal transition trả conflict. Answer đưa WAITING_BUYER về QUEUED rồi ACK/started; revision tăng artifactVersion, không reset sequence. Result đi VERIFYING, chỉ DELIVERED sau schema/file checks và server delivery time; chưa giao trả RESULT_NOT_READY. Provider không đặt paymentStatus/refund/payout hoặc backdate delivery; FAILED+HELD là hợp lệ, HELD không đồng nghĩa DELIVERED.
- Surface/gate: UNIT T013 (M1); HTTP/FLOW T067/T069/T074/T076/T078/T079 (M5).

### API-11 — Continuation, cancel và side-effect UNKNOWN

- Nguồn: S01 §1, §5.3, §6.2, §7.
- Chứng minh: answer đúng question/schema và revision đúng scope/quota/window giữ nguyên invocation/hold, không signer/settle thêm. Stale/foreign question bị chặn; arbitrary message/free:true/vượt scope không thành continuation. Cancel chỉ ghi request; cancelled cần bằng chứng sideEffectStatus=none, UNKNOWN không tự rerun/chuyển provider/refund. `FAILED` hoặc quá hạn giao được finance worker hoàn tiền tự động.
- Surface/gate: HTTP/FLOW T068/T070/T071/T078/T079 (M5), T083 (M6); WEB T102–T104/T109 (M7); MCP T117/T121 (M8).

### API-12 — Storage và artifact lifecycle

- Nguồn: S01 §5.4, §6.1–6.2; S02 §3.2.
- Chứng minh: upload intent/completion xác minh size/type/checksum và buyer/app/invocation; quarantine/not READY không được quote/deliver. Download/refresh kiểm tra scope mỗi lần, URL ngắn hạn không vào hash/log; đổi URL không đổi quote. Không SSRF fetch URL tùy ý. File không đọc được không DELIVERED, giữ artifact versions cho revision và điều chỉnh review theo outage có bằng chứng.
- Surface/gate: HTTP + storage integration/FLOW T072–T074/T078/T079 (M5); finance T082 (M6); WEB T103/T109 (M7).

### API-13 — AG-UI LLM streaming và OpenUI widgets (bổ sung 23/10/2026)

- Nguồn: S01 §1, §5.1, §6.4, §9(11); S04 §1–5.
- Chứng minh: provider nhận runId ổn định theo dispatch/ACK, stream `TEXT_MESSAGE_START/CONTENT/END` với streamSequence riêng, OpenUI `CUSTOM payvoke.openui` theo catalog. Buyer thấy text tăng dần **trước report result**, renderer cập nhật component/data model mà không reload. Chỉ report `result` đi vào VERIFYING, chỉ M05 chuyển DELIVERED; UI events không charge/refund/release.
- Ca phải chặn: giả system role, tool call, HTML/JS, unknown component/catalog, out-of-order/duplicate khác payload, stale run, người mua/app khác, action sai questionId. Provider mất kết nối lấy committed cursor và replay; buyer refresh/snapshot/SSE Last-Event-ID hay expired cursor không mất hoặc nhân đôi chữ/widget. OpenUI không thay composer; fallback typed result hoạt động nếu không có surface.
- Surface/gate: HTTP/FLOW T067.a/T075/T076.a/T078/T079 (M5); WEB T098.a/T103.a/T109 (M7); OPS T124 (M9). Đã có test HTTP/PGlite stream text/OpenUI/cursor/ownership/delivery, question→answer continuation, revision theo policy, cursor expiry, SSE loopback và renderer React/QuestionForm. Chưa có browser wallet E2E, provider fixture ngoài tiến trình, file verification hay load/soak. Mapping không có nghĩa toàn bộ gate đã pass.

## 2. S02 — Chữ ký, tiền và recovery

### PAY-01 — Deployment allowlist và fail-closed config

- Nguồn: S02 §1, §6.3; S01 §8; S03 §12.
- Chứng minh: đúng x402 v2/payvoke-vault v1/upfront, Fuji 43113, USDC 6 decimals và deployed vault; payTo là vault, không payout wallet. Thiếu policy/origin/worker role hoặc sai chain/token/ABI/codehash/capability fail startup, không default public facilitator/exact/chain khác. Test-local không thành Fuji profile chỉ bằng đổi RPC.
- Surface/gate: OPS/UNIT T003/T004/T005 (M0), HTTP T053/T055 (M4); allowlist/policy thật T089/T090 (M6). Không tự chọn giá trị kinh tế.

### PAY-02 — Canonical snapshots và digest vectors

- Nguồn: S02 §3–4, §10; S01 §5.2.
- Chứng minh: JCS key order/null/array order/Unicode/number, duplicate keys/NaN/Infinity bị chặn, opaque ID case/prefix chính xác, EVM address so bytes. Hash schema/effective args/context/terms/policy đúng; root DTO/snapshot mismatch trả QUOTE_INCONSISTENT. Golden fixture xác minh digests/signature/recovered signer; TS và Solidity cùng hash. Mutation từng field/domain/chain/vault/amount/fee/provider/session/product/command/deadline/epoch làm mismatch hoặc invalid consent; không personal_sign/EIP-3009/arbitrary calldata.
- Surface/gate: UNIT T011/T012/T016 (M1), VAULT T022/T023/T034 (M2), HTTP T051/T054 (M4). Fixture hash-only không dùng thay business fixture T015.

### PAY-03 — Grant caps, epochs và race

- Nguồn: S02 §2, §8.1–8.2, §10.
- Chứng minh: chỉ buyer register/update/revoke; cap dương có thứ tự, expiry hữu hạn, epoch đầu 1 và grantId không tái dùng. Update/revoke invalidate chữ ký cũ nhưng giữ counters; hạ cap dưới spent không underflow. Fixed period floor(timestamp/periodSeconds), periodSeconds bất biến; boundary reset kỳ, không reset total/refund. Race spend/withdraw/revoke bảo toàn balance/caps; nhiều grants không được quảng cáo là cap toàn ví.
- Surface/gate: VAULT T020/T021/T023/T026/T033 (M2); client/WEB T096/T109 (M7); MCP T112/T118/T121 (M8).

### PAY-04 — Deposit, withdrawal và token failures

- Nguồn: S02 §8, §8.3–8.4.
- Chứng minh: deposit chỉ ghi available sau transfer hợp lệ, withdrawal chỉ về owner/claimable caller; insufficient/zero/config-invalid theo contract checks bị chặn. Mock USDC failure/freeze/reentrancy không làm sai ledger; direct donation tạo surplus, không buyer credit. Pause không khóa revoke/withdrawAvailable/reclaim; không có admin arbitrary withdrawal/upgrade/sweep liabilities.
- Surface/gate: VAULT T017–T019/T032/T033 (M2); FUJI smoke T090 (M6), WEB T095/T104/T109 (M7). Không hứa vượt qua issuer freeze.

### PAY-05 — Deadline và admission validation

- Nguồn: S02 §3.3, §4, §8.2.
- Chứng minh: deadlines tính từ quoteIssuedAt, không now mỗi retry; now < validUntil < deliveryDeadline <= releaseNotBefore < resolveBy và duration caps. Chặn expired/revoked/epoch mismatch/sai signer/asset/fee/buyer/provider/available/caps trước mutation; mỗi custom error liên quan có negative test, không gom thành insufficient funds. Xác minh tại sát/trùng mốc thời gian; reviewSeconds=0 chỉ theo policy đã cho phép.
- Surface/gate: UNIT T011/T013/T016 (M1); VAULT T018/T023/T026 (M2); HTTP T052/T055 (M4).

### PAY-06 — Một invocation chỉ có một hold

- Nguồn: S02 §4, §8.2, §9; S01 §2, §5.2.
- Chứng minh: reserve atomic available → held + gross counters + consume invocationKey + một HoldReserved; revert không mutation nửa chừng. Cùng digest trả hold cũ không trừ/emit lại; khác quote/grant/digest cùng invocation conflict. Hai submit đồng thời hoặc retry sau cache TTL/expiry/revoke vẫn chỉ một debit; existing hold được lookup trước admission checks mới.
- Surface/gate: VAULT T024/T025/T026/T033 (M2); DB/HTTP/FLOW T050/T057/T060/T064 (M4), T088 (M6); WEB/MCP T109/T118/T121 (M7/M8).

### PAY-07 — HTTP payment envelopes và pre-settlement gates

- Nguồn: S02 §5, §6.1–6.2; S01 §5.2.
- Chứng minh: headers base64 UTF-8 JSON, canonical decimal strings cho EVM integers, accepted/resource/body.quoteId khớp persisted requirements. Chặn oversized/malformed headers, altered economics/hash/domain, dynamicExtraFields bypass và SDK sentinel trên wire. Auth/schema/ownership sai dừng trước settle; requirements không rolling expiry. Client chặn redirect/cross-origin; auth 401/403 không ký tiền. Upfront settle đủ validation dù không verify; không gắn stock onRequest middleware trùng route hoặc dựa vào hook exception bị nuốt.
- Surface/gate: UNIT T016 (M1); HTTP/FLOW T054/T055/T060/T064 (M4). Negative tests đếm signer/settle calls bằng 0.

### PAY-08 — Facilitator, signer isolation và durable journal

- Nguồn: S02 §6.3, §9.
- Chứng minh: /supported đúng deployment; /verify read-only, không nonce/debit. /settle tự kiểm tra đầy đủ, service auth và relay whitelist function/network/vault, gas/fee/rate/AVAX budget hữu hạn. Durable operation CAS theo invocation; signed bytes/hash được persist trước send, một nonce slot lưu nhiều replacement hashes. API process không có relay key, worker chết sau ký phục hồi chính tx, không tạo nonce chỉ vì retry.
- Surface/gate: HTTP/DB/FLOW T055/T056/T057/T063/T064 (M4); OPS T086/T088/T089 (M6).

### PAY-09 — Finality trước HELD và một logical ready event

- Nguồn: S02 §7; S01 §6.1–6.3.
- Chứng minh: chỉ receipt success + canonical finalized evidence đúng chain/vault/buyer/digest/gross/provider mở gate; tx hash/mempool/accepted event hoặc sai blockHash không đủ. Một SQL transaction HELD + unique outbox; không provider call trước commit. Chain held/DB thiếu phục hồi transition/event đúng một lần; mất snapshot cách ly/refund, không dựng job từ hash. Không tuyên bố chain+DB atomic.
- Surface/gate: FLOW T058/T059/T062/T063/T064 (M4), T065/T079 (M5), T088/T091/T092 (M6).

### PAY-10 — Pending, receipts, indexer và fault recovery

- Nguồn: S02 §5.3, §6.3, §9.
- Chứng minh: pending402/timeout/HTTP500 sau hold giữ receipt/UNKNOWN và identity cũ; SDK retry settle reconcile, không broadcast lại. Read receipt sau grant/quote expired/revoked không charge. Indexer restart/backfill/reindex không cộng trừ hai lần; replacement/revert/orphan operations có trạng thái xác định; provider offline sau hold không mất job hoặc thu thêm. WebSocket chỉ wakeup, không nguồn sự thật.
- Surface/gate: DB/FLOW T060–T064 (M4), T077/T078 (M5), crash matrix SYS-01/T088 và FUJI T091 (M6).

### PAY-11 — Financial decisions và separation of duties

- Nguồn: S02 §8.1, §8.3.
- Chứng minh: EIP-712 ResolutionDecision đúng field order/domain; executor không tự duyệt, refund/release kết hợp cần đủ hai roles. Sai role/signature/expectedVersion/expiry, replay decisionId hoặc no-effect decision không thay tiền. Provider report không trực tiếp tạo payout/refund; finance worker chỉ quyết định theo policy tự động S02 §8.5 với approver và executor là hai khóa khác nhau.
- Surface/gate: VAULT T027/T028/T030/T033 (M2); HTTP/DB/FLOW T080/T081/T088 (M6), WEB T107/T109 (M7).

### PAY-12 — Refund, net fee và terminal release

- Nguồn: S02 §8.3–8.4, §9–10.
- Chứng minh: partial/full refund về đúng buyer available, không vượt remaining và không reset grant allowance. Nhiều partial refunds rồi release tính floor(net * feeBps / 10000), provider nhận phần net còn lại; remaining=0 đóng hold. Không release/refund lại sau terminal, không dùng buyer khác bù late refund; không ghi income trước release.
- Surface/gate: VAULT T028/T029/T033 (M2); FLOW T081/T084/T085/T088 (M6).

### PAY-13 — Actual delivery/review quyết định eligibility

- Nguồn: S02 §3.3, §8.3; S01 §5.3–5.4.
- Chứng minh: earliest release là max(signed releaseNotBefore, actualDeliveredAt + reviewSeconds + outage được xác nhận). Buyer accept/provider timestamp không payout sớm; file access outage được tính bằng evidence. Không đủ review trước resolveBy thì hoàn tiền, không sửa chữ ký/deadline hold. Contract bảo vệ earliest signed deadline, backend bảo vệ actual-delivery eligibility.
- Surface/gate: VAULT T029 (M2); storage/FLOW T074 (M5), finance T082/T092 (M6); WEB T103/T109 (M7).

### PAY-14 — Policy tự động, reclaim và deadline race

- Nguồn: S02 §8.3, §8.5; S01 §5.3.
- Chứng minh: provider `FAILED`, quá hạn giao hoặc giao trễ thì refund toàn bộ; giao đúng hạn với evidence đạt `minEvidence` thì release sau review window; mỗi hold tối đa một decision đang xử lý. Tại now >= resolveBy chỉ reclaim remaining về buyer, applyDecision bị chặn; reclaim hoạt động khi paused, không reopen terminal hoặc lấy tiền hold khác.
- Surface/gate: VAULT T030/T031/T033 (M2); HTTP/FLOW T083/T084/T088 (M6); WEB T104/T109 (M7).

### PAY-15 — Conservation và reconciliation

- Nguồn: S02 §8.4, §9.
- Chứng minh qua random action sequences: tokenBalance >= tổng available + heldRemaining + provider/platform claimable; từng hold gross = refunded + remaining + providerReleased + feeReleased. Spent gross không giảm khi refund; released chỉ tăng đúng eligibility; donation không insolvency/credit mới. Projection mismatch dừng admission/cảnh báo, không sửa DB thành nguồn tiền độc lập.
- Surface/gate: VAULT invariant/fuzz T033/T034 (M2); indexer/accounting FLOW T062/T085/T088 (M4/M6); FUJI T090/T091 (M6).

### PAY-16 — Fuji bằng chứng thực

- Nguồn: S02 §10, §1; S01 §8.
- Chứng minh: policy/roles/keys được duyệt, publish manifest/source/ABI/token/code; deposit → grant → hold → refund/release/reclaim → withdraw bằng USDC testnet. Headless app có provider protocol thật; RPC failure/lost response không double debit/dispatch. Lưu tx hashes, finalized state và balance deltas, không fake settled flag/admin bypass.
- Surface/gate: FUJI T089–T092 (M6), WEB T109 (M7), MCP T121 (M8). Local Counter tests không đáp ứng mục này.

## 3. S03 — MCP local và quyền chi

### MCP-01 — Protocol revision, stdio và tool list

- Nguồn: S03 §1.1, §2.1–2.2, §3.1, §7.
- Chứng minh: package/version/integrity được kiểm tra tại triển khai, protocol baseline của S03 được host/Inspector hỗ trợ; discovery/per-request metadata và tools/list/call đúng revision. Legacy host reject rõ hoặc adapter có tests riêng; không tự đổi spec để làm smoke xanh. Tool list cố định/sort deterministic, listChanged=false, không dynamic tools từ command, không quảng cáo prompts/resources/Tasks chưa hỗ trợ. Stdout chỉ JSON-RPC từng dòng, log stderr; không mở local HTTP callback.
- Surface/gate: MCP subprocess T110 (M8); host integration T120/T121. Nếu artifact/revision thực không khớp S03, ghi blocker và quyết định sửa spec riêng, không suy diễn từ code mẫu.

### MCP-02 — API duy nhất, schemas và output/error contract

- Nguồn: S03 §6.1, §7, §11.
- Chứng minh: 11 tools map đúng buyer routes/method/query/header; query→q và productVersion→version, không /mcp/run/provider direct call. Outer schema chặn property lạ/ID rỗng/digest sai; command/question schemas lấy từ API không caller, không remote refs. Success/error validate outputSchema, structuredContent/text tương ứng; protocol error khác business isError. Truncation có metadata, artifact không tự fetch/render HTML/image hoặc lộ signed URL/stack/secret. Annotations không cấp quyền.
- Surface/gate: MCP T113/T114/T116/T117/T119 (M8); host T120 và acceptance T121.

### MCP-03 — Token, scope và ownership isolation

- Nguồn: S03 §2.1, §4.1, §5.4, §6.3.
- Chứng minh: token scoped buyer/client/workspace/expiry/revocation kiểm tra mỗi request; context prepare cần workspace:read; invocation:prepare không tạo workspace tùy ý. Chặn ID đoán được, scope provider/operator/wildcard, payment signature thay API auth. Read-only profile không có key/submit/continue; API token không nâng grant, token revoke/grant revoke độc lập và không giả refund race đã HELD.
- Surface/gate: HTTP/DB T046/T049 (M3); WEB T108/T109 (M7); MCP T112/T113/T116/T121 (M8).

### MCP-04 — Pairing ngoài model và single-use exchange

- Nguồn: S03 §5.1–5.2, §5.4.
- Chứng minh: user chạy CLI, verifier CSPRNG/S256, lookup cần web auth; brute force/code sai/hết hạn/poll quá nhanh bị chặn. Approval POST+CSRF/same-origin/clickjacking controls; scopes/workspaces subset và owner từ cookie. GET không approve, empty requested workspace không là wildcard; không sửa signer/challenge sau approval. Verifier B không đổi pairing A; concurrent exchange chỉ phát một token, lost response phải pairing lại, không replay secret. Pending/rejected/expired/consumed đúng semantics, không refresh token hoặc token qua browser URL/MCP/log.
- Surface/gate: HTTP/DB T047/T048/T049 (M3); WEB T108/T109 (M7); MCP CLI T112/T120/T121 (M8).

### MCP-05 — Trusted profile/keychain và custody

- Nguồn: S03 §3.1, §5.3, §8.
- Chứng minh: spend key/token giữ OS keychain local, profile/journal chỉ refs/IDs/hashes; không secure storage thì paid mode off, không plaintext fallback. Tool args không đổi origin/profile/token/key/chain/vault/calldata/RPC; URL nghiệp vụ chỉ chuyển như data, không fetch. Read-only không tạo spend key, browser spend key riêng in-memory không lên API/localStorage. Logout không báo đã revoke onchain khi chưa tx.
- Surface/gate: WEB T096/T109 (M7); MCP fake-storage/signer tests T111/T112/T119 (M8), OPS log checks SYS-02; real keychain smoke T120.

### MCP-06 — Prepare không trả phí, snapshots không đổi

- Nguồn: S03 §6.2–6.3, §9.
- Chứng minh: create_thread/prepare persist reserved IDs/digest, không signer/settle/dispatch. Không ngầm upload filesystem/host chat/toàn workspace, tool không chọn messages. Mất prepare response retry same key/body cùng quote; khác payload conflict, quote expired không auto-requote. Đổi version/context sau chuẩn bị không tự ký snapshot mới.
- Surface/gate: MCP T114/T119 (M8), API-07/API-08 ở M4; integrated T120/T121.

### MCP-07 — Consent ngoài model và policy gate

- Nguồn: S03 §4.2, §8, §12.
- Chứng minh: trusted CLI/TTY hiển thị đầy đủ quote/input/context/phí/expiry/caps/balance rồi approval bind owner/clientAuthorization/profile/quote/invocation/digest/spendPolicyHash/expiry. Thiếu balance/TTY/approval/standing policy hoặc approval quá quote expiry không ký. Model “yes”, confirmed:true, digest đúng, annotation hay provider injection không tạo consent/nới cap/đổi endpoint/gửi secret/mua thêm. Retry cùng invocation dùng consent cũ; invocation mới cần consent mới.
- Surface/gate: MCP deterministic policy/signer-spy/TTY harness T115/T119 (M8); full acceptance T121. Mỗi gate thiếu/sai có test riêng với signer calls=0.

### MCP-08 — Submit x402 và mismatch trước ký

- Nguồn: S03 §1, §6.3, §8.
- Chứng minh: giao của scope/owner/workspace/policy/grant/balance/approval cho phép submit đúng quote; key dẫn xuất invocationId, không JSON-RPC ID/model key. Challenge khớp scheme/network/asset/vault/buyer/provider/amount/fee/deadlines/digest; 401/403/mismatch dừng trước ký, không fallback exact/tự nạp/approve/increase cap. 202 HELD trả job handle, không coi vừa ký là provider đã chạy; timeout trả SUBMISSION_UNKNOWN với reserved ID.
- Surface/gate: MCP T116/T119 (M8), API/chain FLOW PAY-06/PAY-07 (M4); FUJI T121.

### MCP-09 — Atomic local budget và durable retry

- Nguồn: S03 §4.2, §9.
- Chứng minh: hai process cùng profile reserve atomic theo invocation, không vượt cap; crash/timeout/404 chưa rõ giữ reservation. HELD chuyển reservation thành spent gross, refund không reset local allowance; chỉ terminal admission failure có bằng chứng không hold mới giải phóng. Journal trước send không plaintext key/signature; restart JSON-RPC ID mới dùng business key cũ, read/reconcile trước, không tự quote/nonce/mua mới. 429/5xx retry bounded/Retry-After/backoff giữ key/body; 403 không xin quyền rộng hơn.
- Surface/gate: MCP multiprocess/failpoint T118/T119 (M8); integrated T120/T121, backend độc lập PAY-06/PAY-10.

### MCP-10 — Async, continuation và transport cancellation

- Nguồn: S03 §7, §10–11.
- Chứng minh: submit trả sau 202 không đợi provider, poll khi host không slash/notifications/scheduler. Answer/revise/read không signer/settle; stale question/out-of-scope trả adapter errors đúng mapping, không mua mới. Cancel cooperative khác refund; EOF/tool timeout/JSON-RPC cancellation không tự gọi cancellation API hoặc rollback hold. Restart đọc lại cùng invocation; result chưa ready chỉ poll. Agent/tool đều hoàn tất qua cùng static tools.
- Surface/gate: MCP T117/T119/T120 (M8); FUJI/web parity T121 với T109/T091.

## 4. Kiểm thử xuyên lớp và bằng chứng gate

### SYS-01 — Crash matrix có số đếm quan sát được

- Nguồn: S02 §9–10; S01 §6–7; S03 §9–10.
- Failpoints: trước/sau sign, persist signed tx, broadcast, receipt/finality, DB HELD+outbox commit, SSE send, provider dedupe/ACK, external side effect, report/result, financial decision và local reservation/job-handle response.
- Với mỗi failpoint: kill đúng process, restart không browser, retry/reconcile cùng identity. Assert hold/debit/counters không tăng hai lần, unique logical ready/outbox, replay giữ event IDs, side effect dedupe khi downstream hỗ trợ hoặc UNKNOWN khi không thể biết; decision không áp hai lần. Không chỉ assert HTTP 200 hoặc tổng tests pass.
- Surface/gate: FLOW T063/T064 (M4), T075/T078/T079 (M5), full finance T088/T092 (M6); MCP T118/T121 (M8). External effects không có idempotency không được hứa exactly-once.

### SYS-02 — Security, redaction và budgets

- Nguồn: S01 §2–3, §5.4, §8; S02 §6, §8; S03 §5, §8, §12.
- Chứng minh: capture logs/errors/stdout/stderr/telemetry/storage với synthetic secrets/input canaries, không lộ key/token/signature/signed URL hoặc prompt/context mặc định. Owner/app/scope tests đổi mọi ID liên quan; header/body/schema/page/queue/egress/rate/gas caps và backpressure fail có giới hạn. Provider injection là data, không policy; file không thực thi script.
- Surface/gate: HTTP/OPS T003/T035/T040/T046/T055/T073/T077/T086; WEB T103/T108/T109; MCP T111/T119; security review T122 (M9). Review nội bộ không gọi là audit độc lập.

### SYS-03 — DB isolation, restore và deployment compatibility

- Nguồn: S02 §6.3, §7, §9; S01 §7–8; S03 §9, §12.
- Chứng minh: migrate từ DB test rỗng, chạy suite hai lần độc lập; reset không thể trúng DB dùng chung/deployment do nhầm URL. Với Neon cần branch/database test riêng, credentials không vào repo/log và chốt lifecycle trước thao tác ghi. Restore DB mới gồm nonce journal/dedupe/outbox/cursor rồi reconcile chain không charge/dispatch lại. ABI/OpenAPI/schemas/version drift, thiếu policy/secret/worker role chặn boot; rollback app không tự rollback chain.
- Surface/gate: DB/OPS T007/T008 (M0), T036/T050 (M3/M4), T087/T092 (M6), T123/T125–T127 (M9). Không phụ thuộc bắt buộc Docker; nhận URL không tự chứng minh isolation.

### SYS-04 — Gates end-to-end và phát hành

- Nguồn: S01 §9, S02 §10, S03 §14, S04 §5; roadmap gates M0–M9.
- Surface/gate: VAULT/HTTP/FLOW/FUJI/WEB/MCP/OPS; bằng chứng nối tiếp T034 contract local → T049 auth/catalog/thread → T064 headless hold → T079 app/files/question/revision → T092 finance/recovery/Fuji backend-ready → T109 browser → T121 MCP → T129/T130 release.
- Load/soak T124 đo nonce queue/DB claims/SSE slow consumers/reconnect/gas cost, có limits đã đo; không hứa throughput chưa thử. T127 staging fresh với DB/ví/provider đúng quyền; T128 demo có hướng dẫn retry/refund; T129 không mở admission nếu thiếu policy/gate, T130 artifacts/version/docs truy về evidence. CI T123 chạy đúng suites theo lớp, không bỏ flaky tests hoặc mock settle để xanh.
- Mỗi gate lưu commit/deployment manifest, lệnh/env profile không secret, test counts/results và failure evidence; Fuji thêm receipt/finalized reads/tx hashes/balance deltas. Không đánh dấu pass bằng tài liệu, fixture hash-only hoặc Counter sample.

## 5. Đối chiếu acceptance lists của đặc tả

Các chỉ mục dưới đây truy ngược tới mục ở trên để tránh bỏ sót acceptance bắt buộc; assertions chi tiết vẫn lấy từ đặc tả, không thay bằng tên feature.

### S01 §9 — 11 ca theo số gốc

1. API-01, API-02.
2. API-01, API-06, API-07.
3. API-02.
4. API-05, API-06, PAY-02.
5. PAY-06, PAY-09, API-09, API-10, API-11.
6. API-09, SYS-01.
7. API-01, API-05, API-09, API-12, SYS-02.
8. API-11.
9. API-02, API-10.
10. API-11, PAY-14.
11. API-13, API-10, PAY-06.

### S04 §5 — AG-UI/OpenUI streaming

1. API-13, API-09 (buyer `ACTIVITY_SNAPSHOT openui-surface` với `content.source` tích lũy).
2. API-13, API-11, SYS-01.
3. API-13, API-10, PAY-06.
4. API-13, API-05, SYS-02.
5. API-13, API-02, API-12.

### S02 §10 — vectors/mutations và 8 ca theo số gốc

- Golden vectors và mutation từng signed field/domain: PAY-02, PAY-05, PAY-07.
- Ca 1: PAY-03, PAY-04, PAY-06.
- Ca 2: PAY-03, PAY-12.
- Ca 3: PAY-12, PAY-15.
- Ca 4: PAY-11.
- Ca 5: PAY-14.
- Ca 6: PAY-07, PAY-10.
- Ca 7: PAY-09, PAY-10, SYS-01.
- Ca 8: PAY-16, SYS-04.

### S03 §14 — thứ tự bullet trong từng nhóm gốc

- Protocol/UI 1–4: lần lượt MCP-01; MCP-01/SYS-02; MCP-01/MCP-02; API-02/MCP-10.
- Auth/pairing/isolation 1–6: lần lượt MCP-04; MCP-04; API-04/MCP-03/MCP-08; MCP-03/PAY-03; MCP-03/API-12; MCP-05.
- Payment/injection 1–5: lần lượt MCP-06/MCP-07/MCP-10; MCP-07/PAY-02; MCP-08; MCP-03/MCP-08/PAY-03; MCP-05/MCP-07/SYS-02.
- Idempotency/async 1–7: lần lượt API-01/MCP-06; PAY-06/MCP-09; MCP-09/SYS-01; MCP-09; MCP-10; API-11/MCP-10; MCP-02/MCP-09.

## 6. Ranh giới và điều kiện đóng T002

- Các yêu cầu được ánh xạ theo lớp, ca hợp lệ/negative và task/milestone; ba bất biến tối thiểu một app/thread, một hold/invocation và mọi app dùng cùng chat shell có kiểm tra riêng ở API-01/PAY-06/API-02.
- Không viết tests hoặc thay implementation trong task này; “mapping hoàn tất” không phải “coverage/tests đã đạt”. TDD/red-green áp dụng ở task triển khai phù hợp, không xây trước toàn bộ test harness.
- Remote MCP paid submit/OAuth server/delegated signer, mainnet/multi-chain/arbitrary token, contract-wallet/counterfactual support chưa có tests, Tasks/prompts mới và exactly-once external side effects không được mở rộng vào MVP để làm mapping đầy đủ giả.
- Không cần URL Neon cho T002; DB suites bị chặn thực thi cho tới khi có môi trường test cô lập. Policy kinh tế/keys/roles thực cần phê duyệt T089; fixture policy ngắn chỉ cho local tests.
- Nếu implementation/artifact khác spec, ghi blocker/change decision trước khi đổi assertion; không tự nới test để pass. Sau này thêm requirement phải thêm ID mapping và task chịu trách nhiệm tương ứng.
