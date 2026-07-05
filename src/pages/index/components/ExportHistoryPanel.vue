<template>
  <view v-if="open" class="export-history-mask" @tap="$emit('close')">
    <view class="export-history-panel" @tap.stop>
      <view class="export-history-head">
        <view>
          <text class="export-history-title">导出历史</text>
          <text class="export-history-subtitle">最近 {{ records.length }} 张</text>
        </view>
        <text class="export-history-close" @tap="$emit('close')">×</text>
      </view>
      <view v-if="records.length" class="export-history-list">
        <view
          v-for="record in records"
          :key="record.id"
          class="export-history-item"
          @tap="$emit('preview', record)"
        >
          <image :src="record.src" mode="aspectFill" class="export-history-thumb" />
          <view class="export-history-meta">
            <text class="export-history-name">{{ record.name }}</text>
            <text class="export-history-time">{{ record.timeText }}</text>
          </view>
          <text class="export-history-arrow">查看</text>
        </view>
      </view>
      <view v-else class="export-history-empty">
        <text>还没有导出记录</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ExportHistoryRecord } from '../editor-core'

defineProps<{
  open: boolean
  records: ExportHistoryRecord[]
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'preview', record: ExportHistoryRecord): void
}>()
</script>
