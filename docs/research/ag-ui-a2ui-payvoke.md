# Đánh giá AG-UI và A2UI cho Provider Gateway / custom widgets của Payvoke

Ngày nghiên cứu: 23/10/2026. **Quyết định đã chốt ngày 23/10/2026:** dùng AG-UI + A2UI, không tích hợp MCP Apps. Hợp đồng triển khai hiện hành ở [S04](../specs/04-ag-ui-a2ui-streaming.md); tài liệu này ghi lại cơ sở nghiên cứu. Chưa triển khai runtime.

## Kết luận

**Đã chọn cả hai chuẩn cho giao diện chat.** AG-UI là giao thức sự kiện để agent tương tác với ứng dụng người dùng, hỗ trợ token streaming; **AG-UI không tự định nghĩa widget có thể render**. A2UI định nghĩa _surface_ UI theo JSON, dữ liệu ràng buộc và catalog component được frontend cho phép. Provider gửi `CUSTOM payvoke.a2ui`; Payvoke chuyển thành buyer `ACTIVITY_SNAPSHOT` loại `a2ui-surface` với `content.a2ui_operations`, theo định dạng do middleware AG-UI/A2UI dùng. [AG-UI overview][agui-overview], [A2UI spec][a2ui-spec], [integration skill][agui-a2ui-skill].

Khuyến nghị:

1. **Giữ protocol giao job/ACK/report trong S01 làm nguồn sự thật** cho provider, payment, execution và recovery; bổ sung kênh chunk AG-UI provider → gateway.
2. **A2UI v0.9.1 là chuẩn widget đã chọn**, đi kèm output JSON/Markdown/file; frontend React render các component trong catalog Payvoke được duyệt.
3. **AG-UI là chuẩn stream chat đã chọn**, dùng cho token, progress, lifecycle và A2UI messages trên buyer SSE. Không để `RUN_FINISHED` hay một UI event tự kích hoạt `DELIVERED`/release.
4. **Không tích hợp MCP Apps, không chạy widget code tùy ý của provider**. Provider có thể tùy biến giao diện bằng catalog A2UI có sẵn hoặc do Payvoke đăng ký.

## 1. Khả năng thực tế của các chuẩn

| Bài toán                                                    | AG-UI                                                                                      | A2UI                                                                                          | Trách nhiệm Payvoke vẫn cần                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Stream chữ, tiến độ, lifecycle, tool call, shared state     | Có event chuẩn `RUN_*`, `TEXT_MESSAGE_*`, `TOOL_CALL_*`, `STATE_*`, `ACTIVITY_*`, `CUSTOM` | Không phải mục tiêu chính                                                                     | Quyền truy cập, persistent timeline, trạng thái nghiệp vụ        |
| Tạo card/form/chart tùy nội dung, cập nhật dần              | Có thể _vận chuyển_ payload UI                                                             | Có `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface` và custom catalogs | Catalog/version, validation, render fallback, bảo vệ actions     |
| Provider kết nối ra Payvoke để nhận job sau khi đã giữ tiền | Không có sẵn giao kèo job/ACK của S01; AG-UI thường dùng client gọi agent và nhận stream   | Không giải quyết                                                                              | Outbox, provider SSE, reconnect, ACK/dedupe, lease, fencing      |
| Kiểm chứng giao hàng và giải ngân                           | Không                                                                                      | Không                                                                                         | `VERIFYING → DELIVERED`, delivery proof, dispute, refund/release |
| Widget React do bên thứ ba tự biên dịch và chạy tùy ý       | Không                                                                                      | Không: chỉ mô tả component được host chấp thuận                                               | Sandbox/plugin security & review nếu muốn triển khai             |

AG-UI có SDK và HTTP agent nhận `RunAgentInput`, phát `BaseEvent`; những sự kiện tương tác với người dùng và state có thể hữu ích cho lớp trải nghiệm. Tuy nhiên HTTP/SSE của AG-UI không cung cấp ngữ nghĩa durable provider delivery `Last-Event-ID` + ACK được S01 yêu cầu. Đây là **nhận định khi đối chiếu hai giao thức**, không phải giới hạn transport SSE nói chung. [AG-UI architecture][agui-architecture], [AG-UI events][agui-events], [S01](../specs/01-api-and-provider-protocol.md).

