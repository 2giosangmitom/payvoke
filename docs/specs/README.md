# Đặc tả triển khai Payvoke

Bốn đặc tả này quy định cách triển khai M01–M10; các tính năng chưa được xác nhận đã chạy. [GLOSSARY](../../GLOSSARY.md) định nghĩa app, thread, invocation và quyền chi.

| Tài liệu                                                          | Chốt gì                                                                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [S01 · API và provider protocol](01-api-and-provider-protocol.md) | App/thread, command revision, API đăng ký slash commands, buyer quote/invocation, SSE/ACK/report, file, idempotency và acceptance tests. |
| [S02 · x402 và vault](02-x402-and-vault.md)                       | Scheme v1, snapshots/hash, EIP-712 structs, grant/hold/decision ABI, roles, finality, recovery và fixture chữ ký.                        |
| [S03 · MCP client](03-mcp-client.md)                              | Local stdio bridge, wallet pairing, scope API/grant riêng, bộ tools, approval ngoài model, async polling, isolation và retry.            |
| [S04 · AG-UI và OpenUI](04-ag-ui-a2ui-streaming.md)               | Streaming LLM response/chat theo AG-UI, nhận chunk từ provider, replay/cursor/snapshot, custom widgets OpenUI và giới hạn actions.       |

## Quy tắc xuyên suốt

1. Một thread thuộc đúng một app; không đổi app/provider giữa thread.
2. Mọi app dùng chung chat/composer, streaming AG-UI và widget OpenUI; command không có positional mở form trong thread.
3. Provider đăng ký command theo app; input/output schema, options và giá nằm trong command revision bất biến. Không có raw slash eval hoặc routing qua LLM để quyết định giá.
4. Web và MCP cùng API và scheme x402; mỗi invocation mới một khoản giữ. Đọc trạng thái/kết quả, answer và revision đúng phạm vi không thu thêm.
5. Hold xác nhận trước giao job; replay cùng invocation không debit hoặc tạo logical job mới. Provider phải dedupe side effect.
6. Khóa chi nằm client; không đặt khóa buyer trên remote MCP/facilitator. API token không thay onchain grant.

## Thứ tự triển khai

Chi tiết task/dependency/acceptance: [Roadmap 130 task](../roadmap.md). Ưu tiên backend và tiền trước UI:

1. Môi trường, common schemas/digest fixtures và policy validation; [fixture máy đọc](fixtures/x402-v1.json).
2. Vault local, invariant/negative tests và ABI/deployment artifacts.
3. Backend identity/catalog/app/command/thread, quote, x402 adapters, settlement worker và recovery.
4. Provider SSE/ACK/report, AG-UI stream ingress + buyer projection/snapshot, result/continuation/file, finance; headless E2E và Fuji gate trước frontend.
5. Frontend nối API thật: store/chat/Studio, AG-UI renderer OpenUI, slash commands, form options trong thread, quyền chi và thao tác tài chính.
6. MCP local nối cùng buyer API và x402, pairing/approval/recovery và protocol tests với host đúng revision.
7. Security/CI/load/restore/runbooks, staging và phát hành Fuji; không tự triển khai mainnet.

## Những gì vẫn phải duyệt trước khi bật giao dịch

- Con số phí/trần, quote lifetime, giới hạn thời gian giao/review/resolve, gas budgets.
- Token/pairing/key/session lifetimes, input/file/retention limits; phương án backup và địa chỉ/roles triển khai.
- Các con số trong example/fixture chỉ để kiểm thử, không tự trở thành policy vận hành.

Có thể bắt đầu code và test local theo đặc tả. Chỉ bật thanh toán trên deployment sau khi policy được duyệt. Khi triển khai, cần xuất OpenAPI từ schemas và kiểm tra tính tương thích theo S01; Markdown không thay thế OpenAPI artifact đã qua validation. MVP chưa cần Redis/Kafka; nếu hỗ trợ file lớn thì cần object storage.
