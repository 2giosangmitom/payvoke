# S04 · Streaming chat AG-UI và generative UI OpenUI Lang

**Quyết định kiến trúc: 23/10/2026, cập nhật 25/10/2026 — đã có lõi, continuation/revision và renderer; còn các hạng mục nghiệm thu ngoài test tự động.** Áp dụng **AG-UI** cho stream sự kiện agent đến UI buyer và **OpenUI Lang 1.0** (`@openuidev/lang-core`, `@openuidev/react-lang`) cho giao diện khai báo. Ngày 25/10/2026 OpenUI Lang thay thế A2UI v0.9.1: text/lifecycle vẫn là event AG-UI, chỉ phần widget đổi định dạng. Không tích hợp MCP Apps hoặc cho provider chạy JavaScript/HTML tùy ý trong frontend. Đặc tả này bổ sung [S01](01-api-and-provider-protocol.md), không thay đổi [S02](02-x402-and-vault.md) hay [S03](03-mcp-client.md).

Đã có mã backend cho buyer thread, provider SSE ready/ACK/report, NDJSON stream ghi theo batch với sequence và cursor, buyer SSE/snapshot, catalog OpenUI kiểm tra bằng parser chính thức, kiểm chứng structured JSON từ host và bằng chứng `DELIVERED`. Một invocation có nhiều run: question/answer và revision trong phạm vi policy tạo run mới nhưng tái sử dụng invocation/hold; `streamSequence` và cursor được kiểm tra theo run. Frontend có một chat shell dùng `@assistant-ui/react` cho mọi app, nối lại SSE bằng snapshot + cursor, renderer OpenUI Lang (`Renderer` của react-lang) với catalog Payvoke, form `QuestionForm` gửi answer không charge, revision cho kết quả đã giao, card quote và chữ ký thanh toán. Command không có tham số vị trí mở form options trong cùng thread. Test tích hợp chạy với PostgreSQL giả lập qua PGlite và HTTP/SSE thật trên loopback. Event provider dùng `threadId` và input snapshot tương thích quote document. **Đây là phạm vi đã triển khai**, không đồng nghĩa toàn bộ S01–S04 đã đạt nghiệm thu.

## 1. Luồng end-to-end

```text
Buyer chat composer ──> prepare quote ──> x402 submit ──> finalized hold
                                                         │
Payvoke outbox ── durable SSE invocation.ready/runId ──> Provider worker
                   <── ACK (dedupe trước khi ACK) ────────┤
                   <── started/progress/question/result ─┤  HTTP reports S01
                   <── AG-UI text chunks + OpenUI patches ┘ streamed NDJSON
                          │
                  auth + validate + persist + cursor
                          │
                buyer AG-UI SSE + OpenUI renderer
                          │
                  result → VERIFYING → DELIVERED
                          └── x402 finance theo S02
```

- **Provider delivery** giữ SSE provider, outbox, lease, `Last-Event-ID`, ACK và idempotent reports của S01. Giao thức AG-UI không thay thế hàng đợi công việc bền vững hoặc cơ chế thanh toán.
- **Streaming là yêu cầu bắt buộc cho trải nghiệm chat**: khi provider tạo text dần, buyer thấy từng chunk trước khi có `result`. Mọi app có thể gửi progress/widget trên cùng thread; command không có tham số vị trí dùng form options, nhưng vẫn nằm trong thread chat chung.
- **S01 reports quyết định trạng thái nghiệp vụ**. Provider dùng AG-UI để gửi nội dung hiển thị; `RUN_FINISHED`, `TEXT_MESSAGE_END`, `CUSTOM`, `ACTIVITY_SNAPSHOT` hay OpenUI patch không tự tạo `result`, `DELIVERED` hoặc tác động lên payment. Result cuối vẫn phải được M05 kiểm chứng.

## 2. Giao thức stream (lõi đã có)

Route, path và shape request/response cụ thể đọc từ code (`apps/api/src/modules/agui`); phần này chỉ mô tả các kênh và quy tắc.

