<template>
  <view v-if="open" class="import-editor-mask">
    <view class="import-editor-panel">
      <!-- top bar: actions live here (below the native capsule → no × conflict) -->
      <view class="import-topbar">
        <view class="import-topbar-back" @tap="$emit('cancel')"><text class="import-back-arrow">‹</text></view>
        <view class="import-topbar-btn primary" @tap="$emit('confirm')">{{ draft.editAssetId ? '保存' : '导入' }}</view>
      </view>
      <!-- big crop stage — takes all height left over by the top bar + drawer -->
      <view class="import-stage-wrap">
        <!-- hidden probe: widthFix makes the rendered height follow the image's
             natural aspect, so we can read the aspect via createSelectorQuery
             without any dimension API (getImageInfo is unimplemented in Dimina). -->
        <image v-if="crop.imageW <= 1" :src="previewSrc" mode="widthFix" class="import-measure-img" style="position:absolute;left:-9999px;top:0;width:300px" />
        <view
          class="import-editor-crop-stage"
          :style="stageStyle"
          @touchstart.stop="$emit('crop-touch-start', $event)"
          @touchmove.stop="$emit('crop-touch-move', $event)"
          @touchend.stop="$emit('crop-touch-end', $event)"
          @touchcancel.stop="$emit('crop-touch-end', $event)"
          @mousedown.stop="$emit('crop-mouse-down', $event)"
        >
          <image
            :src="previewSrc"
            mode="scaleToFill"
            class="import-editor-crop-img dim"
            :style="frameStyle"
          />
          <view class="import-crop-outline" :class="draft.shape" :style="cropStyle">
            <view class="import-crop-clip">
              <image
                :src="previewSrc"
                mode="scaleToFill"
                class="import-editor-crop-img bright"
                :style="imageStyle"
              />
            </view>
            <view class="import-crop-dot top" @touchstart.stop="$emit('handle-touch-start', $event, 'top')" @mousedown.stop="$emit('handle-mouse-down', $event, 'top')" />
            <view class="import-crop-dot right" @touchstart.stop="$emit('handle-touch-start', $event, 'right')" @mousedown.stop="$emit('handle-mouse-down', $event, 'right')" />
            <view class="import-crop-dot bottom" @touchstart.stop="$emit('handle-touch-start', $event, 'bottom')" @mousedown.stop="$emit('handle-mouse-down', $event, 'bottom')" />
            <view class="import-crop-dot left" @touchstart.stop="$emit('handle-touch-start', $event, 'left')" @mousedown.stop="$emit('handle-mouse-down', $event, 'left')" />
            <view class="import-crop-dot corner tl" @touchstart.stop="$emit('handle-touch-start', $event, 'tl')" @mousedown.stop="$emit('handle-mouse-down', $event, 'tl')" />
            <view class="import-crop-dot corner tr" @touchstart.stop="$emit('handle-touch-start', $event, 'tr')" @mousedown.stop="$emit('handle-mouse-down', $event, 'tr')" />
            <view class="import-crop-dot corner bl" @touchstart.stop="$emit('handle-touch-start', $event, 'bl')" @mousedown.stop="$emit('handle-mouse-down', $event, 'bl')" />
            <view class="import-crop-resize" @touchstart.stop="$emit('handle-touch-start', $event, 'br')" @mousedown.stop="$emit('handle-mouse-down', $event, 'br')" />
          </view>
        </view>
        <!-- 智能识别：悬浮在裁剪图右下角的白胶囊（离图近但不遮挡裁剪预览） -->
        <view class="import-ai-btn" :class="{ loading: aiState === 'loading', undo: aiState === 'done' }" @tap="$emit('smart-recognition')">
          <text class="import-ai-icon">{{ aiState === 'done' ? '↺' : '✦' }}</text>
          <text>{{ aiState === 'loading' ? '识别中…' : aiState === 'done' ? '还原原图' : '智能识别' }}</text>
        </view>
        <view v-if="devTools" style="position:absolute;left:4px;bottom:2px;z-index:9999;font-size:20rpx;color:#ff0;background:rgba(0,0,0,.55);padding:2rpx 6rpx">img {{ crop.imageW }}x{{ crop.imageH }} · stage {{ crop.stageW }}x{{ crop.stageH }} · max {{ crop.stageMaxW }}x{{ crop.stageMaxH }} · via {{ measureTag }} · sel {{ Math.round(crop.x) }},{{ Math.round(crop.y) }},{{ Math.round(crop.w) }},{{ Math.round(crop.h) }}</view>
      </view>
      <!-- bottom drawer: classification fields (tap the grabber to fold away) -->
      <view class="import-drawer" :class="{ collapsed: drawerCollapsed }">
        <view class="import-drawer-grabber" @tap="$emit('update:drawerCollapsed', !drawerCollapsed)">
          <view class="import-drawer-handle" />
        </view>
        <view class="import-drawer-body">
          <view class="import-editor-field">
            <text class="import-editor-label">名称</text>
            <input
              class="import-editor-input"
              type="text"
              maxlength="12"
              :value="draft.label"
              @input="$emit('label-input', $event)"
            />
          </view>
          <view class="import-editor-field">
            <text class="import-editor-label">类型</text>
            <view class="import-editor-types">
              <view
                v-for="item in subcats"
                :key="item"
                class="import-editor-type"
                :class="{ on: draft.sub === item }"
                @tap="$emit('set-sub', item)"
              >{{ item }}</view>
            </view>
          </view>
          <view class="import-editor-field">
            <text class="import-editor-label">选区</text>
            <view class="import-editor-shapes">
              <view
                v-for="item in shapeOptions"
                :key="item.value"
                class="import-editor-shape"
                :class="[{ on: draft.shape === item.value }, item.value]"
                @tap="$emit('set-shape', item.value)"
              >
                <view class="import-shape-icon" :class="item.value" />
                <text>{{ item.label }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { Shape } from '../editor-core'

type ImportCropState = {
  imageW: number; imageH: number
  stageW: number; stageH: number; stageMaxW: number; stageMaxH: number
  x: number; y: number; w: number; h: number
}
type ImportDraftState = { shape: Shape; editAssetId: string; label: string; sub: string }
type StyleMap = Record<string, string | number>

defineProps<{
  open: boolean
  previewSrc: string
  crop: ImportCropState
  draft: ImportDraftState
  stageStyle: StyleMap
  frameStyle: StyleMap
  cropStyle: StyleMap
  imageStyle: StyleMap
  subcats: string[]
  shapeOptions: { label: string; value: Shape }[]
  drawerCollapsed: boolean
  aiState: 'idle' | 'loading' | 'done'
  devTools: boolean
  measureTag: string
}>()

defineEmits<{
  (e: 'cancel'): void
  (e: 'confirm'): void
  (e: 'crop-touch-start', event: any): void
  (e: 'crop-touch-move', event: any): void
  (e: 'crop-touch-end', event: any): void
  (e: 'crop-mouse-down', event: any): void
  (e: 'handle-touch-start', event: any, handle: string): void
  (e: 'handle-mouse-down', event: any, handle: string): void
  (e: 'label-input', event: any): void
  (e: 'set-sub', sub: string): void
  (e: 'set-shape', shape: Shape): void
  (e: 'smart-recognition'): void
  (e: 'update:drawerCollapsed', value: boolean): void
}>()
</script>
