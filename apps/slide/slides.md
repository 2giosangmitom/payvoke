---
theme: default
colorSchema: light
title: Payvoke
info: |
  Pitch Payvoke: giúp người build AI agent/tool bán dịch vụ, nhận USDC theo từng lần gọi.
fonts:
  sans: Geist
  mono: JetBrains Mono
aspectRatio: 16/9
transition: slide-left
duration: 7min
drawings:
  persist: false
layout: cover
class: pixel-grid
---

<div class="eyebrow">Hackathon 2026 · Avalanche Fuji</div>

# Payvoke

<p class="text-xl !opacity-100" style="color: var(--t-text-secondary)">
Bạn build AI agent. <span class="brand font-bold">Payvoke giúp bạn bán nó</span> —<br>
nhận USDC theo từng lần gọi, có escrow bảo đảm cho cả hai bên.
</p>

<div class="abs-bl m-10 text-sm muted">
  TODO: tên đội · thành viên
</div>

<!--
(~20s) Chào ban giám khảo. Chúng tôi là [tên đội]. Payvoke sinh ra cho những người build AI agent và tool: bạn tập trung làm agent, Payvoke lo phần bán — từ store, giao diện chat, thu tiền theo từng lần gọi, đến giải ngân và hoàn tiền.
-->

---

<div class="eyebrow">Vấn đề</div>

# Build agent thì dễ. Bán được nó mới khó.

<div class="grid grid-cols-3 gap-4 mt-6">
  <div v-click class="card">
    <h3>Phải dựng cả cửa hàng</h3>
    <p>Muốn thu tiền từ một agent nhỏ, builder phải tự làm đăng nhập, billing, giao diện chat, hoàn tiền, hỗ trợ khách…</p>
  </div>
  <div v-click class="card">
    <h3>Không ai tin ai</h3>
    <p>Khách ngại trả trước cho builder chưa có tên tuổi. Builder ngại làm trước rồi không được trả.</p>
  </div>
  <div v-click class="card">
    <h3>Mô hình giá không khớp</h3>
    <p>Subscription không hợp với tool dùng thỉnh thoảng. Khách là AI agent thì không có thẻ tín dụng.</p>
  </div>
</div>

<div v-click class="mt-8 text-lg" style="color: var(--t-text)">
Builder cần một nơi để <span class="brand font-bold">bán theo từng lần gọi</span> mà không phải xây lại cả hệ thống bán hàng.
</div>

<!--
(~40s) Hôm nay ai cũng build được một agent nghiên cứu, một tool tóm tắt hay chuyển đổi file. Nhưng để thu được đồng đầu tiên thì khó hơn nhiều.
[click] Builder phải dựng cả cửa hàng: auth, billing, UI, hoàn tiền.
[click] Và không ai tin ai: khách không dám trả trước cho một builder vô danh, builder cũng không dám làm trước.
[click] Subscription thì không hợp với tool dùng vài lần, còn khách hàng mới — AI agent — thì không có thẻ.
[click] Builder cần một nơi bán theo từng lần gọi, có sẵn mọi thứ còn lại.
-->

---

<div class="eyebrow">Giải pháp</div>

# Bạn lo agent. Payvoke lo phần bán.

<div class="grid grid-cols-2 gap-6 mt-4">
<div class="card">
  <h3>Builder chỉ cần</h3>

<v-clicks>

- Chạy agent/tool trên hạ tầng của mình — **có hoặc không dùng LLM**
- Khai báo **slash command**, giá USDC và điều khoản giao hàng
- Nhận việc, hỏi lại khách, giao kết quả

</v-clicks>

</div>
<div v-click class="card" style="border-color: var(--t-brand)">
  <h3 class="brand">Payvoke lo</h3>

- **Store** và trang app để khách tìm thấy bạn
- **Giao diện chat chung**: hỏi lại, widget, stream kết quả
- **Quote + thu tiền** qua x402, tính theo từng lần gọi
- **Escrow trong PayvokeVault**: giao xong mới giải ngân, không giao thì tự hoàn
- **Kênh MCP** để AI agent khác gọi được app của bạn

</div>
</div>

<!--
(~40s) Chia việc rất rõ.
[click] Builder chạy agent của mình ở đâu cũng được, không bắt buộc dùng LLM.
[click] Khai báo command, giá và điều khoản.
[click] Rồi nhận việc và giao kết quả.
[click] Mọi thứ còn lại Payvoke lo: store, giao diện chat, thu tiền, escrow, và cả kênh phân phối tới AI agent qua MCP.
-->

---
layout: two-cols
layoutClass: gap-10
---

<div class="eyebrow">Hành trình builder</div>

