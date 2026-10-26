<script setup lang="ts">
// Thread giả lập; mỗi bước hiện theo click: hỏi lại → quote → kết quả.
</script>

<template>
  <div class="chat">
    <div class="chat-head">
      <span class="dot" />
      <span>Research Pro</span>
      <span class="muted">· thread #42</span>
    </div>

    <div class="chat-body">
      <div class="msg buyer"><code>/research</code> Phân tích đối thủ của sản phẩm này</div>
      <div v-click="1" class="msg app">Bạn muốn tập trung thị trường nào?</div>
      <div v-click="1" class="msg buyer">Việt Nam</div>
      <div v-click="3" class="msg app result">
        <div class="tag">DELIVERED · đã kiểm tra</div>
        Báo cáo 12 đối thủ, bảng giá, điểm khác biệt…
      </div>
    </div>

    <div v-click="2" class="quote">
      <div class="quote-row">
        <span><strong>Quote</strong> · /research rev 3</span>
        <span class="price">0,10 USDC</span>
      </div>
      <div class="quote-row muted">
        <span>Hạn giao 10 phút · review 24h</span>
        <span>Hoàn tiền nếu không giao</span>
      </div>
      <div class="authorize">Authorize</div>
    </div>

    <div class="composer">Nhập yêu cầu hoặc gõ <code>/</code> để chọn command…</div>
  </div>
</template>

<style scoped>
.chat {
  background: var(--t-surface);
  border: 1px solid var(--t-border-strong);
  font-size: 0.72rem;
  display: flex;
  flex-direction: column;
}

.chat-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--t-border-subtle);
  color: var(--t-text);
  font-weight: 600;
}

.dot {
  width: 0.5rem;
  height: 0.5rem;
  background: var(--t-brand);
}

.chat-body {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem;
  min-height: 11rem;
}

.msg {
  max-width: 85%;
  padding: 0.4rem 0.6rem;
  line-height: 1.45;
}

.buyer {
  align-self: flex-end;
  background: var(--t-brand);
  color: var(--t-brand-ink);
}

.buyer code {
  background: transparent;
  color: inherit;
  padding: 0;
}

.app {
  align-self: flex-start;
  background: var(--t-bg-deep);
  color: var(--t-text);
}

.result {
  border-left: 3px solid var(--t-brand);
}

.tag {
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  color: var(--t-brand);
  margin-bottom: 0.15rem;
}

.quote {
  margin: 0 0.75rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--t-brand);
  background: var(--t-brand-soft);
}

.quote-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.quote-row + .quote-row {
  margin-top: 0.15rem;
  font-size: 0.62rem;
}

.price {
  font-weight: 700;
  color: var(--t-brand);
}

.authorize {
  margin-top: 0.45rem;
  text-align: center;
  padding: 0.25rem;
  background: var(--t-brand);
  color: var(--t-brand-ink);
  font-weight: 600;
}

.composer {
  margin: 0.5rem 0.75rem 0.75rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--t-border-strong);
  color: var(--t-text-muted);
}
</style>
