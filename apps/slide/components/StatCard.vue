<script setup lang="ts">
defineProps<{
  value: string;
  label: string;
}>();
</script>

<template>
  <div class="card stat">
    <div class="stat-value">{{ value }}</div>
    <div class="stat-label">{{ label }}</div>
  </div>
</template>

<style scoped>
.stat-value {
  font-family: "Geist", sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--t-brand);
  line-height: 1.1;
}

.stat-label {
  font-size: 0.72rem;
  color: var(--t-text-muted);
  margin-top: 0.35rem;
}
</style>
