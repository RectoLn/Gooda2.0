<template>
  <view v-if="selected" class="inspector">
    <view class="nudge-row">
      <view class="nudge-group">
        <view
          class="nudge-btn zoom-btn"
          @touchstart.stop.prevent="$emit('scale-step-touch-start', -1)"
          @touchend.stop="$emit('step-touch-end')"
          @touchcancel.stop="$emit('step-touch-end')"
          @mousedown.stop="$emit('scale-step-mouse-down', -1)"
        >⊖</view>
        <input
          class="nudge-input"
          type="text"
          :value="scaleFieldValue"
          @focus="$emit('nudge-focus', 'scale')"
          @input="$emit('scale-input', $event)"
          @blur="$emit('commit-input')"
          @confirm="$emit('commit-input')"
        />
        <view
          class="nudge-btn zoom-btn"
          @touchstart.stop.prevent="$emit('scale-step-touch-start', 1)"
          @touchend.stop="$emit('step-touch-end')"
          @touchcancel.stop="$emit('step-touch-end')"
          @mousedown.stop="$emit('scale-step-mouse-down', 1)"
        >⊕</view>
      </view>
      <view class="nudge-group">
        <view
          class="nudge-btn"
          @touchstart.stop.prevent="$emit('rotate-step-touch-start', -1)"
          @touchend.stop="$emit('step-touch-end')"
          @touchcancel.stop="$emit('step-touch-end')"
          @mousedown.stop="$emit('rotate-step-mouse-down', -1)"
        >↺</view>
        <input
          class="nudge-input"
          type="text"
          :value="rotationFieldValue"
          @focus="$emit('nudge-focus', 'rotation')"
          @input="$emit('rotation-input', $event)"
          @blur="$emit('commit-input')"
          @confirm="$emit('commit-input')"
        />
        <view
          class="nudge-btn"
          @touchstart.stop.prevent="$emit('rotate-step-touch-start', 1)"
          @touchend.stop="$emit('step-touch-end')"
          @touchcancel.stop="$emit('step-touch-end')"
          @mousedown.stop="$emit('rotate-step-mouse-down', 1)"
        >↻</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Layer } from '../editor-core'

defineProps<{
  selected?: Layer
  scaleFieldValue: string
  rotationFieldValue: string
}>()

defineEmits<{
  (e: 'scale-step-touch-start', dir: number): void
  (e: 'rotate-step-touch-start', dir: number): void
  (e: 'step-touch-end'): void
  (e: 'scale-step-mouse-down', dir: number): void
  (e: 'rotate-step-mouse-down', dir: number): void
  (e: 'nudge-focus', field: 'scale' | 'rotation'): void
  (e: 'scale-input', event: any): void
  (e: 'rotation-input', event: any): void
  (e: 'commit-input'): void
}>()
</script>
