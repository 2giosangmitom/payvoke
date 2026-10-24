# S04 · Streaming chat AG-UI và widget A2UI

**Quyết định kiến trúc: 23/10/2026 — đã có lõi, continuation/revision và renderer; còn các hạng mục nghiệm thu ngoài test tự động.** Áp dụng **AG-UI** cho stream sự kiện agent đến UI buyer và **A2UI v0.9.1** cho giao diện khai báo bằng JSON. Không tích hợp MCP Apps hoặc cho provider chạy JavaScript/HTML tùy ý trong frontend. Đặc tả này bổ sung [S01](01-api-and-provider-protocol.md), không thay đổi [S02](02-x402-and-vault.md) hay [S03](03-mcp-client.md).

Đã có mã backend cho buyer thread, provider SSE ready/ACK/report, NDJSON stream ghi theo batch với sequence và cursor, buyer SSE/snapshot, allowlist A2UI, kiểm chứng structured JSON từ host và bằng chứng `DELIVERED`. Một invocation có nhiều run: question/answer và revision trong phạm vi policy tạo run mới nhưng tái sử dụng invocation/hold; `streamSequence` và cursor được kiểm tra theo run. Frontend có một chat shell dùng `@assistant-ui/react` cho mọi app, nối lại SSE bằng snapshot + cursor, renderer catalog A2UI theo cây component, form `QuestionForm` gửi answer không charge, revision cho kết quả đã giao, card quote và chữ ký thanh toán. Command không có tham số vị trí mở form options trong cùng thread. Test tích hợp chạy với PostgreSQL giả lập qua PGlite và HTTP/SSE thật trên loopback. Các endpoint buyer dùng `/v1/threads/{threadId}`; event provider dùng `threadId` và input snapshot tương thích quote document. **Đây là phạm vi đã triển khai**, không đồng nghĩa toàn bộ S01–S04 đã đạt nghiệm thu.

## 1. Luồng end-to-end

```text
Buyer chat composer ──> prepare quote ──> x402 submit ──> finalized hold
                                                         │
Payvoke outbox ── durable SSE invocation.ready/runId ──> Provider worker
                   <── ACK (dedupe trước khi ACK) ────────┤
                   <── started/progress/question/result ─┤  HTTP reports S01
                   <── AG-UI text chunks + A2UI messages ┘  streamed NDJSON
                          │
                  auth + validate + persist + cursor
                          │
                buyer AG-UI SSE + A2UI renderer
                          │
                  result → VERIFYING → DELIVERED
                          └── x402 finance theo S02
```

- **Provider delivery** giữ `GET /v1/provider/apps/{appId}/events`, outbox, lease, `Last-Event-ID`, ACK và idempotent reports của S01. Giao thức AG-UI không thay thế hàng đợi công việc bền vững hoặc cơ chế thanh toán.
- **Streaming là yêu cầu bắt buộc cho trải nghiệm chat**: khi provider tạo text dần, buyer thấy từng chunk trước khi có `result`. Mọi app có thể gửi progress/widget trên cùng thread; command không có tham số vị trí dùng form options, nhưng vẫn nằm trong thread chat chung.
- **S01 reports quyết định trạng thái nghiệp vụ**. Provider dùng AG-UI để gửi nội dung hiển thị; `RUN_FINISHED`, `TEXT_MESSAGE_END`, `CUSTOM`, `ACTIVITY_SNAPSHOT` hay A2UI event không tự tạo `result`, `DELIVERED` hoặc tác động lên payment. Result cuối vẫn phải được M05 kiểm chứng.

## 2. Giao thức stream và API mới (lõi đã có)

