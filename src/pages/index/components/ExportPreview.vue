<template>
  <view v-if="open && src" class="export-preview-mask" @tap="$emit('close')">
    <view class="export-preview" @tap.stop>
      <view class="export-preview-head">
        <text class="export-preview-title">导出结果</text>
        <text class="export-preview-close" @tap="$emit('close')">×</text>
      </view>
      <image :src="src" mode="aspectFit" class="export-preview-img" />
      <view class="export-preview-actions">
        <view class="export-save-btn" @tap="$emit('save')">保存图片</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
  src: string
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'save'): void
}>()
</script>
