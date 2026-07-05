<template>
  <view
    v-if="selected"
    class="selection-overlay"
    :class="{ dragging, locked: selected.locked }"
    :style="overlayStyle"
    @tap.stop
  >
    <view class="layer-handle handle-copy" @tap.stop="$emit('duplicate')">
      <image class="handle-icon" :src="copyHandleIcon" mode="aspectFit" />
    </view>
    <view class="layer-handle handle-delete" @tap.stop="$emit('remove')">
      <image class="handle-icon" :src="deleteHandleIcon" mode="aspectFit" />
    </view>
    <view class="layer-handle handle-mirror" @tap.stop="$emit('mirror')">
      <image class="handle-icon" :src="mirrorHandleIcon" mode="aspectFit" />
    </view>
    <view
      class="layer-handle handle-rotate"
      @tap.stop
      @touchstart.stop="$emit('rotate-touch-start', $event, selected)"
      @touchmove.stop="$emit('rotate-touch-move', $event, selected)"
      @touchend.stop="$emit('rotate-touch-end')"
      @mousedown.stop="$emit('rotate-mouse-down', $event, selected)"
    >
      <image class="handle-icon" :src="rotateHandleIcon" mode="aspectFit" />
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Layer } from '../editor-core'
import rotateHandleIcon from '../../../assets/rotate-handle-icon.png'
import copyHandleIcon from '../../../assets/copy-handle-icon.png'
import mirrorHandleIcon from '../../../assets/mirror-handle-icon.png'
import deleteHandleIcon from '../../../assets/delete-handle-icon.png'

defineProps<{
  selected?: Layer
  dragging: boolean
  overlayStyle: Record<string, string | number>
}>()

defineEmits<{
  (e: 'duplicate'): void
  (e: 'remove'): void
  (e: 'mirror'): void
  (e: 'rotate-touch-start', event: any, layer: Layer): void
  (e: 'rotate-touch-move', event: any, layer: Layer): void
  (e: 'rotate-touch-end'): void
  (e: 'rotate-mouse-down', event: any, layer: Layer): void
}>()
</script>