| Endpoint                                                                      | Bên gọi                                  | Hợp đồng                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/provider/apps/{appId}/invocations/{id}/ag-ui/streams/{runId}`       | Provider key `reports:write`             | Request body là **chunked NDJSON** (`application/x-ndjson`); từng dòng `{streamSequence,event}`. Hỗ trợ kết nối dài, flush từng batch; không phải một POST trên mỗi token. |
| `GET /v1/provider/apps/{appId}/invocations/{id}/ag-ui/streams/{runId}/cursor` | Provider key `reports:write`             | Trả `{runId,lastCommittedSequence}` để nối lại sau timeout/crash; không đòi stream cũ còn mở.                                                                              |
| `GET /v1/threads/{threadId}/ag-ui/events`                                     | Buyer owner/authorized `invocation:read` | **SSE đọc sự kiện AG-UI**: `id` cursor của thread, `event: ag-ui`, `data` là một JSON `BaseEvent` AG-UI; nhận `Last-Event-ID` hoặc tham số `after` cho bootstrap.          |
| `GET /v1/threads/{threadId}/ag-ui/snapshot`                                   | Buyer owner/authorized `invocation:read` | `{cursor,messages,surfaces,invocationStatus}` tại một mốc nhất quán; `surfaces` chứa A2UI surface/data model đã chuẩn hóa để render lại.                                   |

**Đối chiếu với đặc tả mục tiêu:** gateway ghi theo batch ngắn thay vì một transaction cho mỗi token; đã có multi-run question/answer/revision; và trả `CURSOR_EXPIRED` theo `AGUI_CURSOR_RETENTION_SECONDS` (mặc định 604800). **Còn thiếu:** lease/fencing writer độc lập ở tầng kết nối — hai POST cùng run được tuần tự hóa bằng kiểm tra `streamSequence`/state trong transaction, nên một writer cũ chỉ bị chặn khi sequence hoặc state đã lệch; đủ cho một provider process nhưng chưa chứng minh chống split-brain khi hai process cùng app stream song song. Client và backend dùng cursor cho replay, nhưng load/soak và browser reconnect E2E chưa được nghiệm thu. JSON result không có file đã được verifier kiểm tra schema; file artifacts vẫn cần một verifier riêng và hiện trả `FILES_NOT_SUPPORTED` ở ingress.

**Ranh giới tương thích:** endpoint SSE buyer phát **đúng định dạng event AG-UI** và có thể dùng AG-UI event parser/renderer qua adapter. Nó là một subscription **GET chỉ đọc**, không phải endpoint `HttpAgent` `POST RunAgentInput`; UI phải tạo paid invocation bằng quote/x402 theo S01 trước. Không để client tự gửi `RunAgentInput` để bypass báo giá. Nếu cần `HttpAgent` drop-in sau này, viết adapter vẫn giữ paid admission bên ngoài.

`runId` do Payvoke cấp và có trong mỗi `invocation.ready`, `invocation.answer`, `invocation.revision_requested`. Nó ổn định khi replay **cùng event giao việc**, nhưng đổi khi tạo chu kỳ chạy mới sau question/answer hoặc revision. `threadId` là định danh hội thoại; `invocationId` liên kết run với quote/hold; một invocation có thể có nhiều run. `messageId`/`surfaceId` chỉ có hiệu lực trong scope thread + run, gateway chuẩn hóa/namespace để tránh đụng ID. Quote document vẫn dùng field dây cũ `sessionId = threadId` để tương thích. Provider chỉ được stream khi run thuộc app và invocation đang `RUNNING` (sau ACK và `started`).

`streamSequence` là số nguyên dương tăng từng run, **độc lập** với `ProviderReport.sequence`. Gateway kiểm tra thứ tự, auth app/run và hash payload trước khi ghi bền vững; cùng sequence/cùng payload trả kết quả idempotent, cùng sequence/khác payload trả 409, lỗ sequence trả 409. Sau mất kết nối provider đọc cursor và chỉ resend từ `lastCommittedSequence + 1`; replay đã commit an toàn. Mỗi run chỉ có một writer active; reconnect phải fence writer cũ. Dòng sai schema/role, quá quota hoặc sai state bị từ chối và đóng stream; cursor cho biết chính xác prefix đã ghi. Chỉ broadcast tới buyer **sau commit**. Các chunk được gộp trong batch ngắn có giới hạn để tránh một transaction/record cho mỗi token; phải flush khi hết message hoặc đóng run.

Trên buyer SSE, `id` là cursor bền vững theo thread **khác** `streamSequence`; replay bằng `Last-Event-ID`/`after` không nhân đôi text. Khi quá retention, trả 409 `CURSOR_EXPIRED` trước khi mở stream; client lấy snapshot kèm cursor rồi subscribe `after=cursor`. Snapshot và cursor phải xuất phát từ cùng mốc DB để không mất chunk giữa load/reconnect. Trên UI, append `delta` **chính xác một lần** theo cursor và `messageId`; mất mạng hiển thị trạng thái đang nối lại, không gửi lại paid invocation. Set heartbeat, bounded buffer, rate/bytes/node caps và slow-consumer disconnect tại gateway.

## 3. Ánh xạ AG-UI và lifecycle

| Trigger/nguồn                            | Event AG-UI gửi buyer                                                                                                                                                                                      | Bất biến                                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Nhận report `started` hợp lệ             | `RUN_STARTED {threadId,runId}`                                                                                                                                                                             | Chỉ emit một lần cho mỗi run; có thể replay qua SSE.                                                                                  |
| Provider bắt đầu/chia text               | `TEXT_MESSAGE_START {messageId,role:"assistant"}` → `TEXT_MESSAGE_CONTENT {messageId,delta}` → `TEXT_MESSAGE_END {messageId}`                                                                              | Deltas nối theo thứ tự, không sinh tin trùng sau refresh. Chỉ công khai `assistant`; không phát `system/developer` hay raw reasoning. |
| Report `progress`                        | `ACTIVITY_SNAPSHOT {messageId,activityType:"payvoke.progress",content:{message,percent?}}`                                                                                                                 | Thông báo tiến độ là UI, không phải delivery.                                                                                         |
| Widget A2UI trong stream                 | Gateway nhận provider `CUSTOM {name:"payvoke.a2ui",value:<A2UI envelope>}`, chuẩn hóa thành buyer `ACTIVITY_SNAPSHOT {messageId,activityType:"a2ui-surface",content:{a2ui_operations:[...]},replace:true}` | Parser A2UI chỉ nhận version/catalog/component được Payvoke đăng ký; buyer thấy activity theo dạng `@ag-ui/a2ui-middleware` phát ra.  |
| Report `question` → `WAITING_BUYER`      | `CUSTOM {name:"payvoke.question",value:{questionId,...}}` và kết thúc run bằng `RUN_FINISHED`                                                                                                              | Buyer gửi answer qua `/answers`; run mới cho continuation. UI đánh dấu _chờ buyer_, không đánh dấu delivered.                         |
| Report `result` → `VERIFYING`            | `RUN_FINISHED {threadId,runId}` sau khi flush text cuối; trạng thái `VERIFYING` lấy từ API/status projection                                                                                               | Run phát xong nội dung kỹ thuật, **kết quả chưa được xác minh**. M05 quyết định DELIVERED sau đó.                                     |
| Report `failed/unknown/cancelled` hợp lệ | `RUN_ERROR` hoặc `RUN_FINISHED` phù hợp + cập nhật execution status                                                                                                                                        | Không suy ra refund hoặc payout từ run lifecycle.                                                                                     |

Payvoke sinh các lifecycle events từ state machine thay vì tin `RUN_*` do provider tự khai. Provider ingress chỉ nhận whitelist `TEXT_MESSAGE_START/CONTENT/END` với role assistant và `CUSTOM` có `name:"payvoke.a2ui"`; các event khác dùng S01 reports để hệ thống phát projection. **`CUSTOM payvoke.a2ui` chỉ là định dạng ingress riêng Payvoke, không chuyển nguyên trạng sang buyer.** Mọi event từ provider là dữ liệu chưa tin cậy, kể cả `TOOL_CALL_*`: không cho tùy ý gọi tool, mở quote hay thay quyền chi. Không stream chain-of-thought nội bộ.

Ví dụ hai dòng NDJSON provider gửi trong cùng run:

```jsonl
{"streamSequence":1,"event":{"type":"TEXT_MESSAGE_START","messageId":"answer_1","role":"assistant"}}
{"streamSequence":2,"event":{"type":"TEXT_MESSAGE_CONTENT","messageId":"answer_1","delta":"Đang phân tích dữ liệu..."}}
```

`TEXT_MESSAGE_END` gửi trong chunk tiếp theo. Text đang stream là **bản xem trước**, có thể chưa đạt schema/cần sửa; UI phải thể hiện `VERIFYING` và chỉ coi kết quả giao hàng sau khi API trạng thái ghi `DELIVERED`.

## 4. A2UI trong cùng chat stream

- Pin **A2UI v0.9.1** và catalog Payvoke do frontend/host cung cấp. Catalog ban đầu: `Text`, `Card`, `Table`, `Metric`, `Chart`, `QuestionForm`; mỗi component có JSON Schema props và quyền actions giới hạn. Catalog/schema phải được snapshot theo version để mở lại lịch sử.
- **Provider ingress:** mỗi `CUSTOM payvoke.a2ui` mang **một** envelope A2UI v0.9.1 (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`), ví dụ trong [báo cáo nghiên cứu](../research/ag-ui-a2ui-payvoke.md). Đây là định dạng Payvoke chọn cho phía provider; không phải wire format chung bắt buộc của AG-UI/A2UI.
- **Buyer projection:** gateway áp dụng các envelope hợp lệ vào một surface state bền vững, sau mỗi thay đổi chiếu `ACTIVITY_SNAPSHOT` có `activityType:"a2ui-surface"`, `content:{a2ui_operations:[<các envelope A2UI v0.9.1 tạo được surface hiện tại>]}` và `replace:true`. Cùng một surface dùng `messageId` activity ổn định, namespace theo thread/run/surface, **không dùng chung ID với text**. Snapshot chứa _trạng thái tích lũy có thể dựng lại độc lập_ (createSurface, cấu trúc component hiện tại, data model hiện tại), không chỉ delta vừa nhận. Khi xóa surface, phát thao tác `deleteSurface` hợp lệ rồi loại surface khỏi snapshot khôi phục. Cần thử thực tế với React renderer tương thích `@ag-ui/a2ui-middleware` trước khi đánh dấu nghiệm thu; dùng `@ag-ui/a2ui-middleware` trực tiếp là tùy chọn, không cần mở tool call hoặc quyền thực thi từ provider.
- Ví dụ buyer projection tối giản sau khi đã nhận `createSurface` và `updateDataModel` (catalog và component ID minh họa, cần đăng ký đúng schema trước khi dùng thực tế):

