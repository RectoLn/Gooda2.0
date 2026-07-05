<template>
  <view class="panel material-panel" :style="panelStyle">
    <view
      class="sheet-grabber"
      @tap.stop="$emit('toggle-collapsed')"
      @touchstart.stop="$emit('touch-start', $event)"
      @touchmove.stop="$emit('touch-move', $event)"
      @touchend.stop="$emit('touch-end', $event)"
      @touchcancel.stop="$emit('touch-end', $event)"
      @mousedown.stop="$emit('mouse-down', $event)"
    />
    <view class="cats">
      <view
        v-for="c in cats"
        :key="c"
        class="cat"
        :class="[{ on: category === c }, catClass[c]]"
        @tap="$emit('set-category', c)"
      >
        <image class="cat-handwriting" :src="catHandwriting[c]" mode="aspectFit" />
        <text class="cat-label">{{ c }}</text>
        <template v-if="category === c">
          <image class="cat-underline" :src="catUnderline" mode="aspectFit" />
          <text class="cat-sparkle">✦</text>
        </template>
      </view>
    </view>
    <view v-if="subCats.length > 1" class="subcats">
      <view
        v-for="s in subCats"
        :key="s"
        class="subcat"
        :class="{ on: subCat === s }"
        @tap="$emit('set-subcat', s)"
      >{{ s }}</view>
    </view>
    <!-- Custom-scrolled grid: we own the scroll (translateY) so the same touch
         stream can disambiguate tap / scroll / drag / long-press by duration,
         with no native scroll-view racing us on the drag-out gesture. -->
    <!-- Scroll gesture lives on the whole viewport so dragging anywhere in the card
         area works (gaps, labels, padding), not just on a card. Per-cell touchstart
         only records which item the gesture began on (for tap-select / drag-out). -->
    <view
      class="grid"
      @touchstart="onGridTouchStart"
      @touchmove="onGridTouchMove"
      @touchend="onGridTouchEnd"
      @touchcancel="onGridTouchCancel"
      @mousedown="onGridMouseDown"
    >
      <view class="grid-inner" :style="{ transform: `translateY(${scrollY}px)`, willChange: 'transform' }">
        <view
          v-for="(it, i) in rowItems"
          :key="i"
          v-memo="[it, i]"
          class="cell"
        >
          <view
            class="cell-card"
            @touchstart="onCellTouchStart($event, it)"
            @contextmenu.stop.prevent="onCellContextMenu($event, it)"
            @mousedown="onCellMouseDown($event, it)"
          >
            <view v-if="it.kind === 'none'" class="cell-none">
              <image class="cell-none-icon" :src="noneBoardIcon" mode="aspectFit" />
            </view>
            <view
              v-else-if="it.kind === 'mat' && it.img && it.mat.crop"
              class="cell-crop"
              :class="it.shape"
              :style="{ width: cellCropBox(it.mat).w + 'px', height: cellCropBox(it.mat).h + 'px' }"
            >
              <image
                :src="it.img"
                class="cell-crop-img"
                mode="scaleToFill"
                :style="cropInnerStyle(it.mat.crop, cellCropBox(it.mat).w, cellCropBox(it.mat).h)"
                :draggable="false"
                @contextmenu.stop.prevent
                @dragstart.stop.prevent
              />
            </view>
            <!-- board thumbnail: aspect-matched px box (flex-centered) + scaleToFill,
                 same technique as the crop cards / canvas board. Reliable centering on
                 Dimina (no <image> mode anchor quirk) and no CSS-background downscale
                 artifact (the 星空 noise band). Covers BOTH image and pure-color boards
                 so every 底板 card shares the same proportioned, centered preview. -->
            <view
              v-else-if="it.kind === 'board'"
              class="cell-board-box"
              :style="{ width: boardBox(it.aspect).w + 'px', height: boardBox(it.aspect).h + 'px', ...(it.img ? {} : { background: it.color }) }"
            >
              <image
                v-if="it.img"
                :src="it.img"
                class="cell-board-img"
                mode="scaleToFill"
                :draggable="false"
                @contextmenu.stop.prevent
                @dragstart.stop.prevent
              />
            </view>
            <image
              v-else-if="it.img"
              :src="it.img"
              class="cell-thumb"
              :class="[{ 'bag-thumb': it.kind === 'bag' }, it.kind === 'mat' ? ('thumb-' + it.shape) : '']"
              :mode="it.kind === 'bag' ? 'aspectFit' : 'aspectFill'"
              :draggable="false"
              @contextmenu.stop.prevent
              @dragstart.stop.prevent
            />
            <view v-else-if="it.color" class="cell-block" :class="it.shape" :style="{ background: it.color }">
              <text class="cell-heart">♥</text>
            </view>
            <view v-else-if="it.kind === 'spu'" class="cell-plus cell-spu"><text class="cell-spu-mark">✦</text></view>
            <view v-else class="cell-plus"><text>＋</text></view>
          </view>
          <text class="cell-label">{{ it.label }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import Taro from '@tarojs/taro'
import { cropInnerStyle, cropBoxFitPx } from '../editor-core'
import type { CatName, Mat, RowItem } from '../editor-core'
import noneBoardIcon from '../../../assets/none-board-icon.png'
import catTongbao from '../../../assets/tab-hand-tongbao.png'
import catGuzi from '../../../assets/tab-hand-guzi.png'
import catDiban from '../../../assets/tab-hand-diban.png'
import catZhuangshi from '../../../assets/tab-hand-zhuangshi.png'
import catUnderline from '../../../assets/tab-hand-underline.png'

const catHandwriting: Record<CatName, string> = {
  痛包: catTongbao,
  谷子: catGuzi,
  底板: catDiban,
  装饰: catZhuangshi,
}

const catClass: Record<CatName, string> = {
  痛包: 'cat-tongbao',
  谷子: 'cat-guzi',
  底板: 'cat-diban',
  装饰: 'cat-zhuangshi',
}

// Shelf crop preview box, in px. Mirrors the stage layer + drag-ghost technique
// (px box + px branch of cropInnerStyle) so the card renders the actual cropped
// region on the mini-program renderer instead of the wrong/whole image.
function cellCropBox(mat: Mat) {
  return cropBoxFitPx(mat.w, mat.h)
}

// Board preview box, in px, matched to the board's aspect and centered by the card's
// flex. scaleToFill fills it exactly (box aspect == image aspect → no distortion).
function boardBox(aspect?: number) {
  const a = aspect && aspect > 0 ? aspect : 426 / 300
  return cropBoxFitPx(a, 1, 66)
}

const props = defineProps<{
  panelStyle: Record<string, string | number>
  cats: readonly CatName[]
  category: CatName
  subCats: string[]
  subCat: string
  rowItems: RowItem[]
}>()

const emit = defineEmits<{
  (e: 'toggle-collapsed'): void
  (e: 'touch-start', event: any): void
  (e: 'touch-move', event: any): void
  (e: 'touch-end', event: any): void
  (e: 'mouse-down', event: any): void
  (e: 'set-category', category: CatName): void
  (e: 'set-subcat', subCat: string): void
  (e: 'select-item', item: RowItem): void
  (e: 'material-long-press', item: RowItem): void
  (e: 'material-drag-start', item: RowItem, x: number, y: number): void
  (e: 'material-drag-move', item: RowItem, x: number, y: number): void
  (e: 'material-drag-end', item: RowItem, x: number, y: number, moved: boolean): void
}>()

// Gesture model — all four intents distinguished by DURATION + movement, decided
// purely on the touch stream (no native scroll-view, no timer-armed drag):
//   quick tap (no move)              -> select (add material)
//   move quickly (< DRAG_HOLD_MS)    -> scroll the grid (we translateY it)
//   hold >= DRAG_HOLD_MS, then move  -> drag the material out to the canvas
//   hold >= LONGPRESS_MS, no move    -> long-press: open the edit/actions menu
const DRAG_HOLD_MS = 140     // rest this long before a move counts as a drag (≈0.1s)
const LONGPRESS_MS = 600     // rest this long without moving -> edit (0.6s)
const MOVE_SLOP = 8          // px of movement before we commit to scroll/drag

// Manual scroll state (translateY on .grid-inner).
const scrollY = ref(0)
let maxScroll = 0            // most-negative scroll offset (0 when content fits)

let g = {
  item: null as RowItem | null,
  sx: 0,
  sy: 0,
  startedAt: 0,
  scrollY0: 0,
  lastY: 0,
  vy: 0,
  moved: false,
  phase: 'idle' as 'idle' | 'pending' | 'scroll' | 'drag' | 'longpress',
}
let longPressTimer: any = 0
let momentumTimer: any = 0

function now() { return Date.now() }
function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)) }

