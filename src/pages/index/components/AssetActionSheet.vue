<!-- Long-press 编辑/删除 sheet for a user-imported material. Thin semantic wrapper
     over the generic ActionSheet so the whole app shares one in-DOM sheet primitive
     (see ActionSheet.vue for why native Taro.showActionSheet is avoided). -->
<template>
  <ActionSheet
    :open="open"
    :title="label"
    :items="items"
    @select="onSelect"
    @close="$emit('close')"
  />
</template>

<script setup lang="ts">
import ActionSheet from './ActionSheet.vue'

defineProps<{
  open: boolean
  label: string
}>()

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
  (e: 'close'): void
}>()

const items = [{ label: '编辑' }, { label: '删除', danger: true }]

function onSelect(index: number) {
  if (index === 0) emit('edit')
  else emit('delete')
}
</script>