- **Provider stream theo run:** provider key `reports:write`; request body là **chunked NDJSON** (`application/x-ndjson`), từng dòng `{streamSequence,event}`. Hỗ trợ kết nối dài, flush từng batch; không phải một request trên mỗi token.
- **Cursor của run:** provider key `reports:write`; trả sequence đã commit cuối cùng để nối lại sau timeout/crash, không đòi stream cũ còn mở.
- **Buyer SSE của thread:** buyer owner hoặc client có `invocation:read`; `id` là cursor của thread, `data` là một JSON `BaseEvent` AG-UI; nhận `Last-Event-ID` hoặc cursor bootstrap.
- **Buyer snapshot của thread:** cursor, messages, surfaces và trạng thái invocation tại một mốc nhất quán; `surfaces` chứa chương trình OpenUI Lang đầy đủ của từng surface để render lại.
- **Catalog OpenUI công khai:** system prompt sinh bằng `generateSystemPrompt` và JSON Schema của catalog, để provider đưa vào LLM của mình.

**Đối chiếu với đặc tả mục tiêu:** gateway ghi theo batch ngắn thay vì một transaction cho mỗi token; đã có multi-run question/answer/revision; và trả `CURSOR_EXPIRED` theo `AGUI_CURSOR_RETENTION_SECONDS` (mặc định 604800). **Còn thiếu:** lease/fencing writer độc lập ở tầng kết nối — hai POST cùng run được tuần tự hóa bằng kiểm tra `streamSequence`/state trong transaction, nên một writer cũ chỉ bị chặn khi sequence hoặc state đã lệch; đủ cho một provider process nhưng chưa chứng minh chống split-brain khi hai process cùng app stream song song. Client và backend dùng cursor cho replay, nhưng load/soak và browser reconnect E2E chưa được nghiệm thu. JSON result không có file đã được verifier kiểm tra schema; file artifacts vẫn cần một verifier riêng và hiện trả `FILES_NOT_SUPPORTED` ở ingress.

**Ranh giới tương thích:** SSE buyer phát **đúng định dạng event AG-UI** và có thể dùng AG-UI event parser/renderer qua adapter. Nó là một subscription **chỉ đọc**, không phải endpoint `HttpAgent` `POST RunAgentInput`; UI phải tạo paid invocation bằng quote/x402 theo S01 trước. Không để client tự gửi `RunAgentInput` để bypass báo giá. Nếu cần `HttpAgent` drop-in sau này, viết adapter vẫn giữ paid admission bên ngoài.

`runId` do Payvoke cấp và có trong mỗi `invocation.ready`, `invocation.answer`, `invocation.revision_requested`. Nó ổn định khi replay **cùng event giao việc**, nhưng đổi khi tạo chu kỳ chạy mới sau question/answer hoặc revision. `threadId` là định danh hội thoại; `invocationId` liên kết run với quote/hold; một invocation có thể có nhiều run. `messageId`/`surfaceId` chỉ có hiệu lực trong scope thread + run, gateway chuẩn hóa/namespace để tránh đụng ID. Quote document vẫn dùng field dây cũ `sessionId = threadId` để tương thích. Provider chỉ được stream khi run thuộc app và invocation đang `RUNNING` (sau ACK và `started`).

`streamSequence` là số nguyên dương tăng từng run, **độc lập** với `ProviderReport.sequence`. Gateway kiểm tra thứ tự, auth app/run và hash payload trước khi ghi bền vững; cùng sequence/cùng payload trả kết quả idempotent, cùng sequence/khác payload trả 409, lỗ sequence trả 409. Sau mất kết nối provider đọc cursor và chỉ resend từ `lastCommittedSequence + 1`; replay đã commit an toàn. Mỗi run chỉ có một writer active; reconnect phải fence writer cũ. Dòng sai schema/role, quá quota hoặc sai state bị từ chối và đóng stream; cursor cho biết chính xác prefix đã ghi. Chỉ broadcast tới buyer **sau commit**. Các chunk được gộp trong batch ngắn có giới hạn để tránh một transaction/record cho mỗi token; phải flush khi hết message hoặc đóng run.