// item may be null when a gesture begins on a gap/label/padding (scroll-only).
function canDragItem(item: RowItem | null) {
  return !!item && item.kind === 'mat'
}
// Any user-imported material (谷子 or 装饰) can be long-pressed to edit/delete.
function canEditItem(item: RowItem | null) {
  return !!item && item.kind === 'mat' && !!item.mat.assetId
}

// Measure the viewport vs content height so we know how far the grid can scroll.
// Taro/Dimina flattens components (no selector scoping), so a page-level query
// finds .grid/.grid-inner directly — .in(component) actually scopes to nothing here.
function measureScrollBounds(tries = 0) {
  try {
    Taro.createSelectorQuery()
      .select('.grid').boundingClientRect()
      .select('.grid-inner').boundingClientRect()
      .selectAll('.cell-card').boundingClientRect()
      .exec((res: any) => {
        const vh = (res && res[0] && res[0].height) || 0
        const ch = (res && res[1] && res[1].height) || 0
        const cells = (res && res[2] && res[2].length) || 0
        // The render thread updates a beat after the list changes; a stale read
        // still returns non-zero heights, so retry until the rendered cell count
        // matches the current list (i.e. the new category has actually laid out).
        if ((cells !== props.rowItems.length || !vh || !ch) && tries < 10) {
          setTimeout(() => measureScrollBounds(tries + 1), 60)
          return
        }
        maxScroll = Math.min(0, vh - ch)
        scrollY.value = clamp(scrollY.value, maxScroll, 0)
      })
  } catch (_) {}
}

