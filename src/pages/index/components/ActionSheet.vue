<!-- Reusable in-DOM action sheet. Cross-end replacement for Taro.showActionSheet,
     which silently no-ops on the Dimina 安卓/鸿蒙 runtime (the tap fires, but no
     native sheet appears; iOS works). Declarative (open ref + this component in
     template), not imperative — a global createApp/append-to-body mount is not
     reliable on the weapp/Dimina renderer. Styling reuses the shared .asset-action-*
     classes in styles/gooda-theme.css.

     Usage:
       <ActionSheet
         :open="open"
         title="选择导入方式"
         :items="[{ label: '拍摄' }, { label: '相册' }, { label: '删除', danger: true }]"
         @select="onSelect"   // (index: number)
         @close="open = false"
       /> -->
<template>
  <view v-if="open" class="asset-action-mask" @tap="$emit('close')">
    <view class="asset-action-panel" @tap.stop>
      <view v-if="title" class="asset-action-title">{{ title }}</view>
      <view
        v-for="(it, i) in items"
        :key="i"
        class="asset-action-row"
        :class="{ danger: it.danger }"
        @tap="$emit('select', i)"
      >{{ it.label }}</view>
      <view class="asset-action-cancel" @tap="$emit('close')">{{ cancelText }}</view>
    </view>
  </view>
</template>

<script setup lang="ts">
interface ActionSheetItem {
  label: string
  danger?: boolean
}

withDefaults(
  defineProps<{
    open: boolean
    items: ActionSheetItem[]
    title?: string
    cancelText?: string
  }>(),
  { title: '', cancelText: '取消' },
)

defineEmits<{
  (e: 'select', index: number): void
  (e: 'close'): void
}>()
</script>
