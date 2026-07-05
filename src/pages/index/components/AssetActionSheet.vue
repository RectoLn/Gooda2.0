<template>
  <view v-if="open" class="asset-action-mask" @tap="$emit('close')">
    <view class="asset-action-panel" @tap.stop>
      <view class="asset-action-title">{{ label }}</view>
      <view class="asset-action-row" @tap="$emit('edit')">编辑</view>
      <view class="asset-action-row danger" @tap="$emit('delete')">删除</view>
      <view class="asset-action-cancel" @tap="$emit('close')">取消</view>
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
  label: string
}>()

defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'close'): void
}>()
</script>