onMounted(() => nextTick(() => measureScrollBounds()))
// New category / subcategory list -> reset to top and re-measure.
watch(() => props.rowItems, () => {
  scrollY.value = 0
  nextTick(() => measureScrollBounds())
})

function clearLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = 0 }
}
function stopMomentum() {
  if (momentumTimer) { clearTimeout(momentumTimer); momentumTimer = 0 }
}
function startMomentum() {
  let v = g.vy
  if (Math.abs(v) < 1.2) return
  const step = () => {
    v *= 0.92
    if (Math.abs(v) < 0.4) { momentumTimer = 0; return }
    const next = clamp(scrollY.value + v, maxScroll, 0)
    if (next === scrollY.value) { momentumTimer = 0; return } // hit an edge
    scrollY.value = next
    momentumTimer = setTimeout(step, 16)
  }
  step()
}

function beginGesture(item: RowItem | null, x: number, y: number) {
  stopMomentum()
  clearLongPress()
  g = {
    item, sx: x, sy: y, startedAt: now(), scrollY0: scrollY.value,
    lastY: y, vy: 0, moved: false, phase: 'pending',
  }
  if (canEditItem(item)) {
    longPressTimer = setTimeout(() => {
      longPressTimer = 0
      if (g.item === item && g.phase === 'pending' && !g.moved) {
        g.phase = 'longpress'
        emit('material-long-press', item)
        g.item = null
      }
    }, LONGPRESS_MS)
  }
}