```json
{
  "type": "ACTIVITY_SNAPSHOT",
  "messageId": "a2ui-surface-thread1-run1-result1",
  "activityType": "a2ui-surface",
  "content": {
    "a2ui_operations": [
      {
        "version": "v0.9.1",
        "createSurface": {
          "surfaceId": "result1",
          "catalogId": "https://payvoke.example/catalog/result/v1"
        }
      },
      {
        "version": "v0.9.1",
        "updateComponents": {
          "surfaceId": "result1",
          "components": [{ "id": "root", "component": "Text", "text": { "path": "/summary" } }]
        }
      },
      {
        "version": "v0.9.1",
        "updateDataModel": {
          "surfaceId": "result1",
          "path": "/summary",
          "value": "Đang phân tích..."
        }
      }
    ]
  },
  "replace": true
}
```

- Gateway chỉ nhận `surfaceId` thuộc run và catalog đã đăng ký; validate type, binding, giới hạn node/size/update rate và sanitize props/URL trước persist/render. Browser render **declarative JSON** bằng component có sẵn; không tải JS, thực thi HTML hoặc code do provider gửi.
- Widget tương tác chuyển thành lệnh nghiệp vụ do Payvoke duyệt, ví dụ `submitAnswer(questionId)` → S01 `/answers`, validate owner/schema/current state/CSRF/idempotency. Widget không thể tự mua, gọi URL tùy ý, đổi payment status hoặc phát hành artifact.
- A2UI có thể hiện dần **trong lúc text đang stream**; nếu frontend không hỗ trợ catalog, hiển thị fallback text/typed output. Provider vẫn gửi report `result {artifactVersion,output,files,presentation?}` như S01; `presentation` là `{format:"a2ui",specVersion:"v0.9.1",catalogId,surfaceIds:[]}` tham chiếu các surface của run đã persist/kiểm tra, không thay thế `outputSchema` hay kiểm chứng file.