A2UI là JSON declarative: **code component thực sự vẫn nằm phía renderer**. Host có thể định nghĩa component `Chart`, `MetricCard`, `Timeline`, `ComparisonTable` cùng JSON Schema props; provider chỉ gửi tên component và props hợp lệ. A2UI hỗ trợ React renderer cho v0.9.1; v1.0 hiện là **candidate**, renderer React v1.0 chưa được công bố là stable, nên pin v0.9.1 cho thử nghiệm. [A2UI versions][a2ui-home], [renderer matrix][a2ui-renderers], [custom catalog][a2ui-catalog].

Custom widget trong phạm vi đã chốt nghĩa là **component khai báo bằng A2UI thuộc catalog được Payvoke đăng ký**. Chức năng provider upload code React/JS/HTML và mô hình iframe chạy code đó nằm ngoài phạm vi sản phẩm.

## 2. Fit với Payvoke hiện tại

Mô hình hiện tại được quy định tại [S01](../specs/01-api-and-provider-protocol.md) và [M04](../modules/04-provider-requests-and-gateway.md): provider **chủ động kết nối SSE** `/v1/provider/apps/{appId}/events` bằng API key; Payvoke phát `invocation.ready` **sau khi hold finalized**; provider persist dedupe trước ACK; tiếp đó gửi `started/progress/question/result/...` bằng HTTP report tăng sequence. `result` đi qua `VERIFYING`, kiểm tra output/artifacts rồi mới `DELIVERED`. Web/MCP cùng dùng API/financial state chính thức. Backend đã có settlement outbox `InvocationReady`, nhưng **chưa có provider delivery/ACK/report gateway**.

Không ghép trực tiếp `AG-UI RUN_FINISHED` vào `DELIVERED`: một run có thể hoàn tất kỹ thuật nhưng output chưa hợp lệ, file chưa truy cập được hoặc vẫn đang review. Không đưa AG-UI `TOOL_CALL_*` thành một paid Payvoke command ngoài bước tạo quote và xác nhận chi mới.

Thiết kế đề xuất theo các lớp:

```text
Buyer web / local MCP
   | paid prepare/submit via x402 (Payvoke API)
   v
Payvoke: quote -> finalized vault hold -> InvocationReady outbox
   | durable SSE + ACK/replay (S01, unchanged)
   v
Provider worker (agent or tool, framework tùy chọn)
   | reports + AG-UI chunks + A2UI surfaces
   v
Payvoke: auth + dedupe + schema/state validation + artifact verification
   | durable buyer status/timeline/result
   | mandatory AG-UI projection for chat streaming UX
   v
Buyer UI: native chat/form + A2UI renderer with Payvoke catalog
```

Mapping **AG-UI projection đã chọn** (đây là mapping riêng Payvoke, không phải mapping sẵn có trong chuẩn; hợp đồng cuối ở S04):

| Nguồn Payvoke                  | Projection/UI                                                                                         | Cần giữ riêng                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Session                        | `threadId` trong AG-UI                                                                                | Quyền owner, một product/kind mỗi session                              |
| Một chu kỳ chạy của invocation | `runId` riêng cho chu kỳ; có thể có chu kỳ tiếp tục/sửa trong cùng invocation                         | `invocationId`, quote, hold, version không đổi theo event UI           |
| `started`, `progress`          | `RUN_STARTED`, `ACTIVITY_SNAPSHOT`/`ACTIVITY_DELTA` hoặc `CUSTOM` được khai báo                       | ACK/report sequence và state machine ở DB                              |
| Chunks text                    | `TEXT_MESSAGE_START/CONTENT/END`                                                                      | Chỉ dữ liệu được phép hiển thị; snapshot sau reconnect                 |
| A2UI ingress                   | Provider `CUSTOM payvoke.a2ui` → buyer `ACTIVITY_SNAPSHOT a2ui-surface` có `a2ui_operations` tích lũy | Schema/catalog validation, message/surface ID ổn định, replay/snapshot |
| `question`                     | Form qua A2UI, hành động UI gọi API `/answers`                                                        | `questionId`/owner/schema/continuation miễn phí hợp lệ                 |
| `result`                       | Output schema + A2UI surface được kiểm chứng                                                          | `VERIFYING`, file ownership và thời điểm giao hàng                     |