// The gesture runs on a single stream owned by the grid viewport. g.item is set only
// when the touch began on a card (onCellTouchStart, which bubbles up first); a touch
// starting on a gap/label/padding has g.item = null → it can only scroll.
function moveGesture(x: number, y: number) {
  if (g.phase === 'idle') return
  const dx = x - g.sx
  const dy = y - g.sy
  const dist = Math.abs(dx) + Math.abs(dy)
  if (g.phase === 'pending') {
    if (dist <= MOVE_SLOP) return
    clearLongPress()
    g.moved = true
    const elapsed = now() - g.startedAt
    if (g.item && canDragItem(g.item) && elapsed >= DRAG_HOLD_MS) {
      // rested on a card, then moved -> drag the material out
      g.phase = 'drag'
      emit('material-drag-start', g.item, g.sx, g.sy)
      emit('material-drag-move', g.item, x, y)
    } else {
      // quick move (or not on a draggable card) -> scroll
      g.phase = 'scroll'
    }
  }
  if (g.phase === 'scroll') {
    g.vy = y - g.lastY
    g.lastY = y
    scrollY.value = clamp(g.scrollY0 + dy, maxScroll, 0)
  } else if (g.phase === 'drag' && g.item) {
    emit('material-drag-move', g.item, x, y)
  }
}

function endGesture(x: number, y: number) {
  clearLongPress()
  const phase = g.phase
  const item = g.item
  g.item = null
  g.phase = 'idle'
  if (phase === 'drag' && item) {
    emit('material-drag-end', item, x, y, true)
  } else if (phase === 'scroll') {
    startMomentum()
  } else if (phase === 'pending' && !g.moved && item) {
    // quick tap with no movement on a card -> select
    emit('select-item', item)
  }
}

// Set by a cell's touchstart/mousedown (fires before the grid's, via bubbling) so the
// grid handler knows the gesture began on a card and does not re-begin as a gap scroll.
let startedOnCell = false

function onCellTouchStart(event: any, item: RowItem) {
  const t = event.touches && event.touches[0]
  if (!t) return
  beginGesture(item, t.clientX, t.clientY)
  startedOnCell = true
}
function onGridTouchStart(event: any) {
  if (startedOnCell) { startedOnCell = false; return } // a card already began this gesture
  const t = event.touches && event.touches[0]
  if (!t) return
  beginGesture(null, t.clientX, t.clientY) // began on a gap/label -> scroll-only
}
function onGridTouchMove(event: any) {
  const t = event.touches && event.touches[0]
  if (!t) return
  moveGesture(t.clientX, t.clientY)
  if ((g.phase === 'drag' || g.phase === 'scroll') && event.preventDefault) event.preventDefault()
}
function onGridTouchEnd(event: any) {
  startedOnCell = false // safety net so the latch can never leak across gestures
  const t = event.changedTouches && event.changedTouches[0]
  if (t) endGesture(t.clientX, t.clientY)
  else endGesture(g.sx, g.sy)
}
function onGridTouchCancel() {
  clearLongPress()
  if (g.phase === 'scroll') startMomentum()
  g.item = null
  g.phase = 'idle'
  startedOnCell = false
}

// Desktop / mouse fallback (web test runtime): same single-stream model.
function onCellMouseDown(event: any, item: RowItem) {
  if (typeof window === 'undefined') return
  if (event.preventDefault) event.preventDefault()
  beginGesture(item, event.clientX, event.clientY)
  startedOnCell = true
}
function onGridMouseDown(event: any) {
  if (typeof window === 'undefined') return
  if (event.preventDefault) event.preventDefault()
  if (!startedOnCell) beginGesture(null, event.clientX, event.clientY)
  startedOnCell = false
  const move = (ev: MouseEvent) => moveGesture(ev.clientX, ev.clientY)
  const up = (ev: MouseEvent) => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    endGesture(ev.clientX, ev.clientY)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function onCellContextMenu(event: any, item: RowItem) {
  if (!canEditItem(item)) return
  if (event.preventDefault) event.preventDefault()
  if (event.stopPropagation) event.stopPropagation()
  emit('material-long-press', item)
}
</script>
