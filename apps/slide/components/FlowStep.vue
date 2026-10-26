<script setup lang="ts">
defineProps<{
  step: string | number;
  title: string;
}>();
</script>

<template>
  <div class="flow-step">
    <div class="flow-index">{{ step }}</div>
    <div>
      <div class="flow-title">{{ title }}</div>
      <div class="flow-body"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.flow-step {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--t-border-subtle);
}

.flow-index {
  flex: none;
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  background: var(--t-brand);
  color: var(--t-brand-ink);
}

.flow-title {
  font-family: "Geist", sans-serif;
  font-weight: 600;
  color: var(--t-text);
  font-size: 0.95rem;
}

.flow-body {
  font-size: 0.75rem;
  color: var(--t-text-secondary);
  line-height: 1.5;
}
</style>