**Ranh giới AG-UI:** Nếu một invocation có nhiều vòng hỏi đáp hoặc revision, phải định nghĩa rõ một `runId` bắt đầu/kết thúc thế nào; không ép toàn bộ vòng đời thanh toán vào lifecycle `RUN_*`. Buyer reconnect phải lấy trạng thái/timeline bền vững từ Payvoke, không dựa vào bộ nhớ stream hiện tại.

## 3. Đề xuất hợp đồng widget

**Baseline bắt buộc:** provider trả JSON tuân `outputSchema`, frontend hỗ trợ fallback text, key-value, table, file, chart mặc định. AG-UI vẫn là kênh stream chat và A2UI vẫn là chuẩn widget; fallback cần cho khi thiếu catalog hoặc UI không hỗ trợ.

**A2UI declarative đã chọn:** `ProviderReport.result` có trường tùy chọn `presentation` do Payvoke định nghĩa để tham chiếu/snapshot các surface A2UI theo S04. Provider gửi envelope A2UI từng bước qua `CUSTOM payvoke.a2ui`; gateway chiếu hoạt động surface lên `ACTIVITY_SNAPSHOT {activityType:"a2ui-surface",content:{a2ui_operations:[...]},replace:true}` cho buyer. Dữ liệu chính `output` vẫn phải pass `outputSchema`, `presentation` không thay thế artifact/bằng chứng giao hàng. Product version snapshot cho biết catalog/version được chấp nhận; invocation cũ dùng renderer tương thích hoặc fallback output.

Ví dụ **A2UI wire payload v0.9.1** (catalog ID giả định, cần triển khai/đăng ký trước ở frontend):

```jsonl
{"version":"v0.9.1","createSurface":{"surfaceId":"result_1","catalogId":"https://payvoke.example/catalog/result/v1"}}
{"version":"v0.9.1","updateComponents":{"surfaceId":"result_1","components":[{"id":"root","component":"Card","child":"summary"},{"id":"summary","component":"Text","text":{"path":"/summary"},"variant":"body"}]}}
{"version":"v0.9.1","updateDataModel":{"surfaceId":"result_1","path":"/summary","value":"Đã xử lý xong tài liệu."}}
```

`createSurface` trước update, `root` bắt buộc, `catalogId` phải có ở renderer; tên/props component được xác nhận theo catalog đã pin. Đây là ví dụ minh họa, chưa có parser hoặc test tương thích trong repo. [A2UI v0.9.1 messages][a2ui-spec], [catalog guide][a2ui-catalog].

**Không hỗ trợ provider-supplied executable UI:** A2UI catalog không tự cài/chạy mã JS/React của provider. Không dùng remote arbitrary script, HTML nhúng hoặc `eval` từ `output`; muốn thêm component thì Payvoke phát hành version catalog mới qua frontend đã duyệt.

## 4. Quy tắc an toàn và tương thích

- Provider output và A2UI JSON luôn là dữ liệu không đáng tin: validate JSON Schema/catalog, giới hạn số node, độ sâu, bytes, bản cập nhật/giây, kích thước text/URL; sanitize text/Markdown, không chạy HTML/script. Kiểm tra UI refs và data binding trước render.
- **Không có UI action nào có quyền gọi API tùy ý**. Mọi action được backend ánh xạ qua danh sách cho phép (ví dụ `submitAnswer(questionId)`), kiểm tra session owner, role, CSRF, version/expected state, idempotency. Widget không được tự yêu cầu chi, ký ví, refund, release hoặc mở rộng dữ liệu đã chia sẻ.
- Dữ liệu hiển thị phải qua verifier và owner authorization; không cho provider dùng UI để tự đặt `DELIVERED`, sửa `paymentStatus` hoặc đưa link tải từ host bên ngoài làm artifact chính thức.
- Pin `specVersion` + `catalogId` vào product version/artifact version và lưu snapshot đủ tái dựng khi người mua xem lịch sử hoặc mở tranh chấp. Khách thiếu catalog hiển thị output typed/text và lời báo widget không hỗ trợ.
- Agent và Tool có UI khác nhau: Agent có timeline/chat; Tool là form/result, **không sinh chat composer từ widget**. A2UI question phải gắn đúng `questionId` và vẫn thực hiện qua `/answers`.
- Với MCP, trả structured output/artifacts làm baseline; A2UI chỉ là optional presentation cho host hỗ trợ, không giả định mọi host MCP render được A2UI. [S03](../specs/03-mcp-client.md).