## 5. Kế hoạch nghiệm thu tối thiểu

1. Fixture provider độc lập nhận `invocation.ready`, ACK, report `started`, stream ít nhất hai text deltas và A2UI surface, report `result`. Browser thấy chữ tăng dần **trước** khi result đến; buyer nhận `ACTIVITY_SNAPSHOT a2ui-surface` có `a2ui_operations` tích lũy và widget cập nhật khi `updateDataModel` đến, không cần reload.
2. Ngắt provider POST giữa chừng; hỏi cursor, resend an toàn; SSE buyer refresh/reconnect/expired cursor không lặp nội dung hay mất widget. Thử question/answer và revision tạo runId mới nhưng cùng invocation/hold theo S01.
3. Trên backend, report `result` chỉ đến VERIFYING; invalid output/file/unknown catalog không được giao. `RUN_FINISHED` không tự DELIVERED, x402 charge hoặc payout.
4. Reject cross-app/cross-owner access, giả `role:system`, AG-UI `TOOL_CALL`, HTML/script trong A2UI, unknown catalog/oversized payload, duplicate sequence khác nội dung, stale run và hành động widget gọi sai `questionId`.
5. Mọi app dùng chung chat composer; command không có positional mở form trong thread; bản không hỗ trợ A2UI vẫn đọc được structured output/file; MCP local vẫn poll/đọc cùng result qua S03.

