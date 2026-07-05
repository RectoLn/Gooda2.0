<template>
  <view
    class="stage-tool-rail"
    :class="{ dragging, collapsed, 'layers-open': layerDrawerOpen }"
    :style="railStyle"
    @touchstart.stop="$emit('touch-start', $event)"
    @touchmove.stop="$emit('touch-move', $event)"
    @touchend.stop="$emit('touch-end')"
    @touchcancel.stop="$emit('touch-end')"
    @mousedown.stop="$emit('mouse-down', $event)"
    @dragstart.stop.prevent
  >
    <view class="stage-tool" :class="{ on: stageZoomed }" @tap="$emit('toggle-zoom')">
      <image class="stage-tool-icon" :src="zoomToolIcon" mode="aspectFit" />
    </view>
    <view class="stage-tool" :class="{ on: showGrid }" @tap="$emit('toggle-grid')">
      <image class="stage-tool-icon" :src="gridToolIcon" mode="aspectFit" />
    </view>
    <view class="stage-tool" @tap="$emit('fit-selection')">
      <text class="stage-center-icon">⌖</text>
    </view>
    <view class="stage-tool stage-tool-layer" :class="{ on: layerDrawerOpen }" @tap="$emit('toggle-layers')">
      <image class="stage-layer-icon" :src="layerIcon" mode="aspectFit" :draggable="false" @dragstart.stop.prevent />
    </view>
  </view>
</template>

<script setup lang="ts">
import zoomToolIcon from '../../../assets/tool-zoom-icon.png'
import gridToolIcon from '../../../assets/tool-grid-icon.png'
import layerIcon from '../../../assets/layer-icon.png'

defineProps<{
  stageZoomed: boolean
  showGrid: boolean
  layerDrawerOpen: boolean
  dragging: boolean
  collapsed: boolean
  railStyle: Record<string, string | number>
}>()

defineEmits<{
  (e: 'toggle-zoom'): void
  (e: 'toggle-grid'): void
  (e: 'fit-selection'): void
  (e: 'toggle-layers'): void
  (e: 'touch-start', event: any): void
  (e: 'touch-move', event: any): void
  (e: 'touch-end'): void
  (e: 'mouse-down', event: any): void
}>()
</script>
