<template>
  <view v-if="open" class="drawer-mask" @tap="$emit('close')" />
  <view
    class="layer-drawer"
    :class="{ open, dragging }"
    :style="drawerStyle"
  >
    <view
      class="drawer-handle"
      @touchstart.stop="$emit('touch-start', $event)"
      @touchmove.stop="$emit('touch-move', $event)"
      @touchend.stop="$emit('touch-end', $event)"
      @mousedown.stop="$emit('mouse-down', $event)"
    />
    <view class="panel-head drawer-head">
      <text class="panel-title">图层</text>
      <view class="drawer-actions">
        <text class="panel-link">{{ layers.length }} 个元素</text>
        <text class="drawer-close" @tap="$emit('close')">×</text>
      </view>
    </view>
    <view v-if="!layers.length" class="empty-layers">
      <text>还没有元素</text>
    </view>
    <scroll-view v-else :scroll-y="true" class="layer-scroll">
      <view class="layer-list" :class="{ reordering: reorderId }">
        <view
          v-for="(ly, idx) in layers"
          :key="ly.id"
          class="layer-slot"
        >
          <text class="layer-rank">{{ layerOrderLabel(idx) }}</text>
          <view
            class="layer-row"
            :class="{ on: ly.id === selectedId, lifting: ly.id === reorderId, insert: idx === reorderTargetVis && ly.id !== reorderId, settled: ly.id === settledReorderId, fixed: ly.fixed }"
            :style="layerRowStyle(ly, idx)"
            @tap="$emit('select-layer', ly.id)"
          >
            <view
              class="row-drag"
              :class="{ disabled: ly.fixed }"
              @tap.stop
              @touchstart.stop="!ly.fixed && $emit('row-drag-touch-start', $event, ly, idx)"
              @touchmove.stop="$emit('row-drag-touch-move', $event)"
              @touchend.stop="$emit('row-drag-touch-end')"
              @mousedown.stop="!ly.fixed && $emit('row-drag-mouse-down', $event, ly, idx)"
            ><text class="row-drag-icon">≡</text></view>
            <view class="layer-dot" :class="ly.shape" :style="{ background: ly.color }" />
            <text class="layer-row-name">{{ ly.label }}</text>
            <view class="row-lock" :class="{ on: ly.locked }" @tap.stop="$emit('toggle-lock', ly.id)">
              <image class="row-lock-icon" :src="ly.locked ? lockStateIcon : unlockStateIcon" mode="aspectFit" />
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import type { Layer } from '../editor-core'
import lockStateIcon from '../../../assets/lock-state-locked.png'
import unlockStateIcon from '../../../assets/lock-state-unlocked.png'

defineProps<{
  open: boolean
  dragging: boolean
  drawerStyle: Record<string, string | number>
  layers: Layer[]
  selectedId: string
  reorderId: string
  reorderTargetVis: number
  settledReorderId: string
  layerOrderLabel: (idx: number) => string
  layerRowStyle: (layer: Layer, idx: number) => Record<string, string | number>
}>()

defineEmits<{
  (e: 'close'): void
  (e: 'touch-start', event: any): void
  (e: 'touch-move', event: any): void
  (e: 'touch-end', event: any): void
  (e: 'mouse-down', event: any): void
  (e: 'select-layer', id: string): void
  (e: 'toggle-lock', id: string): void
  (e: 'row-drag-touch-start', event: any, layer: Layer, idx: number): void
  (e: 'row-drag-touch-move', event: any): void
  (e: 'row-drag-touch-end'): void
  (e: 'row-drag-mouse-down', event: any, layer: Layer, idx: number): void
}>()
</script>