**Trạng thái nghiệm thu (cập nhật 23/10/2026):** đã có migration, endpoint/renderer, kiểm tra âm tính phân quyền/schema/sequence/replay, test HTTP SSE phát sự kiện sau khi kết nối được mở và kiểm tra `VERIFYING → DELIVERED`. Đã bổ sung và có test cho: question → `WAITING_BUYER` → `/answers` tạo run mới, revision theo `revisionPolicy`/artifactVersion mới, `QuestionForm` chỉ gọi action answer được cấp quyền, snapshot khôi phục questions/answers/revisions, cursor expiry trả `CURSOR_EXPIRED`, ghi stream theo batch và reconnect bằng snapshot ở frontend. **Chưa đạt đủ tiêu chí §5:** browser E2E với ví/Fuji (cần provider fixture ngoài tiến trình + trình duyệt), load/soak slow-consumer, OpenAPI xuất từ schema, file delivery/verifier, và lease/fencing nhiều writer. §5.5 vẫn thiếu phần MCP local đọc cùng result vì MCP chưa triển khai. Checkbox roadmap tương ứng vẫn cần các bằng chứng đó trước khi đánh dấu DONE.

Nguồn: [AG-UI events](https://docs.ag-ui.com/concepts/events), [AG-UI architecture](https://docs.ag-ui.com/concepts/architecture), [A2UI v0.9.1](https://a2ui.org/specification/v0.9.1-a2ui/), [AG-UI + A2UI integration skill](https://github.com/ag-ui-protocol/ag-ui/blob/main/skills/ag-ui-a2ui-integration/SKILL.md), [source middleware](https://github.com/ag-ui-protocol/ag-ui/blob/main/middlewares/a2ui-middleware/src/index.ts).