Trên buyer SSE, `id` là cursor bền vững theo thread **khác** `streamSequence`; replay bằng `Last-Event-ID`/`after` không nhân đôi text. Khi quá retention, trả 409 `CURSOR_EXPIRED` trước khi mở stream; client lấy snapshot kèm cursor rồi subscribe `after=cursor`. Snapshot và cursor phải xuất phát từ cùng mốc DB để không mất chunk giữa load/reconnect. Trên UI, append `delta` **chính xác một lần** theo cursor và `messageId`; mất mạng hiển thị trạng thái đang nối lại, không gửi lại paid invocation. Set heartbeat, bounded buffer, rate/bytes/node caps và slow-consumer disconnect tại gateway.

## 3. Ánh xạ AG-UI và lifecycle

| Trigger/nguồn                            | Event AG-UI gửi buyer                                                                                                                                                                                                     | Bất biến                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Nhận report `started` hợp lệ             | `RUN_STARTED {threadId,runId}`                                                                                                                                                                                            | Chỉ emit một lần cho mỗi run; có thể replay qua SSE.                                                                                  |
| Provider bắt đầu/chia text               | `TEXT_MESSAGE_START {messageId,role:"assistant"}` → `TEXT_MESSAGE_CONTENT {messageId,delta}` → `TEXT_MESSAGE_END {messageId}`                                                                                             | Deltas nối theo thứ tự, không sinh tin trùng sau refresh. Chỉ công khai `assistant`; không phát `system/developer` hay raw reasoning. |
| Report `progress`                        | `ACTIVITY_SNAPSHOT {messageId,activityType:"payvoke.progress",content:{message,percent?}}`                                                                                                                                | Thông báo tiến độ là UI, không phải delivery.                                                                                         |
| Widget OpenUI trong stream               | Gateway nhận provider `CUSTOM {name:"payvoke.openui",value:{surfaceId,source}}`, chuẩn hóa thành buyer `ACTIVITY_SNAPSHOT {messageId,activityType:"openui-surface",content:{source,invocationId,surfaceId},replace:true}` | Parser lang-core chỉ nhận component trong catalog Payvoke; `source` là chương trình tích lũy đầy đủ, không phải delta.                |
| Report `question` → `WAITING_BUYER`      | `CUSTOM {name:"payvoke.question",value:{questionId,...}}` và kết thúc run bằng `RUN_FINISHED`                                                                                                                             | Buyer gửi answer qua `/answers`; run mới cho continuation. UI đánh dấu _chờ buyer_, không đánh dấu delivered.                         |
| Report `result` → `VERIFYING`            | `RUN_FINISHED {threadId,runId}` sau khi flush text cuối; trạng thái `VERIFYING` lấy từ API/status projection                                                                                                              | Run phát xong nội dung kỹ thuật, **kết quả chưa được xác minh**. M05 quyết định DELIVERED sau đó.                                     |
| Report `failed/unknown/cancelled` hợp lệ | `RUN_ERROR` hoặc `RUN_FINISHED` phù hợp + cập nhật execution status                                                                                                                                                       | Không suy ra refund hoặc payout từ run lifecycle.                                                                                     |

Payvoke sinh các lifecycle events từ state machine thay vì tin `RUN_*` do provider tự khai. Provider ingress chỉ nhận whitelist `TEXT_MESSAGE_START/CONTENT/END` với role assistant và `CUSTOM` có `name:"payvoke.openui"`; các event khác dùng S01 reports để hệ thống phát projection. **`CUSTOM payvoke.openui` chỉ là định dạng ingress riêng Payvoke, không chuyển nguyên trạng sang buyer.** Mọi event từ provider là dữ liệu chưa tin cậy, kể cả `TOOL_CALL_*`: không cho tùy ý gọi tool, mở quote hay thay quyền chi. Không stream chain-of-thought nội bộ.

