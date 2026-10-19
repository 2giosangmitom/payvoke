# Đặc tả triển khai Payvoke

Ba đặc tả này cụ thể hóa M01–M10, chưa phải bằng chứng đã có implementation. Đọc [GLOSSARY](../../GLOSSARY.md) trước để phân biệt phiên sử dụng, invocation và grant chi.

| Tài liệu                                                          | Chốt gì                                                                                                                                                           |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [S01 · API và provider protocol](01-api-and-provider-protocol.md) | Agent/chat và tool/form, API đăng ký slash commands có parameters, version/review, buyer quote/invocation, SSE/ACK/report, file, idempotency và acceptance tests. |
| [S02 · x402 và vault](02-x402-and-vault.md)                       | Scheme v1, snapshots/hash, EIP-712 structs, grant/hold/decision ABI, roles, finality, recovery và fixture chữ ký.                                                 |
| [S03 · MCP client](03-mcp-client.md)                              | Local stdio bridge, wallet pairing, scope API/grant riêng, bộ tools, approval ngoài model, async polling, isolation và retry.                                     |

## Quy tắc xuyên suốt

1. Một phiên sử dụng thuộc đúng một sản phẩm; không đổi product/provider/kind giữa phiên.
2. Agent có chat/composer và slash commands; tool có form parameters và kết quả, **không composer chat**.
3. Provider đăng ký command theo product; input/output schema và giá nằm trong approved version. Không có raw slash eval hoặc routing qua LLM để quyết định giá.
4. Web và MCP cùng API và scheme x402; mỗi invocation mới một khoản giữ. Đọc trạng thái/kết quả, answer và revision đúng phạm vi không thu thêm.
5. Hold xác nhận trước giao job; replay cùng invocation không debit hoặc tạo logical job mới. Provider phải dedupe side effect.
6. Khóa chi nằm client; không đặt khóa buyer trên remote MCP/facilitator. API token không thay onchain grant.

## Bắt đầu implementation theo thứ tự

1. Common schemas/digest fixtures, data model và policy validation; [fixture máy đọc](fixtures/x402-v1.json).
2. Vault local tests và x402 adapters; buyer/provider auth và command registration có thể làm song song sau khi chốt schemas.
3. Một vertical slice: product/command → agent chat hoặc tool form → quote → hold → SSE → result.
4. Reconciliation/fault injection và Fuji smoke test.
5. MCP local nối vào cùng vertical slice; protocol tests với host/SDK đúng revision.

## Những gì vẫn phải duyệt trước khi bật giao dịch

- Con số phí/trần, quote lifetime, giới hạn thời gian giao/review/resolve, gas budgets.
- Token/pairing/key/session lifetimes, input/file/retention limits; phương án backup và địa chỉ/roles triển khai.
- Các con số trong example/fixture chỉ để kiểm thử, không tự trở thành policy vận hành.

Có thể bắt đầu code và test local theo đặc tả; **không bật paid deployment khi policy chưa được duyệt**. Khi implement cần xuất OpenAPI từ schemas và kiểm tra compatibility theo S01; tài liệu Markdown chưa thay thế artifact OpenAPI chạy validation. Không cần thêm Redis/Kafka cho MVP; file lớn cần object storage nếu bật hỗ trợ file.