# Từ agent đến doanh thu

<FlowStep step="1" title="Tạo app trong Studio">Đăng nhập bằng ví, đặt payout address.</FlowStep>
<FlowStep step="2" title="Khai báo command">Input, giá, điều khoản → một revision bất biến.</FlowStep>
<FlowStep step="3" title="Kết nối worker">API key, nhận <code>invocation.ready</code> qua SSE, ACK, gửi report.</FlowStep>
<FlowStep step="4" title="Nhận tiền">Giao đúng hạn → sau review window tự giải ngân vào <code>providerClaimable</code>.</FlowStep>

::right::

<div class="mt-16" style="--slidev-code-font-size: 0.68rem; --slidev-code-line-height: 1.45">

```json
{
  "name": "summarize",
  "description": "Tóm tắt theo ngôn ngữ và độ dài",
  "options": [
    { "name": "text", "type": "STRING", "required": true },
    { "name": "maxWords", "type": "INTEGER" }
  ],
  "positionalParameter": "text",
  "grossAmount": "10000",
  "terms": {
    "deliverySeconds": 600,
    "reviewSeconds": 86400,
    "refundPolicy": "Không giao / lỗi / trễ → hoàn 100%"
  }
}
```

<div class="text-xs muted mt-2"><code>grossAmount</code> tính bằng đơn vị nhỏ nhất của USDC: 10000 = 0,01 USDC</div>

</div>

<!--
(~45s) Đây là toàn bộ việc builder phải làm.
Tạo app trong Studio bằng ví. Khai báo command — bên phải là ví dụ một command tóm tắt giá 0,01 USDC, hạn giao 10 phút. Mỗi lần sửa giá hay schema tạo revision mới, đơn cũ không bị ảnh hưởng.
Worker của bạn nhận event qua SSE, ACK, rồi gửi report: started, question, result.
Giao đúng hạn thì tiền tự về tài khoản của bạn — không cần gửi hoá đơn, không cần đòi nợ.
-->

---
layout: two-cols
layoutClass: gap-10
---

<div class="eyebrow">Khách hàng của bạn</div>

# Khách thấy một thread chat quen thuộc

<FlowStep step="1" title="Gõ slash command">Hoặc free text vào command mặc định.</FlowStep>
<FlowStep step="2" title="Xem quote, bấm Authorize">Giá, hạn giao, chính sách hoàn tiền rõ ràng trước khi trả.</FlowStep>
<FlowStep step="3" title="Nhận kết quả đã kiểm tra">Hỏi lại và sửa trong phạm vi đã mua không tính thêm tiền.</FlowStep>

<div class="text-xs muted mt-4">Khách cấp quyền chi có hạn mức (mỗi lần / mỗi kỳ / tổng / hết hạn) một lần, sau đó mỗi lần gọi chỉ cần bấm Authorize.</div>

::right::

<div class="mt-16">
  <ChatMock />
</div>

<!--
(~40s) Khách hàng của builder không phải học giao diện mới cho từng app. Mọi app đều chạy trong cùng một thread chat.
Khách gõ /research.
[click] Agent của bạn có thể hỏi lại ngay trong thread.
[click] Quote hiện ngay trên ô nhập: giá, hạn giao, chính sách hoàn tiền. Khách bấm Authorize.
[click] Kết quả chỉ DELIVERED sau khi được kiểm tra.
TODO: nếu có thời gian, chuyển sang demo thật trên frontend.
-->

---

<div class="eyebrow">Escrow</div>

# Niềm tin có sẵn, kể cả cho builder mới

```mermaid {theme: 'base', scale: 0.8, themeVariables: {fontFamily: 'JetBrains Mono', primaryColor: '#fcfdfc', primaryBorderColor: '#286346', primaryTextColor: '#182e24', lineColor: '#81968a', edgeLabelBackground: '#f4f7f5'}}
flowchart LR
  D[Khách nạp USDC] --> A[buyerAvailable]
  A -- reserveHold --> H[heldRemaining]
  H -- giao đúng hạn<br>đã kiểm tra --> R[release<br>builder + platform]
  H -- không giao<br>lỗi / trễ --> RF[refund]
  H -- quá resolveBy --> RC[khách reclaim]
  RF --> A
  RC --> A
```

<div class="grid grid-cols-3 gap-4 mt-4 text-sm">
  <div v-click class="card"><strong>Builder chỉ làm khi tiền đã giữ</strong><p>Event <code>invocation.ready</code> chỉ phát sau khi hold xác nhận onchain.</p></div>
  <div v-click class="card"><strong>Khách dám trả cho người lạ</strong><p>Không giao, lỗi hoặc trễ thì hoàn toàn bộ tự động.</p></div>
  <div v-click class="card"><strong>Không ai giam được tiền</strong><p>Finance worker tự quyết; quá hạn cuối, khách tự reclaim.</p></div>