Ví dụ hai dòng NDJSON provider gửi trong cùng run:

```jsonl
{"streamSequence":1,"event":{"type":"TEXT_MESSAGE_START","messageId":"answer_1","role":"assistant"}}
{"streamSequence":2,"event":{"type":"TEXT_MESSAGE_CONTENT","messageId":"answer_1","delta":"Đang phân tích dữ liệu..."}}
```

`TEXT_MESSAGE_END` gửi trong chunk tiếp theo. Text đang stream là **bản xem trước**, có thể chưa đạt schema/cần sửa; UI phải thể hiện `VERIFYING` và chỉ coi kết quả giao hàng sau khi API trạng thái ghi `DELIVERED`.

## 4. OpenUI Lang trong cùng chat stream

- **Catalog** nằm ở `packages/openui-components` (Zod schema, dùng chung cho backend và frontend): `Stack` (root), `Text`, `Card`, `Metric`, `Table`, `Chart`, `QuestionForm`. Thứ tự field của schema là thứ tự tham số vị trí trong OpenUI Lang. Catalog chỉ để hiển thị: không có prop action/URL, không có `Query()`/`Mutation()`, nên provider không thể gọi tool hay điều hướng buyer.
- **Provider ingress:** mỗi `CUSTOM payvoke.openui` mang `{surfaceId, source}`, trong đó `source` là **một hoặc nhiều statement hoàn chỉnh** (`identifier = Expression`, ≤ 8192 ký tự). Surface là chương trình append-only: statement mới được nối vào, định nghĩa lại một identifier sẽ thay thế nó (định nghĩa sau cùng thắng), nên provider cập nhật widget bằng cách gửi lại statement đó. Children có thể đến trước hoặc sau root; tham chiếu chưa định nghĩa được phép trong lúc stream.
- **Kiểm tra tại gateway** (trong transaction commit, trên toàn bộ chương trình sau khi nối): parser `@openuidev/lang-core` với JSON Schema của catalog; từ chối statement dở dang (`INVALID_OPENUI`), component lạ (`UNKNOWN_OPENUI_COMPONENT`), sai kiểu/thừa tham số/hàm `@` lạ (`INVALID_OPENUI`), `Query`/`Mutation`, markup, `javascript:`, `data:`, URL `http(s)://` và ký tự điều khiển (`UNSAFE_OPENUI_VALUE`), surface quá 64 KiB hoặc 200 statement (`OPENUI_SURFACE_TOO_LARGE`). Patch bị từ chối trả 400 và không tiêu thụ `streamSequence`.
- **Buyer projection:** sau mỗi patch hợp lệ, gateway lưu chương trình vào `openui_surfaces` và phát `ACTIVITY_SNAPSHOT` `activityType:"openui-surface"` với `content.source` là chương trình đầy đủ, `replace:true`, `messageId` ổn định `{runId}-openui-{surfaceId}`, không dùng chung ID với text. Client chỉ cần snapshot mới nhất để dựng lại surface sau reconnect.
- Ví dụ provider stream (mỗi dòng là một event NDJSON):

```jsonl
{"streamSequence":3,"event":{"type":"CUSTOM","name":"payvoke.openui","value":{"surfaceId":"result","source":"root = Stack([summary, score])"}}}
{"streamSequence":4,"event":{"type":"CUSTOM","name":"payvoke.openui","value":{"surfaceId":"result","source":"summary = Text(\"Đang phân tích...\")\nscore = Metric(\"Score\", 90, \"/100\")"}}}
{"streamSequence":5,"event":{"type":"CUSTOM","name":"payvoke.openui","value":{"surfaceId":"result","source":"summary = Text(\"Hoàn tất\", \"heading\")"}}}
```

