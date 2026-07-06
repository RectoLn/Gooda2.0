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
      <!-- bottom drawer: classification fields — 拖 handle 上拉展开 / 下拉收起，
           轻点亦可折叠切换 -->
      <view class="import-drawer" :class="{ collapsed: drawerCollapsed, dragging: grabDragging }">
        <view
          class="import-drawer-grabber"
          @tap="onGrabTap"
          @touchstart.stop="onGrabTouchStart"
          @touchmove.stop="onGrabTouchMove"
          @touchend.stop="onGrabTouchEnd"
          @touchcancel.stop="onGrabTouchEnd"
          @mousedown.stop="onGrabMouseDown"
        >
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
import { ref } from 'vue'
import type { Shape } from '../editor-core'

type ImportCropState = {
  imageW: number; imageH: number
  stageW: number; stageH: number; stageMaxW: number; stageMaxH: number
  x: number; y: number; w: number; h: number
}
type ImportDraftState = { shape: Shape; editAssetId: string; label: string; sub: string }
type StyleMap = Record<string, string | number>

const props = defineProps<{
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

const emit = defineEmits<{
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

// ── 抽屉推拉：拖 handle 上拉展开 / 下拉收起（阈值判定于松手时），轻点则折叠切换。
// 与素材货架同一套单流手势模型：touch 为主，H5 用 window 监听兜底。
const DRAG_SLOP = 18        // 位移超过它才算「拖」（否则交给 @tap）
const FOLD_THRESHOLD = 26   // 拖动方向上超过它才切换折叠态
const grabDragging = ref(false)
let grab = { y0: 0, moved: false, decided: false }

function grabBegin(y: number) {
  grab = { y0: y, moved: false, decided: false }
  grabDragging.value = true
}
function grabMove(y: number) {
  if (!grabDragging.value) return
  const dy = y - grab.y0
  if (!grab.moved && Math.abs(dy) > DRAG_SLOP) grab.moved = true
  if (grab.moved && !grab.decided) {
    // 展开态下拉 → 收起；收起态上拉 → 展开
    if (dy > FOLD_THRESHOLD && !props.drawerCollapsed) {
      grab.decided = true
      emit('update:drawerCollapsed', true)
    } else if (dy < -FOLD_THRESHOLD && props.drawerCollapsed) {
      grab.decided = true
      emit('update:drawerCollapsed', false)
    }
  }
}
function grabEnd() {
  grabDragging.value = false
}

function onGrabTap() {
  // 拖动已在 move 时切换过折叠态，就不再让轻点重复切换
  if (grab.moved) { grab.moved = false; return }
  emit('update:drawerCollapsed', !props.drawerCollapsed)
}
function onGrabTouchStart(e: any) {
  const t = e && e.touches && e.touches[0]
  if (!t) return
  grabBegin(t.clientY)
}
function onGrabTouchMove(e: any) {
  const t = e && e.touches && e.touches[0]
  if (!t) return
  grabMove(t.clientY)
}
function onGrabTouchEnd() { grabEnd() }
// H5 鼠标：只做拖动判定；点击交给 @tap(click)，避免与 up 双触发折叠
function onGrabMouseDown(e: any) {
  if (typeof window === 'undefined') return
  grabBegin(e.clientY)
  const move = (ev: MouseEvent) => grabMove(ev.clientY)
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    grabEnd()
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
</script>