</div>

<!--
(~40s) Đây là thứ giải quyết bài toán niềm tin. Tiền nằm trong PayvokeVault, không nằm trong tay chúng tôi hay builder.
[click] Builder chỉ nhận việc khi tiền đã được giữ onchain — không bao giờ làm không công.
[click] Khách thì yên tâm trả cho một builder chưa có tên tuổi, vì không giao là tự hoàn.
[click] Và nếu Payvoke có sập, sau hạn cuối khách vẫn tự lấy lại tiền.
-->

---
layout: two-cols
layoutClass: gap-10
---

<div class="eyebrow">Thanh toán</div>

# x402 + PayvokeVault

Thanh toán ở **lớp HTTP**, giữ tiền **onchain**.

```text
POST /v1/invocations  (quoteId)
  ← 402 PAYMENT-REQUIRED
Client kiểm tra quote + ký EIP-712
  → PAYMENT-SIGNATURE
Facilitator → reserveHold() trên Fuji
  ← receipt + invocation queued
```

<div class="text-xs muted mt-2">scheme <code>payvoke-vault</code> · x402 v2 · eip155:43113</div>

::right::

<div class="mt-16 flex flex-col gap-3">
  <div v-click class="card">
    <h3>Chữ ký gắn chặt quote</h3>
    <p>EIP-712 ràng buộc invocation, app, command revision, input hash, giá, phí, deadline. Không ai thu khác những gì khách đã ký.</p>
  </div>
  <div v-click class="card">
    <h3>Spending grant onchain</h3>
    <p>Khóa chi nằm phía khách, có hạn mức và ngày hết hạn — đủ an toàn để giao cho một AI agent.</p>
  </div>
  <div v-click class="card">
    <h3>Builder không đụng tới crypto</h3>
    <p>Worker chỉ nói chuyện HTTP/SSE; ký, settle, giải ngân đều do Payvoke và vault xử lý.</p>
  </div>
</div>

<!--
(~35s) Về kỹ thuật: chúng tôi dùng x402 — thanh toán qua mã HTTP 402 — với scheme riêng payvoke-vault trên Avalanche Fuji.
[click] Chữ ký gắn với đúng quote, không đổi được giá hay input.
[click] Quyền chi có hạn mức onchain, đủ an toàn để một AI agent tự trả tiền.
[click] Và builder không cần biết gì về ví hay smart contract: worker chỉ nói HTTP.
-->

---

<div class="eyebrow">An toàn theo thiết kế</div>

# Chặn các lỗi đã thấy ở facilitator x402 công khai

| Lỗi được nghiên cứu năm 2026 chỉ ra | Payvoke chặn bằng |
| --- | --- |
| Báo thành công khi chưa settle | Chỉ success khi hold đã **finalized** |
| Một chữ ký dùng cho resource khác | Chữ ký gắn **invocation / quote / input hash** |
| Settle trùng khi request đồng thời | **Consume-once** onchain, idempotency theo `invocationId` |
| Overdraft allowance | Cap mỗi lần / kỳ / tổng, không dùng `upto` |
| Gas abuse, relay tuỳ ý | Chỉ `RELAYER_ROLE`, calldata allowlist, trần gas |
| Lộ PII trong metadata | Header chỉ chứa **hash** |

<div v-click class="mt-4 text-sm">
Mỗi quy tắc có ca test âm tính trong <strong>conformance suite</strong> — <code>tests/payments-e2e</code>.
</div>

<!--
(~30s) Các paper năm 2026 tìm thấy lỗ hổng ở mọi facilitator x402 công khai được thử. Với builder, mỗi lỗi này là mất tiền hoặc làm không công. Chúng tôi lấy danh sách đó làm checklist: mỗi dòng có cơ chế chặn và ca test âm tính.
[click] Lưu ý trung thực: đây là test của chúng tôi, chưa phải kiểm toán bên thứ ba.
-->

---

<div class="eyebrow">Kênh phân phối</div>

# AI agent khác cũng là khách hàng của bạn

<div class="grid grid-cols-2 gap-6 mt-4">
<div>

<v-clicks>

- Claude, agent trong IDE… gọi app của bạn qua **MCP bridge** chạy trên máy khách
- Bridge giữ khóa chi local, chi trong **hạn mức khách đã cấp**
- Builder **không phải viết MCP server** riêng: command trong catalog Payvoke tự đến được agent
- Cùng quote, cùng escrow, cùng giá — một nguồn doanh thu mới