- Browser render bằng `Renderer` của `@openuidev/react-lang` với renderer cố định của host cho từng component; chuỗi từ provider luôn là text React, không bao giờ là HTML. Không tải JS hay thực thi code do provider gửi.
- `QuestionForm(questionId, title?)` chỉ đặt câu hỏi đang mở vào trong widget; schema câu trả lời lấy từ report `question` của S01, gửi qua luồng trả lời question với kiểm tra owner/schema/state/idempotency. Câu hỏi đã đóng hoặc thuộc invocation khác không hiện nút trả lời.
- Widget có thể hiện dần **trong lúc text đang stream**. Provider vẫn gửi report `result {artifactVersion,output,files,presentation?}` như S01; `presentation` là `{format:"openui-lang",specVersion:"1.0",surfaceIds:[]}` tham chiếu các surface của run đã persist/kiểm tra, không thay thế `outputSchema` hay kiểm chứng file.

## 5. Kế hoạch nghiệm thu tối thiểu

1. Fixture provider độc lập nhận `invocation.ready`, ACK, report `started`, stream ít nhất hai text deltas và một OpenUI surface, report `result`. Browser thấy chữ tăng dần **trước** khi result đến; buyer nhận `ACTIVITY_SNAPSHOT openui-surface` có `source` tích lũy và widget cập nhật khi một statement được định nghĩa lại, không cần reload.
2. Ngắt provider POST giữa chừng; hỏi cursor, resend an toàn; SSE buyer refresh/reconnect/expired cursor không lặp nội dung hay mất widget. Thử question/answer và revision tạo runId mới nhưng cùng invocation/hold theo S01.
3. Trên backend, report `result` chỉ đến VERIFYING; invalid output/file/unknown catalog không được giao. `RUN_FINISHED` không tự DELIVERED, x402 charge hoặc payout.
4. Reject cross-app/cross-owner access, giả `role:system`, AG-UI `TOOL_CALL`, HTML/script/URL hoặc `Query`/`Mutation` trong OpenUI, component ngoài catalog/oversized payload, duplicate sequence khác nội dung, stale run và hành động widget gọi sai `questionId`.
5. Mọi app dùng chung chat composer; command không có positional mở form trong thread; bản không hỗ trợ OpenUI vẫn đọc được structured output/file; MCP local vẫn poll/đọc cùng result qua S03.

**Trạng thái nghiệm thu (cập nhật 23/10/2026):** đã có migration, backend/renderer, kiểm tra âm tính phân quyền/schema/sequence/replay, test HTTP SSE phát sự kiện sau khi kết nối được mở và kiểm tra `VERIFYING → DELIVERED`. Đã bổ sung và có test cho: question → `WAITING_BUYER` → answer tạo run mới, revision theo `revisionPolicy`/artifactVersion mới, `QuestionForm` chỉ gọi action answer được cấp quyền, snapshot khôi phục questions/answers/revisions, cursor expiry trả `CURSOR_EXPIRED`, ghi stream theo batch và reconnect bằng snapshot ở frontend. **Chưa đạt đủ tiêu chí §5:** browser E2E với ví/Fuji (cần provider fixture ngoài tiến trình + trình duyệt), load/soak slow-consumer, OpenAPI xuất từ schema, file delivery/verifier, và lease/fencing nhiều writer. §5.5 vẫn thiếu phần MCP local đọc cùng result vì MCP chưa triển khai. Checkbox roadmap tương ứng vẫn cần các bằng chứng đó trước khi đánh dấu DONE.

Nguồn: [AG-UI events](https://docs.ag-ui.com/concepts/events), [AG-UI architecture](https://docs.ag-ui.com/concepts/architecture), [OpenUI Lang](https://openui.com/docs/openui-lang), [OpenUI Lang specification 1.0](https://openui.com/docs/openui-lang/specification), [@openuidev/lang-core](https://github.com/thesysdev/openui/tree/main/packages/lang-core). Thiết kế A2UI trước đây: [báo cáo nghiên cứu](../research/ag-ui-a2ui-payvoke.md) (lịch sử).