## 5. POC xác minh quyết định đã chốt

1. Tạo `Payvoke Result Catalog v1` (Text, Card, Table, Metric, Chart, QuestionForm) dựa trên design system React/TanStack hiện có. Pin `A2UI v0.9.1` và catalog ID thật; chọn React renderer tương thích. Với component custom, đối chiếu [hướng dẫn A2UI][a2ui-custom].
2. Provider fixture bên ngoài Payvoke gửi `started → progress → result` với typed JSON và A2UI `createSurface/updateComponents/updateDataModel`, cùng một câu hỏi gắn `questionId`. Không làm thay đổi quote/x402/vault.
3. Gateway persist và dedupe report, validate output/widget; frontend render chart/form theo catalog, reconnect sẽ khôi phục từ DB. Khách không hỗ trợ A2UI vẫn xem được output.
4. Triển khai AG-UI gateway ingress/stream buyer đúng S04: chuẩn `RUN_*`/`ACTIVITY_*`/`TEXT_MESSAGE_*`; kiểm chứng refresh/reconnect, nhiều chu kỳ một invocation và UI stream fail không làm mất `DELIVERED` hay receipt.
5. Negative tests: malformed/unknown component/catalog; HTML/script/URL độc hại; duplicate/out-of-order report; cross-owner `questionId`; action lặp; provider mất mạng; result chưa pass verifier không thể giao; UI offline vẫn xem lại snapshot.

**Tiêu chí nghiệm thu:** A2UI phải render widget hữu ích và fallback bền vững mà không làm phức tạp delivery; AG-UI phải stream token thực sự trước completion, bảo đảm `runId`/resume/reconnect. Không dùng stream để bypass S01 x402.

## 6. Nguồn chính thức đã đối chiếu

- [AG-UI — Overview][agui-overview], [Events][agui-events], [Architecture][agui-architecture] — phạm vi, event/run và HTTP agent.
- [A2UI — Protocol v0.9.1][a2ui-spec], [version status][a2ui-home], [React renderer matrix][a2ui-renderers], [catalogs][a2ui-catalog], [custom components][a2ui-custom] — surface/schema/actions và renderer.
- [AG-UI + A2UI integration skill][agui-a2ui-skill] và [mã middleware][agui-a2ui-code] — xác nhận event `ACTIVITY_SNAPSHOT` với `activityType:"a2ui-surface"`, `content.a2ui_operations`; Payvoke cần adapter projection/renderer vì buyer stream là GET riêng, không phải AG-UI HttpAgent POST.
- Nguồn nội bộ: [S01](../specs/01-api-and-provider-protocol.md), [S02](../specs/02-x402-and-vault.md), [S03](../specs/03-mcp-client.md), [M04](../modules/04-provider-requests-and-gateway.md), [M05](../modules/05-artifacts-and-verification.md).

[agui-overview]: https://docs.ag-ui.com/introduction
[agui-events]: https://docs.ag-ui.com/concepts/events
[agui-architecture]: https://docs.ag-ui.com/concepts/architecture
[a2ui-home]: https://a2ui.org/
[a2ui-spec]: https://a2ui.org/specification/v0.9.1-a2ui/
[a2ui-renderers]: https://a2ui.org/reference/renderers/
[a2ui-catalog]: https://a2ui.org/guides/defining-your-own-catalog/
[a2ui-custom]: https://a2ui.org/guides/authoring-components/
[agui-a2ui-skill]: https://github.com/ag-ui-protocol/ag-ui/blob/main/skills/ag-ui-a2ui-integration/SKILL.md
[agui-a2ui-code]: https://github.com/ag-ui-protocol/ag-ui/blob/main/middlewares/a2ui-middleware/src/index.ts
