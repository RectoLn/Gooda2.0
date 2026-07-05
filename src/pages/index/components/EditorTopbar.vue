<template>
  <view class="topbar">
    <view class="brand">
      <image class="brand-logo" :src="brandLogo" mode="aspectFit" />
    </view>
    <view class="top-actions">
      <view class="top-action-cluster history-actions">
        <view class="icon-btn undo-btn" :class="{ disabled: !canUndo }" @tap="$emit('undo')">
          <image class="top-icon-img" :src="undoIcon" mode="aspectFit" />
        </view>
        <view class="icon-btn redo-btn" :class="{ disabled: !canRedo }" @tap="$emit('redo')">
          <image class="top-icon-img" :src="redoIcon" mode="aspectFit" />
        </view>
      </view>
      <view class="top-action-cluster file-actions">
        <view class="icon-btn file-icon-btn history-export-btn" @tap="$emit('history')">
          <image class="top-icon-img file-icon-img" :src="historyIcon" mode="aspectFit" />
        </view>
        <view class="icon-btn file-icon-btn export-btn" @tap="$emit('export')">
          <image class="top-icon-img file-icon-img" :src="downloadIcon" mode="aspectFit" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import brandLogo from '../../../assets/brand-logo-bag-girl.png'
import undoIcon from '../../../assets/undo-icon.png'
import redoIcon from '../../../assets/undo-icon.png'
import historyIcon from '../../../assets/export-history-icon.png'
import downloadIcon from '../../../assets/export-download-icon.png'

defineProps<{
  canUndo: boolean
  canRedo: boolean
}>()

defineEmits<{
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'history'): void
  (e: 'export'): void
}>()
</script>