</v-clicks>

</div>
<div class="card">
  <h3>MCP bridge <span class="pill ml-2">đang làm</span></h3>

```text
Claude / IDE agent
   ↓ MCP stdio
Payvoke bridge (máy khách, giữ khóa)
   ↓ HTTPS
Buyer API → x402 → Vault → app của bạn
```

`search_apps` · `prepare_invocation` · `submit_invocation` · `get_result`…

</div>
</div>

<!--
(~35s) Khách hàng tiếp theo của builder không phải người, mà là agent.
[click] Một MCP bridge chạy local cho phép Claude hay agent trong IDE tìm và gọi app trên Payvoke.
[click] Bridge chỉ chi trong hạn mức người dùng đã cấp.
[click] Builder không cần viết MCP server riêng — đăng command một lần là agent dùng được.
[click] Cùng cơ chế escrow, nên đây đơn giản là thêm một kênh doanh thu. Phần này đã thiết kế xong và đang triển khai.
-->

---

<div class="eyebrow">Đã xây được gì</div>

# Trạng thái hiện tại

<div class="grid grid-cols-4 gap-4 mt-4">
  <StatCard value="78" label="test PayvokeVault (fuzz, invariant, adversarial)" />
  <StatCard value="112" label="test backend pass" />
  <StatCard value="4" label="service tách quyền khóa" />
  <StatCard value="Fuji" label="Avalanche testnet · USDC testnet" />
</div>

<div class="grid grid-cols-2 gap-6 mt-6 text-sm">
<div>

**Cho builder:** Studio quản lý app/command/API key · provider protocol SSE + ACK + report · stream AG-UI, widget OpenUI

</div>
<div>

**Nền tảng:** Fastify · PostgreSQL + Prisma · Solidity + Hardhat · viem · React/TanStack · `facilitator` · `settlement-worker` · `finance-worker`

</div>
</div>

<div class="mt-4 text-xs muted">Chưa dùng mainnet hay tiền thật. TODO: cập nhật số liệu test trước khi trình bày.</div>

<!--
(~30s) Những gì đã chạy: builder có Studio để tạo app, command và API key, cùng giao thức nhận việc qua SSE. Vault có 78 test gồm fuzz và invariant, backend 112 test. Bốn service tách quyền giữ khóa.
Tất cả đang chạy trên testnet Fuji.
-->

---

<div class="eyebrow">Kinh doanh & lộ trình</div>

# Builder giữ phần lớn doanh thu

<div class="grid grid-cols-2 gap-8 mt-4">
<div>

Phí nền tảng chỉ tính trên phần **thực sự giải ngân**:

```text
net      = gross − refund
fee      = floor(net × feeBps / 10 000)
builder  = net − fee
```

<div class="card mt-3 text-sm">
Ví dụ: giá 1 USDC, hoàn 0,2, phí 5%<br>
→ builder <strong>0,76</strong> · platform <strong>0,04</strong> · khách nhận lại <strong>0,2</strong>
</div>

</div>
<div>

<v-clicks>

- **Tiếp theo:** deploy Fuji công khai, MCP bridge, file & acceptance
- **Sau đó:** onboarding nhóm builder đầu tiên, hardening, kiểm toán contract
- **Dài hạn:** mainnet, SDK worker cho các framework agent phổ biến

</v-clicks>

</div>
</div>

<!--
(~35s) Builder giữ phần lớn doanh thu. Payvoke chỉ lấy một tỉ lệ nhỏ trên phần tiền thật sự được giải ngân — nếu hoàn tiền thì chúng tôi cũng không thu phí. Chúng tôi chỉ kiếm tiền khi builder kiếm được tiền.
[click] Tiếp theo: deploy Fuji công khai và MCP bridge.
[click] Sau đó onboard nhóm builder đầu tiên và kiểm toán.
[click] Dài hạn là mainnet và SDK để nối agent viết bằng các framework phổ biến chỉ trong vài dòng.
-->

---
layout: center
class: text-center pixel-grid
---

<div class="eyebrow">Payvoke</div>

# Bạn build agent. Payvoke lo phần bán.

<p class="text-lg mt-4" style="color: var(--t-text-secondary)">Cảm ơn ban giám khảo — xin mời đặt câu hỏi.</p>

<div class="mt-8 text-sm muted">TODO: link demo · link repo · liên hệ</div>

<!--
(~15s) Tóm lại: bạn build agent, Payvoke lo phần bán — store, thanh toán theo lần gọi, escrow và cả kênh tới AI agent. Cảm ơn ban giám khảo, chúng tôi sẵn sàng nhận câu hỏi.
-->
