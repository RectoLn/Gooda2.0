<template>
  <view
    class="page"
    :class="{ 'has-selection': selected, 'pure-view': isCollapsed, 'shelf-tall': isTall, 'stage-zoomed': stageZoomed }"
    :style="{ height: pageH + 'px', minHeight: pageH + 'px', backgroundImage: `url(${appWaterBg})` }"
  >
    <EditorTopbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      @undo="undo"
      @redo="redo"
      @history="openExportHistory"
      @export="exportImage"
    />

    <!-- 满态遮罩：抽屉外变暗；点按回退到 open。位于痛包/工具栏之上、素材面板之下。 -->
    <view class="shelf-backdrop" :class="{ show: isTall }" @tap="collapseShelf" />

    <view
      class="stage-wrap"
      @touchstart="onStageWrapTouchStart"
      @touchmove="onStageWrapTouchMove"
      @touchend="onStageWrapTouchEnd"
      @touchcancel="onStageWrapTouchEnd"
      @mousedown="onStageWrapMouseDown"
    >
      <StageToolRail
        :stage-zoomed="stageZoomed"
        :show-grid="showGrid"
        :layer-drawer-open="showLayerDrawer"
        :dragging="layerButtonMoving"
        :collapsed="isCollapsed"
        :rail-style="layerButtonStyle"
        @toggle-zoom="runRailAction(toggleStageZoom)"
        @toggle-grid="runRailAction(toggleGrid)"
        @fit-selection="runRailAction(fitSelection)"
        @toggle-layers="onLayerButtonTap"
        @touch-start="onLayerButtonTouchStart"
        @touch-move="onLayerButtonTouchMove"
        @touch-end="onLayerButtonTouchEnd"
        @mouse-down="onLayerButtonMouseDown"
      />
      <view class="stage" :style="{ width: cw + 'px', height: ch + 'px' }" @tap.stop="onStageTap">
        <view
          class="window"
          :class="{ grid: showGrid }"
          :style="{ left: win.x + 'px', top: win.y + 'px', width: win.w + 'px', height: win.h + 'px' }"
        >
          <image
            class="fill bag-back-fill"
            :src="bags[curBag].back"
            mode="scaleToFill"
            :style="bagBackFillStyle"
          />
          <view
            v-if="hasBoardLayer"
            class="layer board-edit-layer"
            :class="{ selected: selectedId === BOARD_LAYER_ID, locked: boardLayer.locked }"
            :style="layerStyle(boardLayer, -9)"
            @tap.stop="onLayerTap(boardLayer)"
            @touchstart.stop="onTouchStart($event, boardLayer)"
            @touchmove.stop="onTouchMove($event, boardLayer)"
            @touchend.stop="onTouchEnd"
            @mousedown.stop="onMouseDown($event, boardLayer)"
          >
            <view
              class="layer-inner board-layer-inner"
              :style="boardLayerInnerStyle"
            >
              <image
                v-if="boardLayer.src"
                :src="boardLayer.src"
                class="board-layer-img"
                mode="scaleToFill"
                :draggable="false"
                @dragstart.stop.prevent
                @contextmenu.stop.prevent
              />
            </view>
          </view>
          <view
            v-for="(ly, i) in doc.layers"
            :key="ly.id"
            class="layer"
            :class="{ selected: ly.id === selectedId, locked: ly.locked }"
            :style="layerStyle(ly, i)"
            @tap.stop="onLayerTap(ly)"
            @touchstart.stop="onTouchStart($event, ly)"
            @touchmove.stop="onTouchMove($event, ly)"
            @touchend.stop="onTouchEnd"
            @mousedown.stop="onMouseDown($event, ly)"
          >
            <view
              class="layer-inner"
              :class="[ly.shape, { 'has-image': !!ly.src }]"
              :style="{ background: ly.src ? 'transparent' : ly.color, opacity: ly.opacity, transform: ly.flipX ? 'scaleX(-1)' : 'none' }"
            >
              <image
                v-if="ly.src && ly.crop"
                :src="ly.src"
                class="layer-img"
                mode="scaleToFill"
                :style="cropInnerStyle(ly.crop, ly.w, ly.h)"
                :draggable="false"
                @dragstart.stop.prevent
                @contextmenu.stop.prevent
              />
              <image
                v-else-if="ly.src"
                :src="ly.src"
                class="layer-img"
                mode="aspectFill"
                :draggable="false"
                @dragstart.stop.prevent
                @contextmenu.stop.prevent
              />
              <text v-else class="layer-label">{{ ly.label }}</text>
            </view>
          </view>
        </view>

        <image class="bag-front" :src="bags[curBag].front" mode="scaleToFill" />
        <SelectionOverlay
          v-if="selected"
          :selected="selected"
          :dragging="layerDragging"
          :overlay-style="selectedHandleStyle(selected)"
          @duplicate="duplicateLayer"
          @remove="removeLayer"
          @mirror="mirrorLayer"
          @rotate-touch-start="onRotateHandleTouchStart"
          @rotate-touch-move="onRotateHandleTouchMove"
          @rotate-touch-end="onRotateHandleTouchEnd"
          @rotate-mouse-down="onRotateHandleMouseDown"
        />
      </view>

    </view>

    <view class="bottom-dock" :class="{ collapsed: isCollapsed, tall: isTall, dragging: sheetDragging }">
      <NudgeInspector
        :selected="selected"
        :scale-field-value="scaleFieldValue"
        :rotation-field-value="rotationFieldValue"
        @scale-step-touch-start="(dir) => startStepHold(applyScaleStep, dir)"
        @rotate-step-touch-start="(dir) => startStepHold(applyRotateStep, dir)"
        @step-touch-end="stopStepHold"
        @scale-step-mouse-down="(dir) => onStepMouseDown(applyScaleStep, dir)"
        @rotate-step-mouse-down="(dir) => onStepMouseDown(applyRotateStep, dir)"
        @nudge-focus="onNudgeFocus"
        @scale-input="onScaleInput"
        @rotation-input="onRotationInput"
        @commit-input="commitNudgeInput"
      />

      <MaterialShelf
        :panel-style="materialPanelStyle"
        :cats="cats"
        :category="category"
        :sub-cats="subCats"
        :sub-cat="subCat"
        :row-items="rowItems"
        @toggle-collapsed="toggleMaterialCollapsed"
        @touch-start="onSheetTouchStart"
        @touch-move="onSheetTouchMove"
        @touch-end="onSheetTouchEnd"
        @mouse-down="onSheetMouseDown"
        @set-category="setCategory"
        @set-subcat="subCat = $event"
        @select-item="onItem"
        @material-long-press="openMaterialAssetActions"
        @material-drag-start="onMaterialDragStart"
        @material-drag-move="onMaterialDragMove"
        @material-drag-end="onMaterialDragEnd"
      />
    </view>

    <view
      v-if="materialDragGhost.visible"
      class="material-drag-ghost"
      :style="{
        left: materialDragGhost.x + 'px',
        top: materialDragGhost.y + 'px',
        width: materialDragGhost.w + 'px',
        height: materialDragGhost.h + 'px',
      }"
    >
      <view
        class="material-drag-piece"
        :class="materialDragGhost.shape"
        :style="{ background: materialDragGhost.color }"
      >
        <image v-if="materialDragGhost.src && materialDragGhost.crop" :src="materialDragGhost.src" class="material-drag-img" mode="scaleToFill" :style="cropInnerStyle(materialDragGhost.crop, materialDragGhost.w, materialDragGhost.h)" />
        <image v-else-if="materialDragGhost.src" :src="materialDragGhost.src" class="material-drag-img" mode="aspectFill" />
        <text v-else class="material-drag-label">{{ materialDragGhost.label }}</text>
      </view>
    </view>

    <LayerDrawer
      :open="showLayerDrawer"
      :dragging="drawerDragging"
      :drawer-style="drawerStyle"
      :layers="visibleLayerList"
      :selected-id="selectedId"
      :reorder-id="reorderId"
      :reorder-target-vis="reorderTargetVis"
      :settled-reorder-id="settledReorderId"
      :layer-order-label="layerOrderLabel"
      :layer-row-style="layerRowStyle"
      @close="toggleLayerDrawer"
      @touch-start="onDrawerTouchStart"
      @touch-move="onDrawerTouchMove"
      @touch-end="onDrawerTouchEnd"
      @mouse-down="onDrawerMouseDown"
      @select-layer="selectLayer"
      @toggle-lock="toggleLayerLock"
      @row-drag-touch-start="onRowDragTouchStart"
      @row-drag-touch-move="onRowDragTouchMove"
      @row-drag-touch-end="onRowDragTouchEnd"
      @row-drag-mouse-down="onRowDragMouseDown"
    />

    <AssetActionSheet
      :open="materialAssetActionOpen"
      :label="materialAssetActionLabel"
      @edit="editMaterialAsset"
      @delete="deleteMaterialAsset"
      @close="closeMaterialAssetActions"
    />

    <SpuSearchPanel
      :open="spuSearchOpen"
      :service-mode="spuService.mode"
      :keyword="spuKeyword"
      :loading="spuLoading"
      :error="spuError"
      :searched="spuSearched"
      :items="spuItems"
      :importing-id="spuImportingId"
      :owned-ids="ownedSpuIds"
      @close="closeSpuSearch"
      @keyword-input="onSpuKeywordInput"
      @search="runSpuSearch"
      @import-item="importSpuFromLibrary"
    />

    <canvas type="2d" id="exportCanvas" canvas-id="exportCanvas" class="export-canvas" />
    <ExportHistoryPanel
      :open="exportHistoryOpen"
      :records="exportHistory"
      @close="closeExportHistory"
      @preview="previewExportHistory"
    />
    <ImportCropEditor
      :open="importEditorOpen"
      :preview-src="importPreviewSrc"
      :crop="importCrop"
      :draft="importDraft"
      :stage-style="importCropStageStyle"
      :frame-style="importCropFrameStyle"
      :crop-style="importCropStyle"
      :image-style="importCropImageStyle"
      :subcats="importDraftSubcats"
      :shape-options="importShapeOptions"
      v-model:drawer-collapsed="importDrawerCollapsed"
      :dev-tools="devTools"
      :measure-tag="measureTag"
      @cancel="cancelImportEditor"
      @confirm="confirmImportEditor"
      @crop-touch-start="onImportCropTouchStart"
      @crop-touch-move="onImportCropTouchMove"
      @crop-touch-end="onImportCropTouchEnd"
      @crop-mouse-down="onImportCropMouseDown"
      @handle-touch-start="onImportCropHandleTouchStart"
      @handle-mouse-down="onImportCropHandleMouseDown"
      @label-input="onImportLabelInput"
      @set-sub="setImportDraftSub"
      @set-shape="setImportDraftShape"
      @smart-recognition="onSmartRecognition"
    />
    <ExportPreview
      :open="resultPreviewOpen"
      :src="resultSrc"
      @close="closeExportPreview"
      @save="saveExportImage"
    />
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, computed, nextTick, onMounted, watch } from 'vue'
import Taro from '@tarojs/taro'
import EditorTopbar from './components/EditorTopbar.vue'
import StageToolRail from './components/StageToolRail.vue'
import SelectionOverlay from './components/SelectionOverlay.vue'
import NudgeInspector from './components/NudgeInspector.vue'
import MaterialShelf from './components/MaterialShelf.vue'
import LayerDrawer from './components/LayerDrawer.vue'
import AssetActionSheet from './components/AssetActionSheet.vue'
import ExportHistoryPanel from './components/ExportHistoryPanel.vue'
import ExportPreview from './components/ExportPreview.vue'
import ImportCropEditor from './components/ImportCropEditor.vue'
import SpuSearchPanel from './components/SpuSearchPanel.vue'
import { exportEditorImage } from './editor-export'
import {
  STORAGE_KEY, STORAGE_VERSION, EXPORT_SIZE, BAG_RATIO, BOARD_LAYER_ID, WIN, ROW_PITCH,
  boards, bags, cats, decor, SUBCATS,
  clamp, dist, ang, cropInnerStyle,
  boundedScale, normalizeRotation, displayRotation, formatScale, formatRotation,
} from './editor-core'
import type { Mat, Layer, Snapshot, RowItem, CatName, BoardTransform, Shape, ImgCrop, ExportHistoryRecord } from './editor-core'
import {
  normalizeImageSize, imageSizeFromFile, imageSizeFromDataUrl,
} from './image-measure'
import { createKvStore } from '../../services/storage/kv-store'
import { cropImageFrame, normalizeCropRect, denormalizeCropRect } from './crop-math'
import { measureRect } from '../../platform/measure'
import { imageSizeFromLocalFile, imageSourceToDataUrl, remoteImageToDataUrl, saveImageNativeSmart } from '../../platform/image-io'
import { resolveQiandaoSpuService, QiandaoSpuServiceError } from '../../services/qiandao/client'
import { bestSpuImage, inferGuziSubFromSpu } from '../../services/qiandao/types'
import type { QiandaoSpuSummary } from '../../services/qiandao/types'
import appWaterBg from '../../assets/app-water-bg.jpg'

const LAYER_LONG_PRESS_MS = 1600
// 素材抽屉三态露出高度（px）：合(peek) / 开 / 满。满态高度按屏高比例算。
const SHEET_PEEK_H = 86
const SHEET_OPEN_H = 300
const LAYER_RAIL_TOP_GUARD = 98
const EXPORT_HISTORY_KEY = `${STORAGE_KEY}-export-history`
const EXPORT_HISTORY_LIMIT = 8
const EXPORT_HISTORY_DB_NAME = 'gooda-export-history'
const EXPORT_HISTORY_STORE = 'exports'
const USER_ASSETS_KEY = `${STORAGE_KEY}-user-assets`
const USER_ASSETS_DB_NAME = 'gooda-user-assets'
const USER_ASSETS_STORE = 'images'

// getSystemInfoSync() 在 Dimina 原生运行时返回 null（该 API 已废弃），
// 直接取 .windowWidth 会白屏。优先用现代的 getWindowInfo()，逐级兜底。
function safeWindowInfo() {
  const fns = ['getWindowInfo', 'getSystemInfoSync']
  for (const fn of fns) {
    try {
      if (typeof (Taro as any)[fn] === 'function') {
        const r = (Taro as any)[fn]()
        if (r && (r.windowWidth || r.screenWidth)) return r
      }
    } catch (_) { /* ignore and try next */ }
  }
  return { windowWidth: 375, windowHeight: 760, statusBarHeight: 20 }
}
const sys: any = safeWindowInfo()
function viewportSize() {
  // H5 uses the live window box; native (weapp/Dimina) must use Taro system info,
  // since the Taro window shim reports 0/undefined for innerWidth.
  if (process.env.TARO_ENV === 'h5' && typeof window !== 'undefined') {
    return { w: window.innerWidth || 375, h: window.innerHeight || 760 }
  }
  return { w: sys.windowWidth || 375, h: sys.windowHeight || 760 }
}
const vp = viewportSize()
// Dimina exposes windowHeight as the webview content height (760 on iPhone 13),
// while the rendered mini-app background still needs to cover the full screen.
// When screenHeight is absent, reserve the native status/capsule band so the
// fixed root does not stop early and reveal the host white bottom.
const nativeChromeReserve = process.env.TARO_ENV === 'h5' ? 0 : 84
const pageH = Math.max(sys.screenHeight || 0, (sys.windowHeight || vp.h || 760) + nativeChromeReserve)
const cw = Math.min(vp.w - 8, Math.floor((vp.h - 300) * 0.84), 430)
const ch = Math.round(cw * BAG_RATIO)
// 满态抽屉高度：屏高的 ~72%，并夹在 [420, 屏高-120] 之间，确保比 open(300) 高、
// 又给上方缩小后的痛包留出空间。面板始终以该高度绝对定位，靠 translateY 控制露出。
const SHEET_TALL_H = Math.round(Math.min(Math.max((vp.h || 760) * 0.72, 420), (vp.h || 760) - 120))
const win = reactive({
  x: WIN.l * cw, y: WIN.t * ch,
  w: (WIN.r - WIN.l) * cw, h: (WIN.b - WIN.t) * ch,
})

const curBoard = ref(-1)
const curBag = ref(0)
const showGrid = ref(false)
const stageZoomed = ref(false)
// Flip locally while diagnosing Dimina runtime issues; keep false for release.
const devTools = false
// http source: the byte parser cannot read it (like difile:// on device) → forces the probe path.
const category = ref<CatName>('谷子')
const subCat = ref('全部')
const subCats = computed(() => SUBCATS[category.value] || ['全部'])
function setCategory(c: CatName) {
  category.value = c
  subCat.value = '全部'
  if (shelfState.value === 'collapsed') shelfState.value = 'open'
}
const doc = reactive<{ layers: Layer[] }>({ layers: [] })
const selectedId = ref('')
const resultSrc = ref('')
const resultPreviewOpen = ref(false)
const exportHistoryOpen = ref(false)
const importEditorOpen = ref(false)
// The crop stage measures + seeds asynchronously after the editor opens. Until that
// finishes, importCrop does not yet reflect the real selection, so saving early would
// persist a wrong/default crop. Gate confirm on this flag.
const importReady = ref(false)
// True while confirmImportEditor is mid-save (async encode/persist) — blocks re-entry.
const importSaving = ref(false)
const importDrawerCollapsed = ref(false)
const importDraft = reactive({
  src: '',
  storedSrc: '',
  editAssetId: '',
  type: '谷子' as '谷子' | '装饰',
  sub: '其他',
  label: '',
  shape: 'rect' as Shape,
  sourceW: 0,
  sourceH: 0,
  // 非空 = 本次导入来自千岛资料库：confirm 时写入 source:'spu' + spuId
  spuId: '',
})
const importDraftSubcats = computed(() => (SUBCATS[importDraft.type] || ['全部']).filter((item) => item !== '全部'))
const importPreviewSrc = computed(() => importDraft.src || importDraft.storedSrc)
const importShapeOptions: { label: string; value: Shape }[] = [
  { label: '矩形', value: 'rect' },
  { label: '圆形', value: 'circle' },
  { label: '圆角', value: 'round' },
]
type ImportCropHandle = 'move' | 'top' | 'right' | 'bottom' | 'left' | 'tl' | 'tr' | 'bl' | 'br'
const importCrop = reactive({
  stageX: 0,
  stageY: 0,
  stageMaxW: 314,
  stageMaxH: 330,
  stageW: 0,
  stageH: 178,
  imageW: 0,
  imageH: 0,
  x: 62,
  y: 20,
  w: 190,
  h: 138,
})
let importCropDrag = {
  active: false,
  handle: 'move' as ImportCropHandle,
  sx: 0,
  sy: 0,
  x: 0,
  y: 0,
  w: 0,
  h: 0,
}
const importCropStyle = computed(() => ({
  // move via transform (compositor) instead of left/top (reflow) for a snappier
  // selection drag; width/height still drive resize. Children (handles, clip)
  // track the transform, and the bright image counters x/y to stay stage-aligned.
  left: '0px',
  top: '0px',
  width: `${importCrop.w}px`,
  height: `${importCrop.h}px`,
  transform: `translate(${importCrop.x}px, ${importCrop.y}px)`,
  willChange: 'transform',
}))
function importImageAspect() {
  const size = normalizeImageSize(importCrop.imageW, importCrop.imageH)
    || normalizeImageSize(importDraft.sourceW, importDraft.sourceH)
  if (size) return size.width / size.height
  const fallback = fallbackImportImageSize()
  return fallback.width / fallback.height
}
// Stage size the style WANTS: matched to the TRUE image aspect so the image fills
// it (no black bars), loosely clamped for absurd panoramas. Kept as a plain function
// so readImportCropStageRect can compare the RENDERED rect against it (see below).
function expectedImportStageSize() {
  const maxW = importCrop.stageMaxW || importCrop.stageW || 314
  const aspect = clamp(importImageAspect() || 1, 0.42, 2.4)
  const maxH = importCrop.stageMaxH || 330
  const minH = 150
  let w = maxW
  let h = Math.round(w / aspect)
  if (h > maxH) {
    h = maxH
    w = Math.round(h * aspect)
  } else if (h < minH) {
    h = minH
    w = Math.round(h * aspect)
  }
  w = Math.min(w, maxW)
  return { w, h }
}
const importCropStageStyle = computed(() => {
  const { w, h } = expectedImportStageSize()
  return {
    width: `${w}px`,
    height: `${h}px`,
  }
})
const importCropFrameStyle = computed(() => {
  const frame = importCropImageFrame()
  return {
    left: `${frame.x}px`,
    top: `${frame.y}px`,
    width: `${frame.w}px`,
    height: `${frame.h}px`,
  }
})
const importCropImageStyle = computed(() => ({
  ...importCropFrameStyle.value,
  transform: `translate(${-importCrop.x}px, ${-importCrop.y}px)`,
}))
type UserAsset = {
  id: string
  type: '谷子' | '装饰'
  sub: string
  label: string
  color: string
  w: number
  h: number
  shape: Shape
  src: string
  crop?: ImgCrop
  source: 'import' | 'spu'
  spuId?: string
  createdAt: number
  updatedAt: number
}
type StoredUserAsset = Omit<UserAsset, 'src'> & { src?: string }
type StoredExportHistoryRecord = Omit<ExportHistoryRecord, 'src'> & { src?: string }
const userAssets = ref<UserAsset[]>([])
const exportHistory = ref<ExportHistoryRecord[]>([])
const materialAssetActionOpen = ref(false)
const materialAssetActionId = ref('')
const materialAssetActionLabel = computed(() => {
  const asset = userAssets.value.find((item) => item.id === materialAssetActionId.value)
  return asset?.label || '素材'
})
const history = ref<Snapshot[]>([])
const redoStack = ref<Snapshot[]>([])
const showLayerDrawer = ref(false)
const layerButtonMoving = ref(false)
const layerDragging = ref(false)
// 素材抽屉三态：合 / 开 / 满。isCollapsed 保留给沿用旧 collapsed 语义的地方。
type ShelfState = 'collapsed' | 'open' | 'tall'
const shelfState = ref<ShelfState>('open')
const isCollapsed = computed(() => shelfState.value === 'collapsed')
const isTall = computed(() => shelfState.value === 'tall')
const sheetDragging = ref(false)
const sheetDragY = ref(0)
const drawerDragging = ref(false)
const drawerDragY = ref(0)
const materialDragGhost = reactive({
  visible: false,
  x: 0,
  y: 0,
  w: 56,
  h: 56,
  color: '#fff',
  label: '',
  shape: 'rect',
  src: '',
  crop: undefined as ImgCrop | undefined,
})
const layerButton = reactive({ x: 0, y: 0 })
const reorderId = ref('')
const editingField = ref<'' | 'scale' | 'rotation'>('')
const editingText = ref('')
const reorderTargetVis = ref(-1)
const reorderOffsetY = ref(0)
const reorderDragY = ref(0)
const settledReorderId = ref('')
const boardTransform = reactive<BoardTransform>({
  x: win.w / 2,
  y: win.h / 2,
  scale: 1,
  rotation: 0,
  opacity: 1,
  locked: true,
  flipX: false,
})

const boardLayer = reactive<Layer>({
  type: '底板',
  label: '底板',
  color: '#fff',
  w: win.w,
  h: win.h,
  shape: 'rect',
  id: BOARD_LAYER_ID,
  x: boardTransform.x,
  y: boardTransform.y,
  scale: boardTransform.scale,
  rotation: boardTransform.rotation,
  opacity: boardTransform.opacity,
  locked: boardTransform.locked,
  flipX: boardTransform.flipX,
  fixed: true,
})
const hasBoardLayer = computed(() => curBoard.value >= 0)
const selected = computed(() => selectedId.value === BOARD_LAYER_ID && hasBoardLayer.value ? boardLayer : doc.layers.find((l) => l.id === selectedId.value))
const canUndo = computed(() => history.value.length > 1)
const canRedo = computed(() => redoStack.value.length > 0)
const visibleLayerList = computed(() => {
  const list = [...doc.layers].reverse()
  if (hasBoardLayer.value) list.push(boardLayer)
  return list
})
const layerButtonStyle = computed(() => ({
  transform: `translate3d(${isCollapsed.value ? layerButtonHiddenX() : layerButton.x}px, ${layerButton.y}px, 0)`,
}))
// 面板始终以 SHEET_TALL_H 绝对定位在底部，靠 translateY 控制露出高度。
// 三态基准位移 = 面板高 - 该态露出高；拖拽时叠加 sheetDragY 并夹在 [满,合] 之间。
function shelfBaseOffset(state: ShelfState) {
  const reveal = state === 'collapsed' ? SHEET_PEEK_H : state === 'open' ? SHEET_OPEN_H : SHEET_TALL_H
  return SHEET_TALL_H - reveal
}
const shelfOffset = computed(() => {
  const base = shelfBaseOffset(shelfState.value)
  const raw = sheetDragging.value ? base + sheetDragY.value : base
  return clamp(raw, 0, SHEET_TALL_H - SHEET_PEEK_H)
})
const materialPanelStyle = computed(() => ({
  height: `${SHEET_TALL_H}px`,
  transform: `translateY(${shelfOffset.value}px)`,
}))
const drawerStyle = computed(() => {
  if (!drawerDragging.value) return {}
  return { transform: `translateY(${drawerDragY.value}px)` }
})
const scaleFieldValue = computed(() =>
  editingField.value === 'scale' ? editingText.value : selected.value ? formatScale(selected.value.scale) : '',
)
const rotationFieldValue = computed(() =>
  editingField.value === 'rotation' ? editingText.value : selected.value ? formatRotation(selected.value.rotation) : '',
)
function boardBaseSize() {
  const aspect = curBoard.value >= 0 ? boards[curBoard.value].aspect || 426 / 300 : 426 / 300
  return { w: win.h * aspect, h: win.h }
}
function boardCoverScale() {
  const base = boardBaseSize()
  return Math.max(win.w / base.w, win.h / base.h)
}
// A src board renders as an <image> child (see template); a color board fills via
// background. Rendering the image as an <image> element (not a transform-scaled CSS
// background) avoids edge-sampling shimmer on the Dimina renderer for busy artwork.
const boardLayerInnerStyle = computed(() => ({
  background: boardLayer.src ? undefined : boardLayer.color,
  opacity: boardLayer.opacity,
  transform: boardLayer.flipX ? 'scaleX(-1)' : 'none',
}))
const bagBackFillStyle = computed(() => {
  const crop = bags[curBag.value]?.backCrop
  if (!crop) return {}
  const left = -(crop.x / crop.w) * 100
  const top = -(crop.y / crop.h) * 100
  const width = (EXPORT_SIZE / crop.w) * 100
  const height = (EXPORT_SIZE / crop.h) * 100
  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  }
})

function syncWindowFromBag(rescaleContent = false) {
  const old = { w: win.w, h: win.h }
  const frame = bags[curBag.value]?.win || WIN
  win.x = frame.l * cw
  win.y = frame.t * ch
  win.w = (frame.r - frame.l) * cw
  win.h = (frame.b - frame.t) * ch
  if (rescaleContent && old.w > 0 && old.h > 0) {
    const rx = win.w / old.w
    const ry = win.h / old.h
    doc.layers.forEach((ly) => {
      ly.x *= rx
      ly.y *= ry
    })
    boardTransform.x *= rx
    boardTransform.y *= ry
  }
}

function syncBoardLayerFromTransform() {
  if (curBoard.value >= 0) {
    const b = boards[curBoard.value]
    boardLayer.label = b.label || '底板'
    boardLayer.color = b.color || '#fff'
    boardLayer.src = b.src
  } else {
    boardLayer.label = '底板'
    boardLayer.color = '#fff'
    boardLayer.src = undefined
  }
  const base = boardBaseSize()
  boardLayer.w = base.w
  boardLayer.h = base.h
  boardLayer.x = boardTransform.x
  boardLayer.y = boardTransform.y
  boardLayer.scale = boardTransform.scale
  boardLayer.rotation = boardTransform.rotation
  boardLayer.opacity = boardTransform.opacity
  boardLayer.locked = boardTransform.locked
  boardLayer.flipX = boardTransform.flipX
}

function syncBoardTransformFromLayer() {
  boardTransform.x = boardLayer.x
  boardTransform.y = boardLayer.y
  boardTransform.scale = boardLayer.scale
  boardTransform.rotation = boardLayer.rotation
  boardTransform.opacity = boardLayer.opacity
  boardTransform.locked = boardLayer.locked
  boardTransform.flipX = boardLayer.flipX
}

function resetBoardTransform(locked = true) {
  boardTransform.x = win.w / 2
  boardTransform.y = win.h / 2
  boardTransform.scale = boardCoverScale()
  boardTransform.rotation = 0
  boardTransform.opacity = 1
  boardTransform.locked = locked
  boardTransform.flipX = false
  syncBoardLayerFromTransform()
}

function assetToMat(asset: UserAsset): Mat {
  return {
    type: asset.type,
    label: asset.label,
    color: asset.color,
    w: asset.w,
    h: asset.h,
    shape: asset.shape,
    src: asset.src,
    crop: asset.crop,
    assetId: asset.id,
    sub: asset.sub,
    spuId: asset.spuId,
  }
}

function guessAssetShape(type: UserAsset['type'], sub: string): Shape {
  return type === '谷子' && sub === '吧唧' ? 'circle' : 'rect'
}
function defaultAssetSize(sub: string, shape: Shape) {
  if (shape === 'circle') return { w: 56, h: 56 }
  if (sub === '立牌') return { w: 48, h: 70 }
  if (sub === '小卡') return { w: 48, h: 66 }
  if (sub === '色纸') return { w: 60, h: 60 }
  return { w: 60, h: 60 }
}
function fallbackImportImageSize() {
  const portraitW = sys.screenWidth || sys.windowWidth || vp.w || 375
  const portraitH = sys.screenHeight || Math.max(sys.windowHeight || vp.h || 760, portraitW * 1.78)
  // Most failed native measurements are user screenshots selected from the
  // album. A portrait fallback preserves visual proportions better than a
  // landscape crop stage and is corrected automatically once a real size is found.
  if (portraitH > portraitW) return { width: portraitW, height: portraitH }
  return { width: importCrop.stageMaxW || 314, height: 178 }
}
async function measureImageSize(src: string) {
  const parsed = src.startsWith('data:') ? imageSizeFromDataUrl(src) : await imageSizeFromLocalFile(src)
  if (parsed) return parsed
  try {
    const info = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      Taro.getImageInfo({
        src,
        success: (res) => resolve({ width: res.width || 0, height: res.height || 0 }),
        fail: reject,
      })
    })
    const size = normalizeImageSize(info.width, info.height)
    if (size) return size
  } catch (_) {}
  if (typeof Image !== 'undefined') {
    try {
      return await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(normalizeImageSize(img.naturalWidth || img.width, img.naturalHeight || img.height) || { width: 0, height: 0 })
        img.onerror = () => resolve({ width: 0, height: 0 })
        img.src = src
      })
    } catch (_) {}
  }
  return { width: 0, height: 0 }
}
// Measure the aspect via a hidden widthFix probe image: its rendered height (at a
// fixed 300px width) follows the natural aspect. createSelectorQuery works in
// Dimina, so this is the reliable cross-platform measurement (no getImageInfo / fs).
// Which source produced the measured image size (probe/meta/parser/fallback) —
// surfaced in the dev overlay to diagnose measurement issues per runtime.
const measureTag = ref('-')
function measureViaWidthFix(): Promise<{ width: number; height: number } | undefined> {
  // H5: Taro's <image> wrapper keeps its fixed default box even in widthFix mode,
  // so the rect never reflects the image. Read the inner <img>'s natural size
  // directly — modern browsers report it EXIF-oriented, matching what's displayed.
  if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined') {
    return new Promise((resolve) => {
      let tries = 0
      const attempt = () => {
        const el = document.querySelector('.import-measure-img img, img.import-measure-img') as HTMLImageElement | null
        if (el && el.complete && el.naturalWidth > 1 && el.naturalHeight > 1) {
          resolve({ width: el.naturalWidth, height: el.naturalHeight })
          return
        }
        if (++tries < 24) { setTimeout(attempt, 60); return }
        resolve(undefined)
      }
      attempt()
    })
  }
  return new Promise((resolve) => {
    let tries = 0
    let lastH = -1
    const attempt = () => {
      try {
        Taro.createSelectorQuery()
          .select('.import-measure-img')
          .boundingClientRect((rect: any) => {
            const w = rect && rect.width
            const h = rect && rect.height
            // Dimina's widthFix container is height:auto → it stays 0 until the
            // image has loaded and laid out, so h>2 itself signals "loaded". Do NOT
            // gate on the load event — it does not reach the handler in the Dimina
            // runtime (verified in the web runtime), which starved the probe and
            // pushed measurement onto wrong fallbacks (the device stretch bug).
            // Two consecutive identical readings guard against mid-layout values;
            // the MEASURED width guards against runtime unit scaling.
            if (h && h > 2 && Math.abs(h - lastH) < 1) {
              resolve({ width: w && w > 2 ? Math.round(w) : 300, height: Math.round(h) })
              return
            }
            lastH = h || -1
            if (++tries < 24) { setTimeout(attempt, 60); return }
            resolve(undefined)
          })
          .exec()
      } catch (_) { resolve(undefined) }
    }
    attempt()
  })
}
async function measureImportDraftImageSize() {
  // 1) byte parser FIRST: it reads the real file header (PNG IHDR / JPEG SOF) and now
  // applies EXIF orientation, so it returns the DISPLAYED aspect deterministically —
  // no dependence on the widthFix probe, which is unreliable on Dimina (off-screen
  // lazy-load / height:auto not laid out) and was falling back to a portrait guess
  // that stretched landscape images. measureImageSize also tries getImageInfo/Image.
  const sources = [importDraft.src, importDraft.storedSrc].filter(Boolean)
  for (const src of sources) {
    const size = await measureImageSize(src)
    const normalized = normalizeImageSize(size.width, size.height)
    if (normalized) { measureTag.value = 'parser'; return normalized }
  }
  // 2) widthFix probe (display pipeline) as a fallback when bytes are unreadable
  const wf = await measureViaWidthFix()
  const probed = normalizeImageSize(wf?.width, wf?.height)
  if (probed) { measureTag.value = 'probe'; return probed }
  // 3) picker metadata, then a shape-preserving guess
  const known = normalizeImageSize(importDraft.sourceW, importDraft.sourceH)
  if (known) { measureTag.value = 'meta'; return known }
  measureTag.value = 'fallback'
  return fallbackImportImageSize()
}
function importCropImageFrame() {
  return cropImageFrame(importCrop.stageW, importCrop.stageH, importCrop.imageW, importCrop.imageH)
}
function clampImportCrop() {
  const minSize = 16
  const frame = importCropImageFrame()
  importCrop.w = clamp(importCrop.w, minSize, Math.max(minSize, frame.w))
  importCrop.h = clamp(importCrop.h, minSize, Math.max(minSize, frame.h))
  if (importDraft.shape === 'circle') {
    const s = Math.min(importCrop.w, importCrop.h, frame.w, frame.h)
    importCrop.w = s
    importCrop.h = s
  }
  importCrop.x = clamp(importCrop.x, frame.x, Math.max(frame.x, frame.x + frame.w - importCrop.w))
  importCrop.y = clamp(importCrop.y, frame.y, Math.max(frame.y, frame.y + frame.h - importCrop.h))
}
function resetImportCropForShape(ratio = 0.72) {
  const frame = importCropImageFrame()
  if (importDraft.shape === 'circle') {
    const size = Math.min(frame.w, frame.h) * ratio
    importCrop.w = size
    importCrop.h = size
  } else {
    importCrop.w = frame.w * ratio
    importCrop.h = frame.h * ratio
  }
  importCrop.x = frame.x + (frame.w - importCrop.w) / 2
  importCrop.y = frame.y + (frame.h - importCrop.h) / 2
  clampImportCrop()
}
async function readImportCropStageRect(awaitExpectedSize = false) {
  await nextTick()
  await new Promise<void>((resolve) => {
    Taro.createSelectorQuery()
      .select('.import-stage-wrap')
      .boundingClientRect((rect: any) => {
        // small insets so the rounded stage never kisses the wrap edges
        if (rect?.width) importCrop.stageMaxW = Math.max(120, rect.width - 8)
        if (rect?.height) importCrop.stageMaxH = Math.max(150, rect.height - 8)
        resolve()
      })
      .exec()
  })
  const readStage = () => new Promise<any>((resolve) => {
    Taro.createSelectorQuery()
      .select('.import-editor-crop-stage')
      .boundingClientRect((rect: any) => resolve(rect))
      .exec()
  })
  // The stage restyles itself once the image aspect lands (importCropStageStyle),
  // but Dimina's render thread applies that a beat later than the state change.
  // Reading too early records the OLD size: the frame math then disagrees with the
  // overflow-clipped stage the user actually sees, so the selection maps to a
  // different image region than the one framed → retry until the rendered rect
  // matches the expected size (or the retries run out).
  let rect: any
  for (let tries = 0; tries < 20; tries += 1) {
    rect = await readStage()
    if (!awaitExpectedSize) break
    const expected = expectedImportStageSize()
    if (rect?.width && Math.abs(rect.width - expected.w) < 2 && Math.abs(rect.height - expected.h) < 2) break
    await new Promise((r) => setTimeout(r, 60))
  }
  if (typeof rect?.left === 'number') importCrop.stageX = rect.left
  if (typeof rect?.top === 'number') importCrop.stageY = rect.top
  if (rect?.width) importCrop.stageW = rect.width
  if (rect?.height) importCrop.stageH = rect.height
  if (!importCrop.stageW) importCrop.stageW = 314
  if (!importCrop.stageH) importCrop.stageH = 178
}
async function refreshImportCropStage(reset = false) {
  await readImportCropStageRect()
  const src = importDraft.src || importDraft.storedSrc
  if (src) {
    const size = await measureImportDraftImageSize()
    importCrop.imageW = size.width || importCrop.stageW
    importCrop.imageH = size.height || importCrop.stageH
    await readImportCropStageRect(true)
  }
  if (reset) resetImportCropForShape()
  else clampImportCrop()
}
// NOTE: do NOT read the <image> load event for natural size — both H5 and the
// Dimina runtime are webview-based, so it reports the RENDERED box size (e.g.
// 314x178), not the natural size, which poisons the crop aspect. The byte parser
// (imageSizeFromDataUrl / imageSizeFromLocalFile) + widthFix probe drive dimensions.
function startImportCropDrag(handle: ImportCropHandle, x: number, y: number) {
  importCropDrag = {
    active: true,
    handle,
    sx: x,
    sy: y,
    x: importCrop.x,
    y: importCrop.y,
    w: importCrop.w,
    h: importCrop.h,
  }
}
function isInsideImportCrop(clientX: number, clientY: number) {
  const x = clientX - importCrop.stageX
  const y = clientY - importCrop.stageY
  if (importDraft.shape === 'circle') {
    const cx = importCrop.x + importCrop.w / 2
    const cy = importCrop.y + importCrop.h / 2
    const r = importCrop.w / 2
    return Math.hypot(x - cx, y - cy) <= r
  }
  return x >= importCrop.x && x <= importCrop.x + importCrop.w && y >= importCrop.y && y <= importCrop.y + importCrop.h
}
function resizeImportCrop(handle: ImportCropHandle, dx: number, dy: number) {
  let { x, y, w, h } = importCropDrag
  const minSize = 16
  if (importDraft.shape === 'circle') {
    // corner → use min (most negative = strongest shrink); edge → use the edge direction
    const grow = handle.length === 2
      ? Math.min(
          handle.includes('l') ? -dx : dx,
          handle.includes('t') ? -dy : dy,
        )
      : Math.max(
          handle.includes('l') ? -dx : dx,
          handle.includes('t') ? -dy : dy,
          handle === 'left' ? -dx : 0,
          handle === 'right' ? dx : 0,
          handle === 'top' ? -dy : 0,
          handle === 'bottom' ? dy : 0,
        )
    const next = clamp(w + grow * 2, minSize, Math.min(importCrop.stageW, importCrop.stageH))
    const cx = x + w / 2
    const cy = y + h / 2
    importCrop.w = next
    importCrop.h = next
    importCrop.x = cx - next / 2
    importCrop.y = cy - next / 2
    clampImportCrop()
    return
  }
  if (handle.includes('l') || handle === 'left') { x += dx; w -= dx }
  if (handle.includes('r') || handle === 'right') w += dx
  if (handle.includes('t') || handle === 'top') { y += dy; h -= dy }
  if (handle.includes('b') || handle === 'bottom') h += dy
  if (w < minSize) {
    if (handle.includes('l') || handle === 'left') x -= minSize - w
    w = minSize
  }
  if (h < minSize) {
    if (handle.includes('t') || handle === 'top') y -= minSize - h
    h = minSize
  }
  importCrop.x = x
  importCrop.y = y
  importCrop.w = w
  importCrop.h = h
  clampImportCrop()
}
function moveImportCropDrag(x: number, y: number) {
  if (!importCropDrag.active) return
  const dx = x - importCropDrag.sx
  const dy = y - importCropDrag.sy
  if (importCropDrag.handle === 'move') {
    importCrop.x = importCropDrag.x + dx
    importCrop.y = importCropDrag.y + dy
    clampImportCrop()
    return
  }
  resizeImportCrop(importCropDrag.handle, dx, dy)
}
function endImportCropDrag() {
  importCropDrag.active = false
}
function onImportCropTouchStart(event: any) {
  const t = event.touches && event.touches[0]
  if (!t) return
  if (!isInsideImportCrop(t.clientX, t.clientY)) return
  startImportCropDrag('move', t.clientX, t.clientY)
}
function onImportCropTouchMove(event: any) {
  const t = event.touches && event.touches[0]
  if (!t) return
  if (!importCropDrag.active) return
  if (event.preventDefault) event.preventDefault()
  moveImportCropDrag(t.clientX, t.clientY)
}
function onImportCropTouchEnd() {
  endImportCropDrag()
}
function onImportCropHandleTouchStart(event: any, handle: ImportCropHandle) {
  const t = event.touches && event.touches[0]
  if (!t) return
  startImportCropDrag(handle, t.clientX, t.clientY)
}
function onImportCropMouseDown(event: any) {
  if (event.preventDefault) event.preventDefault()
  if (!isInsideImportCrop(event.clientX, event.clientY)) return
  startImportCropDrag('move', event.clientX, event.clientY)
  bindImportCropMouseDrag()
}
function onImportCropHandleMouseDown(event: any, handle: ImportCropHandle) {
  if (event.preventDefault) event.preventDefault()
  startImportCropDrag(handle, event.clientX, event.clientY)
  bindImportCropMouseDrag()
}
// Web-only mouse-drag fallback (native runtimes use touch). Registers window
// mousemove/mouseup and auto-removes both on mouseup, after running onUp.
function bindWindowMouseDrag(onMove: (e: any) => void, onUp?: (e: any) => void) {
  if (typeof window === 'undefined') return
  const move = (e: any) => onMove(e)
  const up = (e: any) => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    onUp?.(e)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function bindImportCropMouseDrag() {
  bindWindowMouseDrag(
    (ev) => moveImportCropDrag(ev.clientX, ev.clientY),
    () => endImportCropDrag(),
  )
}
function categorySubcats(type: UserAsset['type']) {
  return (SUBCATS[type] || ['全部']).filter((item) => item !== '全部')
}
function placeholderColor(type: UserAsset['type'], sub: string) {
  const guziColors: Record<string, string> = {
    吧唧: '#E9C7CF',
    立牌: '#BCDAD1',
    小卡: '#E8D2B2',
    色纸: '#C7DCE8',
    其他: '#D8CFEA',
  }
  const decorColors: Record<string, string> = {
    蝴蝶结: '#EBC4CC',
    吧唧托: '#D7CEE9',
    花边: '#EFE0BC',
    丝带: '#C7DAE8',
    其他: '#CFE0D7',
  }
  return type === '谷子' ? guziColors[sub] || '#E7D4DA' : decorColors[sub] || '#E3D9EC'
}
function categoryPlaceholder(type: UserAsset['type'], sub: string): RowItem | undefined {
  if (sub === '全部') return undefined
  const shape = guessAssetShape(type, sub)
  const size = defaultAssetSize(sub, shape)
  const mat: Mat = {
    type,
    label: sub,
    color: placeholderColor(type, sub),
    w: size.w,
    h: size.h,
    shape,
    sub,
  }
  return { kind: 'mat', label: sub, color: mat.color, shape: mat.shape, mat }
}

const rowItems = computed<RowItem[]>(() => {
  const sc = subCat.value
  const flt = (arr: Mat[]) => (sc === '全部' ? arr : arr.filter((m) => (m.sub || '其他') === sc))
  const fltAssets = (type: UserAsset['type']) => userAssets.value.filter((asset) => asset.type === type && (sc === '全部' || (asset.sub || '其他') === sc))
  const placeholders = (type: UserAsset['type']) => {
    const subs = sc === '全部' ? categorySubcats(type) : [sc]
    return subs
      .map((sub) => categoryPlaceholder(type, sub))
      .filter((item): item is RowItem => !!item)
  }
  if (category.value === '谷子')
    return [
      { kind: 'plus', label: '导入' },
      ...placeholders('谷子'),
      ...fltAssets('谷子').map((asset) => {
        const mat = assetToMat(asset)
        return { kind: 'mat', label: mat.label, color: mat.color, shape: mat.shape, img: mat.src, mat } as RowItem
      }),
    ]
  if (category.value === '装饰')
    return [
      { kind: 'plus', label: '导入' },
      ...placeholders('装饰'),
      ...fltAssets('装饰').map((asset) => {
        const mat = assetToMat(asset)
        return { kind: 'mat', label: mat.label, color: mat.color, shape: mat.shape, img: mat.src, mat } as RowItem
      }),
      ...flt(decor).map((m) => ({ kind: 'mat', label: m.label, color: m.color, shape: m.shape, mat: m } as RowItem)),
    ]
  if (category.value === '底板')
    return [
      { kind: 'none', label: '无底板' } as RowItem,
      ...boards
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => sc === '全部' || (b.sub || '其他') === sc)
        .map(({ b, i }) => ({ kind: 'board', label: b.label, img: b.src, color: b.color, idx: i, aspect: b.aspect } as RowItem)),
    ]
  return bags.map((b, i) => ({ kind: 'bag', label: b.label, img: b.preview || b.front, idx: i } as RowItem))
})

let seq = 0
let lastLayerTs = 0
let dragged = false
let layerButtonSuppressTap = false
let suppressHistory = false
let g = { id: '', mode: '' as '' | 'move' | 'pinch', sx: 0, sy: 0, lx: 0, ly: 0, sd: 0, sa: 0, ss: 1, sr: 0 }
let bg = { sx: 0, sy: 0, x: 0, y: 0, moved: false }
let rg = { id: '', cx: 0, cy: 0, startDist: 1, startAngle: 0, startScale: 1, startRotation: 0, moved: false }
let sg = { sy: 0, moved: false }
let dg = { sy: 0, moved: false }
let sheetSuppressTap = false
let nudgeInputDirty = false
let lr = { id: '', fromVis: 0, startY: 0, base: [] as string[], active: false, moved: false }
let layerLongPressTimer: any = 0
let layerLongPress = { id: '', sx: 0, sy: 0, fired: false }
const lockedDragFailures = new Map<string, number>()

onMounted(async () => {
  resetLayerButton()
  syncWindowFromBag()
  syncBoardLayerFromTransform()
  await loadUserAssets()
  loadWork()
  loadExportHistory()
  pushHistory()
  await nextTick()
  refreshStageRect()
  refreshPageWidth()
  // H5-only test hook so headless puppeteer can drive the editor for verification.
  if (process.env.TARO_ENV === 'h5' && typeof window !== 'undefined') {
    ;(window as any).__gooda = {
      openImportEditor, cancelImportEditor, setImportDraftShape,
      importCrop, importDraft, addLayer, doc,
      importCropImageFrame,
      measureImageSize, imageSizeFromDataUrl, measureImportDraftImageSize,
      openImportEditorFromAsset, confirmImportEditor, computeImportCropRect,
      userAssets, category, subCat,
      // SPU 资料库导入链路（headless 验证用）
      spu: {
        mode: spuService.mode,
        open: openSpuSearch,
        close: closeSpuSearch,
        search: runSpuSearch,
        importItem: importSpuFromLibrary,
        keyword: spuKeyword,
        items: spuItems,
        error: spuError,
        loading: spuLoading,
      },
    }
  }
})

function cloneLayers() {
  return doc.layers.map((l) => ({ ...l }))
}
function snapshot(): Snapshot {
  syncBoardTransformFromLayer()
  return {
    layers: cloneLayers(),
    curBoard: curBoard.value,
    curBag: curBag.value,
    showGrid: showGrid.value,
    boardTransform: { ...boardTransform },
  }
}
function storageSnapshot() {
  const s = snapshot()
  return {
    ...s,
    layers: s.layers.map((layer) => {
      const next = { ...layer }
      if (next.assetId) delete next.src
      return next
    }),
  }
}
function applySnapshot(s: Snapshot) {
  suppressHistory = true
  doc.layers = hydrateLayerAssetSources(s.layers.map((l) => ({ ...l })))
  curBoard.value = s.curBoard
  curBag.value = s.curBag
  showGrid.value = s.showGrid
  syncWindowFromBag()
  Object.assign(boardTransform, s.boardTransform || {
    x: win.w / 2,
    y: win.h / 2,
    scale: boardCoverScale(),
    rotation: 0,
    opacity: 1,
    locked: true,
    flipX: false,
  })
  syncBoardLayerFromTransform()
  if (selectedId.value === BOARD_LAYER_ID) {
    if (curBoard.value < 0) selectedId.value = ''
  } else if (selectedId.value && !doc.layers.find((l) => l.id === selectedId.value)) selectedId.value = ''
  suppressHistory = false
}
function pushHistory() {
  if (suppressHistory) return
  history.value.push(snapshot())
  if (history.value.length > 50) history.value.shift()
  redoStack.value = []
}
function commit() {
  pushHistory()
  saveWork(false)
}
function undo() {
  if (!canUndo.value) return
  const cur = history.value.pop()
  if (cur) redoStack.value.push(cur)
  const prev = history.value[history.value.length - 1]
  if (prev) applySnapshot(prev)
}
function redo() {
  const next = redoStack.value.pop()
  if (!next) return
  applySnapshot(next)
  history.value.push(snapshot())
}

function markLayer() { lastLayerTs = Date.now() }
function onLayerTap(ly: Layer) { selectedId.value = ly.id; markLayer() }
// 逐级收起：满 → 开 → 合。逐级展开：合 → 开 → 满。
const SHELF_STEPS: ShelfState[] = ['collapsed', 'open', 'tall']
function stepShelf(dir: 1 | -1) {
  const i = SHELF_STEPS.indexOf(shelfState.value)
  const next = SHELF_STEPS[clamp(i + dir, 0, SHELF_STEPS.length - 1)]
  if (next !== shelfState.value) shelfState.value = next
}
function expandShelf() {
  stepShelf(1)
  showLayerDrawer.value = false
}
function collapseShelf() {
  stepShelf(-1)
  showLayerDrawer.value = false
}
// Tapping the canvas / outside area only deselects — it no longer toggles the drawer.
function deselectOnBackgroundTap() {
  if (selected.value) selectedId.value = ''
}
function onStageTap() {
  if (Date.now() - lastLayerTs < 350) return
  deselectOnBackgroundTap()
}
// Open/close the material drawer by swiping vertically OUTSIDE the 痛包 canvas
// (the stage-wrap background). Layer drags and the tool rail both .stop their own
// touches, so they never reach here → swipe-open never fights a layer/toolbar drag.
const STAGE_SWIPE_THRESHOLD = 42
let stageSwipe = { sx: 0, sy: 0, moved: false }
function startStageSwipe(x: number, y: number) {
  stageSwipe = { sx: x, sy: y, moved: false }
}
function moveStageSwipe(x: number, y: number) {
  if (Math.abs(y - stageSwipe.sy) > 8 || Math.abs(x - stageSwipe.sx) > 8) stageSwipe.moved = true
}
function endStageSwipe(x: number, y: number) {
  const dy = y - stageSwipe.sy
  const dx = x - stageSwipe.sx
  // vertical swipe → drawer; more vertical than horizontal to avoid accidental toggles
  if (Math.abs(dy) > STAGE_SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
    if (dy > 0) collapseShelf() // swipe down → 逐级收起（满→开→合）
    else expandShelf()          // swipe up → 逐级展开（合→开→满）
    return
  }
  if (!stageSwipe.moved) deselectOnBackgroundTap() // plain tap → deselect only
}
function onStageWrapTouchStart(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  startStageSwipe(t.clientX, t.clientY)
}
function onStageWrapTouchMove(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  moveStageSwipe(t.clientX, t.clientY)
}
function onStageWrapTouchEnd(e: any) {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
  if (t) endStageSwipe(t.clientX, t.clientY)
}
function onStageWrapMouseDown(e: any) {
  startStageSwipe(e.clientX, e.clientY)
  bindWindowMouseDrag(
    (ev) => moveStageSwipe(ev.clientX, ev.clientY),
    (ev) => endStageSwipe(ev.clientX, ev.clientY),
  )
}
function selectLayer(id: string) { selectedId.value = id; markLayer() }
function toggleLayerDrawer() { showLayerDrawer.value = !showLayerDrawer.value }
function onLayerButtonTap() {
  if (layerButtonSuppressTap) {
    layerButtonSuppressTap = false
    return
  }
  toggleLayerDrawer()
}
function runRailAction(action: () => void) {
  if (layerButtonSuppressTap) {
    layerButtonSuppressTap = false
    return
  }
  action()
}
function layerOrderLabel(idx: number) { return String(visibleLayerList.value.length - idx) }
// .stage-tool-rail is 50PX wide (gooda-theme.css); snap leaves the same margin on
// either side. Snap math must use the REAL rendered page width — sys.windowWidth
// can disagree with the webview's CSS viewport on device, which made the right-edge
// snap land with a different margin than the left.
const RAIL_WIDTH = 50
const RAIL_MARGIN = 14
const pageSize = { w: 0 }
function refreshPageWidth() {
  measureRect('.page').then((rect) => { if (rect) pageSize.w = rect.width })
}
function pageWidth() { return pageSize.w || viewportSize().w }
function resetLayerButton() {
  const { h: wh } = viewportSize()
  const railH = 188
  const topMin = layerButtonTopMin()
  const topLimit = Math.max(topMin, wh - railH - 330)
  layerButton.x = RAIL_MARGIN
  layerButton.y = clamp(92, topMin, topLimit)
}
function layerButtonTopMin() {
  return Math.max(LAYER_RAIL_TOP_GUARD, (sys.statusBarHeight || 0) + 66)
}
function layerButtonHiddenX() {
  const ww = pageWidth()
  return layerButton.x + RAIL_WIDTH / 2 < ww / 2 ? -68 : ww + 18
}
function clampLayerButton() {
  const ww = pageWidth()
  const { h: wh } = viewportSize()
  const railH = 188
  const topMin = layerButtonTopMin()
  layerButton.x = clamp(layerButton.x, 10, ww - RAIL_WIDTH - 10)
  layerButton.y = clamp(layerButton.y, topMin, wh - railH - 28)
}
function snapLayerButton() {
  const ww = pageWidth()
  layerButton.x = layerButton.x + RAIL_WIDTH / 2 < ww / 2 ? RAIL_MARGIN : ww - RAIL_WIDTH - RAIL_MARGIN
  clampLayerButton()
}
function startLayerButtonDrag(x: number, y: number) {
  refreshPageWidth() // async; lands well before the drag ends → snap uses a fresh width
  layerButtonMoving.value = true
  showLayerDrawer.value = false
  bg = { sx: x, sy: y, x: layerButton.x, y: layerButton.y, moved: false }
}
function moveLayerButton(x: number, y: number) {
  const dx = x - bg.sx
  const dy = y - bg.sy
  if (Math.abs(dx) + Math.abs(dy) > 6) bg.moved = true
  layerButton.x = bg.x + dx
  layerButton.y = bg.y + dy
  clampLayerButton()
}
function endLayerButtonDrag() {
  if (bg.moved) {
    layerButtonSuppressTap = true
    layerButtonMoving.value = false
    snapLayerButton()
    return
  }
  layerButtonMoving.value = false
}
function onLayerButtonTouchStart(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  startLayerButtonDrag(t.clientX, t.clientY)
}
function onLayerButtonTouchMove(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  if (e.preventDefault) e.preventDefault()
  moveLayerButton(t.clientX, t.clientY)
}
function onLayerButtonTouchEnd() { endLayerButtonDrag() }
function onLayerButtonMouseDown(e: any) {
  if (e.preventDefault) e.preventDefault()
  startLayerButtonDrag(e.clientX, e.clientY)
  bindWindowMouseDrag(
    (ev) => { if (ev.preventDefault) ev.preventDefault(); moveLayerButton(ev.clientX, ev.clientY) },
    () => endLayerButtonDrag(),
  )
}
function toggleMaterialCollapsed() {
  if (sheetSuppressTap) {
    sheetSuppressTap = false
    return
  }
  // 点把手：合→开、满→开、开→合（点按不进入满态，满态靠上滑/拖拽触发）。
  shelfState.value = shelfState.value === 'collapsed' ? 'open' : shelfState.value === 'tall' ? 'open' : 'collapsed'
  if (shelfState.value === 'collapsed') showLayerDrawer.value = false
}
function suppressNextSheetTap() {
  sheetSuppressTap = true
  if (typeof window !== 'undefined') window.setTimeout(() => { sheetSuppressTap = false }, 120)
}
function startSheetDrag(y: number) {
  sheetDragging.value = true
  sheetDragY.value = 0
  sg = { sy: y, moved: false }
}
function moveSheetDrag(y: number) {
  const dy = y - sg.sy
  if (Math.abs(dy) > 8) sg.moved = true
  // 连续跟手：偏移在 shelfOffset 里叠加并夹紧（满↔合全程），松手吸附到最近一态。
  sheetDragY.value = dy
}
function endSheetDrag(y?: number) {
  const dy = typeof y === 'number' ? y - sg.sy : 0
  if (sg.moved) {
    suppressNextSheetTap()
    const finalOffset = clamp(shelfBaseOffset(shelfState.value) + dy, 0, SHEET_TALL_H - SHEET_PEEK_H)
    let best: ShelfState = 'open'
    let bestD = Infinity
    for (const s of SHELF_STEPS) {
      const d = Math.abs(shelfBaseOffset(s) - finalOffset)
      if (d < bestD) { bestD = d; best = s }
    }
    shelfState.value = best
    if (best === 'collapsed') showLayerDrawer.value = false
  }
  sheetDragging.value = false
  sheetDragY.value = 0
  sg.moved = false
}
function onSheetTouchStart(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  startSheetDrag(t.clientY)
}
function onSheetTouchMove(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  if (e.preventDefault) e.preventDefault()
  moveSheetDrag(t.clientY)
}
function onSheetTouchEnd(e: any) {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
  endSheetDrag(t && t.clientY)
}
function onSheetMouseDown(e: any) {
  if (e.preventDefault) e.preventDefault()
  startSheetDrag(e.clientY)
  bindWindowMouseDrag(
    (ev) => { if (ev.preventDefault) ev.preventDefault(); moveSheetDrag(ev.clientY) },
    (ev) => endSheetDrag(ev.clientY),
  )
}

function startDrawerDrag(y: number) {
  drawerDragging.value = true
  drawerDragY.value = 0
  dg = { sy: y, moved: false }
}
function moveDrawerDrag(y: number) {
  const dy = y - dg.sy
  if (Math.abs(dy) > 8) dg.moved = true
  drawerDragY.value = clamp(dy, -18, 260)
}
function endDrawerDrag(y?: number) {
  const dy = typeof y === 'number' ? y - dg.sy : 0
  if (dg.moved && dy > 56) showLayerDrawer.value = false
  drawerDragging.value = false
  drawerDragY.value = 0
  dg.moved = false
}
function onDrawerTouchStart(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  startDrawerDrag(t.clientY)
}
function onDrawerTouchMove(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  if (e.preventDefault) e.preventDefault()
  moveDrawerDrag(t.clientY)
}
function onDrawerTouchEnd(e: any) {
  const t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0])
  endDrawerDrag(t && t.clientY)
}
function onDrawerMouseDown(e: any) {
  if (e.preventDefault) e.preventDefault()
  startDrawerDrag(e.clientY)
  bindWindowMouseDrag(
    (ev) => { if (ev.preventDefault) ev.preventDefault(); moveDrawerDrag(ev.clientY) },
    (ev) => endDrawerDrag(ev.clientY),
  )
}

function nextId() { return 'L' + ++seq }
function addLayer(m: Mat, position?: { x: number; y: number }) {
  const id = nextId()
  doc.layers.push({
    ...m,
    id,
    x: position?.x ?? win.w / 2,
    y: position?.y ?? win.h / 2,
    scale: 1,
    rotation: 0,
    opacity: 1,
    locked: false,
    flipX: false,
  })
  selectedId.value = id
  commit()
}
// Cached screen rect of .stage. In the Dimina native runtime document.querySelector
// / getBoundingClientRect are unavailable, so we measure via Taro.createSelectorQuery
// (works on H5 too) and cache it, refreshing at interaction starts / zoom changes.
const stageRect = { left: 0, top: 0, width: 0, height: 0 }
function refreshStageRect() {
  return measureRect('.stage').then((rect) => {
    if (rect) {
      stageRect.left = rect.left
      stageRect.top = rect.top
      stageRect.width = rect.width
      stageRect.height = rect.height
    }
  })
}
function stageScreenRect() {
  // prefer the freshly-cached rect; fall back to H5 DOM if the cache is empty
  if (stageRect.width) return stageRect
  if (typeof document !== 'undefined') {
    const stage = document.querySelector('.stage') as any
    if (stage && stage.getBoundingClientRect) {
      const r = stage.getBoundingClientRect()
      if (r && r.width) return { left: r.left, top: r.top, width: r.width, height: r.height }
    }
  }
  return null
}
function clientPointToWindowPoint(clientX: number, clientY: number) {
  const rect = stageScreenRect()
  if (!rect) return undefined
  const scaleX = cw / rect.width
  const scaleY = ch / rect.height
  const x = (clientX - rect.left) * scaleX - win.x
  const y = (clientY - rect.top) * scaleY - win.y
  if (x < 0 || x > win.w || y < 0 || y > win.h) return undefined
  return { x, y }
}
function onItem(it: RowItem) {
  if (it.kind === 'mat') addLayer(it.mat)
  else if (it.kind === 'plus') openImportSourceMenu()
  else if (it.kind === 'none') {
    curBoard.value = -1
    if (selectedId.value === BOARD_LAYER_ID) selectedId.value = ''
    syncBoardLayerFromTransform()
    commit()
  }
  else if (it.kind === 'board') {
    curBoard.value = it.idx
    resetBoardTransform(true)
    selectedId.value = BOARD_LAYER_ID
    commit()
  }
  else if (it.kind === 'bag') {
    syncBoardTransformFromLayer()
    curBag.value = it.idx
    syncWindowFromBag(true)
    if (curBoard.value >= 0) resetBoardTransform(true)
    syncBoardLayerFromTransform()
    commit()
  }
}
function onMaterialDragStart(it: RowItem, clientX: number, clientY: number) {
  if (it.kind !== 'mat') return
  refreshStageRect() // ensure drop-point mapping has a fresh stage rect (native)
  // set the static (non-moving) fields ONCE at pickup, so per-move updates only
  // touch x/y — fewer reactive writes = smoother drag across the render/service bridge.
  materialDragGhost.w = it.mat.w
  materialDragGhost.h = it.mat.h
  materialDragGhost.color = it.mat.color
  materialDragGhost.label = it.mat.label
  materialDragGhost.shape = it.mat.shape
  materialDragGhost.src = it.mat.src || ''
  materialDragGhost.crop = it.mat.crop
  materialDragGhost.x = clientX
  materialDragGhost.y = clientY
  materialDragGhost.visible = true
}
function onMaterialDragMove(_it: RowItem, clientX: number, clientY: number) {
  // per-move: only the position changes
  materialDragGhost.x = clientX
  materialDragGhost.y = clientY
}
async function onMaterialDragEnd(it: RowItem, clientX: number, clientY: number, moved: boolean) {
  materialDragGhost.visible = false
  if (!moved || it.kind !== 'mat') return
  await refreshStageRect() // measure fresh at drop time so the point maps correctly
  const point = clientPointToWindowPoint(clientX, clientY)
  if (!point) return
  addLayer(it.mat, point)
}
function closeMaterialAssetActions() {
  materialAssetActionOpen.value = false
  materialAssetActionId.value = ''
}
function openMaterialAssetActions(it: RowItem) {
  if (it.kind !== 'mat' || !it.mat.assetId) return
  materialDragGhost.visible = false
  materialAssetActionId.value = it.mat.assetId
  materialAssetActionOpen.value = true
}
function editMaterialAsset() {
  const asset = userAssets.value.find((item) => item.id === materialAssetActionId.value)
  closeMaterialAssetActions()
  if (!asset) return
  openImportEditorFromAsset(asset)
}
function deleteMaterialAsset() {
  const id = materialAssetActionId.value
  const asset = userAssets.value.find((item) => item.id === id)
  closeMaterialAssetActions()
  if (!asset) {
    return
  }
  Taro.showModal({
    title: '删除素材',
    content: `确定删除「${asset.label}」吗？画布中使用它的图层也会移除。`,
    confirmText: '删除',
    confirmColor: '#d14343',
    success: async (res) => {
      if (!res.confirm) return
      userAssets.value = userAssets.value.filter((item) => item.id !== id)
      doc.layers = doc.layers.filter((layer) => layer.assetId !== id)
      if (selected.value?.assetId === id) selectedId.value = ''
      await userAssetsStore.del(id)
      await persistUserAssets()
      commit()
      Taro.showToast({ title: '已删除', icon: 'none' })
    },
  })
}
function removeLayer() {
  if (selectedId.value === BOARD_LAYER_ID) {
    curBoard.value = -1
    selectedId.value = ''
    syncBoardLayerFromTransform()
    commit()
    return
  }
  doc.layers = doc.layers.filter((l) => l.id !== selectedId.value)
  selectedId.value = ''
  commit()
}
function duplicateLayer() {
  const l = selected.value
  if (!l) return
  if (l.id === BOARD_LAYER_ID) {
    Taro.showToast({ title: '底板不可复制', icon: 'none' })
    return
  }
  const copy = { ...l, id: nextId(), x: clamp(l.x + 16, 0, win.w), y: clamp(l.y + 16, 0, win.h), locked: false }
  doc.layers.push(copy)
  selectedId.value = copy.id
  commit()
}
let lastLockToast = 0
function lockedToast() {
  const now = Date.now()
  if (now - lastLockToast < 800) return
  lastLockToast = now
  Taro.showToast({ title: '图层已锁定', icon: 'none' })
}
function openLayerDrawerForUnlock(ly: Layer) {
  selectedId.value = ly.id
  markLayer()
  showLayerDrawer.value = true
  Taro.showToast({ title: '在图层面板解锁', icon: 'none' })
}
function recordLockedDragAttempt(ly: Layer) {
  const count = (lockedDragFailures.get(ly.id) || 0) + 1
  if (count >= 3) {
    lockedDragFailures.set(ly.id, 0)
    openLayerDrawerForUnlock(ly)
    return
  }
  lockedDragFailures.set(ly.id, count)
  lockedToast()
}
function clearLayerLongPress() {
  if (layerLongPressTimer) {
    clearTimeout(layerLongPressTimer)
    layerLongPressTimer = 0
  }
}
function startLayerLongPress(ly: Layer, x: number, y: number) {
  clearLayerLongPress()
  layerLongPress = { id: ly.id, sx: x, sy: y, fired: false }
  layerLongPressTimer = setTimeout(() => {
    if (layerLongPress.id !== ly.id) return
    layerLongPress.fired = true
    selectedId.value = ly.id
    markLayer()
    showLayerDrawer.value = true
  }, LAYER_LONG_PRESS_MS)
}
function cancelLayerLongPressIfMoved(x: number, y: number) {
  if (!layerLongPress.id || layerLongPress.fired) return
  if (Math.abs(x - layerLongPress.sx) + Math.abs(y - layerLongPress.sy) > 8) clearLayerLongPress()
}
function finishLayerLongPress() {
  clearLayerLongPress()
  layerLongPress.id = ''
}
const SCALE_STEP = 0.05
const ROTATE_STEP = 1
function applyScaleStep(dir: number) {
  const l = selected.value
  if (!l) return false
  if (l.locked) { lockedToast(); return false }
  l.scale = boundedScale(l.scale + dir * SCALE_STEP)
  clampLayer(l)
  return true
}
function applyRotateStep(dir: number) {
  const l = selected.value
  if (!l) return false
  if (l.locked) { lockedToast(); return false }
  l.rotation = normalizeRotation(l.rotation + dir * ROTATE_STEP)
  clampLayer(l)
  return true
}
// 长按连续微调：按住先单步，停顿后开始重复；整段只提交一次历史
let holdT: any = 0
let holdI: any = 0
let holdDirty = false
function clearStepTimers() {
  if (holdT) { clearTimeout(holdT); holdT = 0 }
  if (holdI) { clearInterval(holdI); holdI = 0 }
}
function startStepHold(apply: (d: number) => boolean, dir: number) {
  const ok = apply(dir)
  if (!ok) return
  holdDirty = true
  clearStepTimers()
  holdT = setTimeout(() => { holdI = setInterval(() => { if (!apply(dir)) clearStepTimers() }, 80) }, 360)
}
function stopStepHold() {
  clearStepTimers()
  if (holdDirty) { holdDirty = false; commit() }
}
function onStepMouseDown(apply: (d: number) => boolean, dir: number) {
  startStepHold(apply, dir)
  const up = () => { if (typeof window !== 'undefined') window.removeEventListener('mouseup', up); stopStepHold() }
  if (typeof window !== 'undefined') window.addEventListener('mouseup', up)
}
function inputValue(e: any) {
  return String((e && e.detail && e.detail.value) ?? (e && e.target && e.target.value) ?? '')
}
function numericInputValue(e: any) {
  return inputValue(e).replace(/[^\d.-]/g, '')
}
function onNudgeFocus(field: 'scale' | 'rotation') {
  const l = selected.value
  if (!l) return
  if (l.locked) { lockedToast(); return }
  editingField.value = field
  editingText.value = field === 'scale'
    ? String(Math.round(boundedScale(l.scale) * 100))
    : String(displayRotation(l.rotation))
}
// 编辑期只缓存原始字符串，不实时 clamp/回写，避免受控输入打架
function onScaleInput(e: any) { editingText.value = inputValue(e) }
function onRotationInput(e: any) { editingText.value = inputValue(e) }
function commitNudgeInput() {
  const l = selected.value
  const field = editingField.value
  editingField.value = ''
  const raw = editingText.value.replace(/[^\d.-]/g, '').trim()
  editingText.value = ''
  if (!l || l.locked || !field) return
  if (raw === '') return
  const value = Number(raw)
  if (!Number.isFinite(value)) return
  if (field === 'scale') {
    const nv = boundedScale(value / 100)
    if (nv === l.scale) return
    l.scale = nv
  } else {
    const nv = normalizeRotation(value)
    if (nv === l.rotation) return
    l.rotation = nv
  }
  clampLayer(l)
  commit()
}
function startRotateHandle(x: number, y: number, ly: Layer) {
  if (ly.locked) { selectedId.value = ly.id; markLayer(); lockedToast(); return }
  selectedId.value = ly.id
  markLayer()
  const rect = stageScreenRect()
  const cx = rect ? rect.left + ((win.x + ly.x) / cw) * rect.width : x
  const cy = rect ? rect.top + ((win.y + ly.y) / ch) * rect.height : y
  const dx = x - cx
  const dy = y - cy
  rg = {
    id: ly.id,
    cx,
    cy,
    startDist: Math.max(1, Math.hypot(dx, dy)),
    startAngle: Math.atan2(dy, dx),
    startScale: ly.scale,
    startRotation: ly.rotation,
    moved: false,
  }
}
function moveRotateHandle(x: number, y: number, ly: Layer) {
  if (rg.id !== ly.id || ly.locked) return
  const dx = x - rg.cx
  const dy = y - rg.cy
  const distRatio = Math.hypot(dx, dy) / rg.startDist
  const angleDelta = Math.atan2(dy, dx) - rg.startAngle
  ly.scale = boundedScale(rg.startScale * distRatio)
  ly.rotation = normalizeRotation(rg.startRotation + (angleDelta * 180) / Math.PI)
  rg.moved = true
  clampLayer(ly)
}
function endRotateHandle() {
  if (rg.moved) commit()
  rg.id = ''
  rg.moved = false
}
function onRotateHandleTouchStart(e: any, ly: Layer) {
  const t = e.touches && e.touches[0]
  if (!t) return
  startRotateHandle(t.clientX, t.clientY, ly)
}
function onRotateHandleTouchMove(e: any, ly: Layer) {
  const t = e.touches && e.touches[0]
  if (!t) return
  if (e.preventDefault) e.preventDefault()
  moveRotateHandle(t.clientX, t.clientY, ly)
}
function onRotateHandleTouchEnd() { endRotateHandle() }
function onRotateHandleMouseDown(e: any, ly: Layer) {
  startRotateHandle(e.clientX, e.clientY, ly)
  bindWindowMouseDrag(
    (ev) => moveRotateHandle(ev.clientX, ev.clientY, ly),
    () => endRotateHandle(),
  )
}
function toggleLayerLock(id: string) {
  if (id === BOARD_LAYER_ID) {
    boardLayer.locked = !boardLayer.locked
    syncBoardTransformFromLayer()
    if (!boardLayer.locked) lockedDragFailures.delete(id)
    commit()
    return
  }
  const l = doc.layers.find((x) => x.id === id)
  if (!l) return
  l.locked = !l.locked
  if (!l.locked) lockedDragFailures.delete(id)
  commit()
}
function startReorder(id: string, visIdx: number, y: number) {
  if (id === BOARD_LAYER_ID) return
  lr = { id, fromVis: visIdx, startY: y, base: visibleLayerList.value.filter((l) => !l.fixed).map((l) => l.id), active: true, moved: false }
  reorderId.value = id
  reorderTargetVis.value = visIdx
  reorderOffsetY.value = 0
  reorderDragY.value = 0
}
function moveReorder(y: number) {
  if (!lr.active) return
  const dy = y - lr.startY
  if (Math.abs(dy) > 4) lr.moved = true
  const n = lr.base.length
  const maxUp = -lr.fromVis * ROW_PITCH
  const maxDown = (n - 1 - lr.fromVis) * ROW_PITCH
  reorderDragY.value = clamp(dy, maxUp, maxDown)
  const target = clamp(lr.fromVis + Math.round(reorderDragY.value / ROW_PITCH), 0, n - 1)
  reorderTargetVis.value = target
  reorderOffsetY.value = reorderDragY.value
}
function endReorder() {
  if (lr.active && lr.moved) {
    const order = lr.base.slice()
    const target = clamp(reorderTargetVis.value, 0, order.length - 1)
    const [m] = order.splice(lr.fromVis, 1)
    order.splice(target, 0, m)
    const byId = new Map(doc.layers.map((l) => [l.id, l]))
    doc.layers = order.reverse().map((id) => byId.get(id)).filter(Boolean) as Layer[]
    commit()
  }
  if (lr.active && lr.moved) {
    settledReorderId.value = lr.id
    if (typeof window !== 'undefined') window.setTimeout(() => { settledReorderId.value = '' }, 220)
    else settledReorderId.value = ''
  }
  lr.active = false
  reorderId.value = ''
  reorderTargetVis.value = -1
  reorderOffsetY.value = 0
  reorderDragY.value = 0
}
function onRowDragTouchStart(e: any, ly: Layer, idx: number) {
  const t = e.touches && e.touches[0]
  if (!t) return
  startReorder(ly.id, idx, t.clientY)
}
function onRowDragTouchMove(e: any) {
  const t = e.touches && e.touches[0]
  if (!t) return
  if (e.preventDefault) e.preventDefault()
  moveReorder(t.clientY)
}
function onRowDragTouchEnd() { endReorder() }
function onRowDragMouseDown(e: any, ly: Layer, idx: number) {
  if (e.preventDefault) e.preventDefault()
  startReorder(ly.id, idx, e.clientY)
  bindWindowMouseDrag(
    (ev) => { if (ev.preventDefault) ev.preventDefault(); moveReorder(ev.clientY) },
    () => endReorder(),
  )
}
function mirrorLayer() {
  const l = selected.value
  if (!l) return
  l.flipX = !l.flipX
  commit()
}
function centerLayer() {
  const l = selected.value
  if (!l) return
  l.x = win.w / 2
  l.y = win.h / 2
  commit()
}
function fitSelection() { centerLayer() }
function toggleGrid() { showGrid.value = !showGrid.value; commit() }
function toggleStageZoom() { stageZoomed.value = !stageZoomed.value; setTimeout(refreshStageRect, 420) }
function clampLayer(ly: Layer) {
  const visiblePad = Math.min(28, Math.max(14, Math.min(win.w, win.h) * 0.16))
  // 旋转感知：用旋转后包围盒的半宽高
  const rad = (ly.rotation * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const w = ly.w * ly.scale
  const h = ly.h * ly.scale
  const halfW = (w * c + h * s) / 2
  const halfH = (w * s + h * c) / 2
  const minX = -halfW + visiblePad
  const maxX = win.w + halfW - visiblePad
  const minY = -halfH + visiblePad
  const maxY = win.h + halfH - visiblePad
  ly.x = minX <= maxX ? clamp(ly.x, minX, maxX) : win.w / 2
  ly.y = minY <= maxY ? clamp(ly.y, minY, maxY) : win.h / 2
}

function layerStyle(ly: Layer, i: number) {
  // Position via transform (not left/top) so dragging is a compositor-only move
  // instead of a per-frame layout reflow — noticeably more "跟手" in the webview
  // render thread. Math is identical: transform-origin is center, so the element's
  // center still lands exactly at (ly.x, ly.y).
  return {
    left: '0px',
    top: '0px',
    width: ly.w + 'px',
    height: ly.h + 'px',
    zIndex: String(10 + i),
    transform: `translate(${ly.x}px, ${ly.y}px) translate(-50%,-50%) rotate(${ly.rotation}deg) scale(${ly.scale})`,
    willChange: 'transform',
  }
}
function layerRowStyle(ly: Layer, idx: number) {
  if (!reorderId.value || !lr.active) return {}
  if (ly.id === reorderId.value) return { '--row-shift': `${reorderOffsetY.value}px` }
  const from = lr.fromVis
  const target = reorderTargetVis.value
  if (target > from && idx > from && idx <= target) return { '--row-shift': `${-ROW_PITCH}px` }
  if (target < from && idx >= target && idx < from) return { '--row-shift': `${ROW_PITCH}px` }
  return {}
}
function selectedHandleStyle(ly: Layer) {
  // Same transform-based positioning as the layer, so the selection frame tracks
  // the drag on the compositor rather than reflowing left/top every frame.
  return {
    left: win.x + 'px',
    top: win.y + 'px',
    width: ly.w + 'px',
    height: ly.h + 'px',
    '--handle-rotation': '0deg',
    '--handle-scale': `${1 / ly.scale}`,
    transform: `translate(${ly.x}px, ${ly.y}px) translate(-50%,-50%) rotate(${ly.rotation}deg) scale(${ly.scale})`,
    willChange: 'transform',
  }
}

function onTouchStart(e: any, ly: Layer) {
  selectedId.value = ly.id
  markLayer()
  refreshStageRect() // keep rotate-center / drop mapping accurate (native)
  const t = e.touches || []
  if (t.length) startLayerLongPress(ly, t[0].clientX, t[0].clientY)
  if (ly.locked) { recordLockedDragAttempt(ly); return }
  dragged = false
  layerDragging.value = false
  if (t.length >= 2) g = { id: ly.id, mode: 'pinch', sx: 0, sy: 0, lx: 0, ly: 0, sd: dist(t[0], t[1]), sa: ang(t[0], t[1]), ss: ly.scale, sr: ly.rotation }
  else if (t.length) g = { id: ly.id, mode: 'move', sx: t[0].clientX, sy: t[0].clientY, lx: ly.x, ly: ly.y, sd: 0, sa: 0, ss: 1, sr: 0 }
}
function onTouchMove(e: any, ly: Layer) {
  const t = e.touches || []
  if (t.length) cancelLayerLongPressIfMoved(t[0].clientX, t[0].clientY)
  if (g.id !== ly.id || ly.locked) return
  if (e.preventDefault) e.preventDefault()
  dragged = true
  layerDragging.value = true
  if (g.mode === 'pinch' && t.length >= 2) {
    ly.scale = boundedScale(g.ss * (dist(t[0], t[1]) / g.sd))
    ly.rotation = normalizeRotation(g.sr + (ang(t[0], t[1]) - g.sa))
    clampLayer(ly)
  } else if (g.mode === 'move' && t.length) {
    ly.x = g.lx + (t[0].clientX - g.sx)
    ly.y = g.ly + (t[0].clientY - g.sy)
    clampLayer(ly)
  }
}
function onTouchEnd() {
  finishLayerLongPress()
  if (dragged) commit()
  dragged = false
  layerDragging.value = false
  g.mode = ''
}
function onMouseDown(e: any, ly: Layer) {
  selectedId.value = ly.id
  markLayer()
  startLayerLongPress(ly, e.clientX, e.clientY)
  if (ly.locked) {
    recordLockedDragAttempt(ly)
    const clearLockedPress = () => {
      if (typeof window !== 'undefined') window.removeEventListener('mouseup', clearLockedPress)
      finishLayerLongPress()
    }
    if (typeof window !== 'undefined') window.addEventListener('mouseup', clearLockedPress)
    return
  }
  const sx = e.clientX, sy = e.clientY, lx = ly.x, lyy = ly.y
  let moved = false
  bindWindowMouseDrag(
    (ev) => {
      cancelLayerLongPressIfMoved(ev.clientX, ev.clientY)
      moved = true
      layerDragging.value = true
      ly.x = lx + (ev.clientX - sx)
      ly.y = lyy + (ev.clientY - sy)
      clampLayer(ly)
    },
    () => {
      finishLayerLongPress()
      if (moved) commit()
      layerDragging.value = false
    },
  )
}

const userAssetsStore = createKvStore(USER_ASSETS_DB_NAME, USER_ASSETS_STORE)
function hydrateLayerAssetSources(layers: Layer[]) {
  return layers.map((layer) => {
    if (!layer.assetId || layer.src) return layer
    const asset = userAssets.value.find((item) => item.id === layer.assetId)
    return asset?.src ? { ...layer, src: asset.src } : layer
  })
}
async function persistUserAssets() {
  const useDb = userAssetsStore.canUse()
  if (useDb) {
    await Promise.all(userAssets.value.map((asset) => userAssetsStore.put(asset.id, asset.src)))
  }
  const stored: StoredUserAsset[] = userAssets.value.map((asset) => ({
    id: asset.id,
    type: asset.type,
    sub: asset.sub,
    label: asset.label,
    color: asset.color,
    w: asset.w,
    h: asset.h,
    shape: asset.shape,
    crop: asset.crop,
    source: asset.source,
    spuId: asset.spuId,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    src: useDb ? undefined : asset.src,
  }))
  try {
    Taro.setStorageSync(USER_ASSETS_KEY, stored)
  } catch (_) {
    // Native stores full data URLs inline — hitting the storage quota here means
    // the asset silently vanishes on next launch. Tell the user instead.
    Taro.showToast({ title: '素材存储空间不足，最新素材可能无法保留', icon: 'none' })
  }
}
async function loadUserAssets() {
  try {
    const records = Taro.getStorageSync(USER_ASSETS_KEY)
    if (!Array.isArray(records)) return
    const hydrated = await Promise.all(records.map(async (record: Partial<StoredUserAsset>) => {
      if (!record?.id || !record.createdAt) return undefined
      const src = record.src || await userAssetsStore.get(record.id)
      if (!src) return undefined
      const sub = record.sub || '其他'
      const shape = record.shape || guessAssetShape((record.type as UserAsset['type']) || '谷子', sub)
      const size = defaultAssetSize(sub, shape)
      return {
        id: record.id,
        type: (record.type as UserAsset['type']) || '谷子',
        sub,
        label: record.label || sub,
        color: record.color || '#fff',
        w: record.w || size.w,
        h: record.h || size.h,
        shape,
        src,
        crop: record.crop,
        source: record.source || 'import',
        spuId: record.spuId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt || record.createdAt,
      } as UserAsset
    }))
    userAssets.value = hydrated
      .filter((asset): asset is UserAsset => !!asset)
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch (_) {}
}
// Normalized crop rect (0~1 of the displayed image) from the current selection.
function computeImportCropRect(): ImgCrop {
  return normalizeCropRect(importCrop, importCropImageFrame())
}
// Layer/box size from the crop's aspect. The box aspect MUST equal the crop aspect
// so the CSS clip renders it undistorted. circle → square.
function importedAssetBox(shape: Shape, aspect: number): { w: number; h: number } {
  if (shape === 'circle') return { w: 60, h: 60 }
  const a = aspect > 0 && isFinite(aspect) ? aspect : 1
  const max = 70
  if (a >= 1) return { w: max, h: Math.max(20, Math.round(max / a)) }
  return { w: Math.max(20, Math.round(max * a)), h: max }
}
async function createImportedAsset(src: string, options?: { type?: UserAsset['type']; sub?: string; label?: string; shape?: Shape; spuId?: string }) {
  const type: UserAsset['type'] = options?.type || (category.value === '装饰' ? '装饰' : '谷子')
  const sub = options?.sub || (subCat.value === '全部' ? '其他' : subCat.value)
  const shape = options?.shape || 'rect'
  const createdAt = Date.now()
  const id = `asset_${createdAt}_${Math.random().toString(36).slice(2, 7)}`
  // Store the FULL image + a normalized crop rect. The crop is applied at render time
  // via CSS clip (real crop, no canvas dependency — works on device where canvas export
  // does not). Persist as a data URL since temp paths expire.
  const fullSrc = await imageSourceToDataUrl(src)
  const crop = computeImportCropRect()
  const size = importedAssetBox(shape, importCrop.w / Math.max(1, importCrop.h))
  const asset: UserAsset = {
    id,
    type,
    sub,
    label: (options?.label || '').trim() || (sub === '其他' ? '导入图片' : sub),
    color: options?.spuId ? 'transparent' : '#fff',
    w: size.w,
    h: size.h,
    shape,
    src: fullSrc,
    crop,
    source: options?.spuId ? 'spu' : 'import',
    spuId: options?.spuId || undefined,
    createdAt,
    updatedAt: createdAt,
  }
  userAssets.value = [asset, ...userAssets.value]
  await persistUserAssets()
  return asset
}
function resetImportDraft() {
  importDraft.src = ''
  importDraft.storedSrc = ''
  importDraft.editAssetId = ''
  importDraft.type = '谷子'
  importDraft.sub = '其他'
  importDraft.label = ''
  importDraft.shape = 'rect'
  importDraft.sourceW = 0
  importDraft.sourceH = 0
  importDraft.spuId = ''
}
// preset：SPU 导入复用同一编辑器 —— 预填推断的分类/形状/标题，并携带 spuId 到 confirm。
async function openImportEditor(
  src: string,
  sourceSize?: { width: number; height: number },
  preset?: { sub?: string; label?: string; shape?: Shape; spuId?: string },
) {
  const type: UserAsset['type'] = preset?.spuId ? '谷子' : category.value === '装饰' ? '装饰' : '谷子'
  const subOptions = (SUBCATS[type] || ['全部']).filter((item) => item !== '全部')
  const sub = preset?.sub && subOptions.includes(preset.sub)
    ? preset.sub
    : subCat.value !== '全部' && subOptions.includes(subCat.value) ? subCat.value : (subOptions[0] || '其他')
  const normalizedSize = normalizeImageSize(sourceSize?.width, sourceSize?.height)
  // CRITICAL for WYSIWYG: the editor and the final layer/cell MUST render the exact
  // same image SOURCE STRING. Previously the editor showed the temp file path while
  // the stored asset rendered a data URL — Dimina/iOS can render those two differently
  // (EXIF orientation / decode), so the same normalized crop mapped to a different
  // visual region → "货不对板". Convert to a data URL up front and use it for BOTH the
  // editor preview and storage, so the selection and the cut-out are pixel-identical.
  const displaySrc = await imageSourceToDataUrl(src)
  importDraft.src = displaySrc
  importDraft.storedSrc = displaySrc
  importDraft.editAssetId = ''
  importDraft.type = type
  importDraft.sub = sub
  importDraft.label = (preset?.label || '').trim() || (sub === '其他' ? '导入图片' : sub)
  importDraft.shape = preset?.shape || 'rect'
  importDraft.spuId = preset?.spuId || ''
  importDraft.sourceW = normalizedSize?.width || 0
  importDraft.sourceH = normalizedSize?.height || 0
  // Leave imageW/H at 0 so the widthFix probe renders and measures through the real
  // display pipeline. sourceW/H only pre-size the stage and back the probe up —
  // picker metadata is EXIF-blind on device photos and must not preempt the probe.
  importCrop.imageW = 0
  importCrop.imageH = 0
  importReady.value = false
  importEditorOpen.value = true
  await refreshImportCropStage(true)
  importReady.value = true
}
// Map a stored normalized crop back onto the current stage's image frame, so the
// edit session starts with the user's EXISTING selection (a plain 保存 keeps it).
function seedImportCropFromExisting(crop: ImgCrop) {
  const r = denormalizeCropRect(crop, importCropImageFrame())
  importCrop.x = r.x
  importCrop.y = r.y
  importCrop.w = r.w
  importCrop.h = r.h
  clampImportCrop()
}
async function openImportEditorFromAsset(asset: UserAsset) {
  importReady.value = false
  importDraft.src = asset.src
  importDraft.storedSrc = asset.src
  importDraft.editAssetId = asset.id
  importDraft.type = asset.type
  importDraft.sub = asset.sub
  importDraft.label = asset.label
  importDraft.shape = asset.shape
  importDraft.spuId = '' // 编辑分支保留原 asset 的 source/spuId，这里只需清掉残留
  // Do NOT seed dims from asset.w/h — those are the (clamped) layer box size, not the
  // image's true pixel aspect. Leaving them 0 makes refreshImportCropStage measure the
  // real aspect from asset.src (a data URL → byte parser), so the edit preview shows
  // the image at its true ratio instead of stretched to the layer box.
  importDraft.sourceW = 0
  importDraft.sourceH = 0
  importCrop.imageW = 0
  importCrop.imageH = 0
  importEditorOpen.value = true
  // Await the measure/restyle BEFORE seeding — a dangling .then() let an early 保存
  // run computeImportCropRect() on the default (reset) selection and silently
  // overwrite the stored crop (and every placed layer). importReady gates confirm
  // until the seed below lands.
  await refreshImportCropStage(true)
  // asset.src is the FULL image; restore the stored crop as the selection so
  // saving without touching it doesn't silently reset the crop to the whole
  // image (and rewrite every placed layer). Legacy baked assets (no crop:
  // src already IS the cut-out) select the whole image to stay intact.
  if (asset.crop) seedImportCropFromExisting(asset.crop)
  else resetImportCropForShape(1)
  importReady.value = true
}
function onImportLabelInput(event: any) {
  importDraft.label = event?.detail?.value || ''
}
function setImportDraftSub(sub: string) {
  importDraft.sub = sub
  if (!importDraft.label || importDraftSubcats.value.includes(importDraft.label)) importDraft.label = sub
}
function setImportDraftShape(shape: Shape) {
  importDraft.shape = shape
  resetImportCropForShape()
}
// Folding the drawer changes how much height the stage gets. Re-read the stage
// rect (twice: once to update the max box, once after the stage restyles to its new
// size) and re-clamp the selection — but do NOT re-measure the image (its probe is
// gone after the first read, so re-measuring would fall back to a wrong aspect).
watch(importDrawerCollapsed, () => {
  if (!importEditorOpen.value) return
  nextTick(async () => {
    const before = importCropImageFrame()
    await readImportCropStageRect()
    await nextTick()
    await readImportCropStageRect(true)
    const after = importCropImageFrame()
    // rescale the selection proportionally so it keeps its spot + size relative to
    // the image as the stage grows/shrinks (instead of sticking to a corner).
    if (before.w > 1 && before.h > 1 && after.w > 1 && after.h > 1) {
      const sx = after.w / before.w
      const sy = after.h / before.h
      importCrop.x = after.x + (importCrop.x - before.x) * sx
      importCrop.y = after.y + (importCrop.y - before.y) * sy
      importCrop.w = importCrop.w * sx
      importCrop.h = importCrop.h * sy
    }
    clampImportCrop()
  })
})
function onSmartRecognition() {
  Taro.showToast({ title: '智能识别仍在开发中', icon: 'none' })
}
// After importing/saving, make sure the shelf shows the asset's category — otherwise
// a mismatched subcategory filter hides the new asset and the import looks like it failed.
function revealAssetInShelf(type: UserAsset['type'], sub: string) {
  category.value = type
  if (subCat.value !== '全部' && subCat.value !== sub) subCat.value = sub
}
function cancelImportEditor() {
  importEditorOpen.value = false
  importReady.value = false
  resetImportDraft()
}
async function confirmImportEditor() {
  if (!importDraft.storedSrc && !importDraft.src) return
  // Guard the race: the crop stage seeds asynchronously after open. Saving before it
  // is ready would persist a default/stale crop over the real selection.
  if (!importReady.value) return
  // Save-lock: confirm awaits async encode/persist. A fast double-tap on 导入/保存
  // would otherwise create a duplicate asset (new import) or concurrently rewrite the
  // same asset + layers (edit). Ignore re-entry until this run settles.
  if (importSaving.value) return
  importSaving.value = true
  try {
    if (importDraft.editAssetId) {
      const index = userAssets.value.findIndex((item) => item.id === importDraft.editAssetId)
      if (index < 0) return
      const sub = importDraft.sub
      const shape = importDraft.shape
      const fullSrc = await imageSourceToDataUrl(importDraft.storedSrc || importDraft.src)
      const crop = computeImportCropRect()
      const size = importedAssetBox(shape, importCrop.w / Math.max(1, importCrop.h))
      const updated: UserAsset = {
        ...userAssets.value[index],
        type: importDraft.type,
        sub,
        label: importDraft.label.trim() || (sub === '其他' ? '导入图片' : sub),
        w: size.w,
        h: size.h,
        shape,
        src: fullSrc,
        crop,
        updatedAt: Date.now(),
      }
      // Replace in place — loadUserAssets re-sorts by createdAt on next launch, so
      // moving the edited asset to the front would only reorder until a restart.
      userAssets.value = userAssets.value.map((item, i) => (i === index ? updated : item))
      doc.layers = doc.layers.map((layer) => {
        if (layer.assetId !== updated.id) return layer
        return {
          ...layer,
          type: updated.type,
          sub: updated.sub,
          label: updated.label,
          w: updated.w,
          h: updated.h,
          shape: updated.shape,
          src: updated.src,
          crop: updated.crop,
        }
      })
      await persistUserAssets()
      importEditorOpen.value = false
      resetImportDraft()
      revealAssetInShelf(updated.type, updated.sub)
      commit()
      Taro.showToast({ title: '已更新', icon: 'none' })
      return
    }
    const asset = await createImportedAsset(importDraft.storedSrc || importDraft.src, {
      type: importDraft.type,
      sub: importDraft.sub,
      label: importDraft.label,
      shape: importDraft.shape,
      spuId: importDraft.spuId || undefined,
    })
    importEditorOpen.value = false
    resetImportDraft()
    revealAssetInShelf(asset.type, asset.sub)
    Taro.showToast({ title: asset.source === 'spu' ? '已从资料库导入' : '已导入', icon: 'none' })
  } finally {
    importSaving.value = false
  }
}

// ─── 千岛资料库（SPU）导入 ───
// 搜索/导入状态集中在页面里（组件 props in / events out）；服务请求与字段映射在
// src/services/qiandao/。链路：搜索 → 选中 → 拉透明图/主图 → 转 data URL →
// 资料库图片统一进入 ImportCropEditor，用户可改名、换分类，并处理假透明底/裁剪微调。
const spuService = resolveQiandaoSpuService()
const spuSearchOpen = ref(false)
const spuKeyword = ref('')
const spuLoading = ref(false)
const spuError = ref('')
const spuSearched = ref(false)
const spuItems = ref<QiandaoSpuSummary[]>([])
const spuImportingId = ref('')
const ownedSpuIds = computed(() => userAssets.value.map((asset) => asset.spuId).filter((id): id is string => !!id))
let spuSearchSeq = 0

function openSpuSearch() {
  spuSearchOpen.value = true
  // 未配置后端代理时开门见山：面板直接进入可理解的失败态，而不是搜索后才报错
  if (spuService.mode === 'unconfigured' && !spuSearched.value && !spuError.value) {
    spuError.value = 'SPU 资料库服务未配置：需要 Gooda 后端代理转发官方 OpenAPI（/spu/v1/search、/spu/v1/detail）'
  }
}
function closeSpuSearch() {
  spuSearchOpen.value = false
}
function onSpuKeywordInput(event: any) {
  spuKeyword.value = inputValue(event)
}
async function runSpuSearch() {
  const keyword = spuKeyword.value.trim()
  if (!keyword) {
    Taro.showToast({ title: '输入 IP / 角色 / 谷子名', icon: 'none' })
    return
  }
  const seq = ++spuSearchSeq
  spuLoading.value = true
  spuError.value = ''
  spuSearched.value = true
  try {
    const result = await spuService.client.searchSpu({ keyword, page: 1, pageSize: 24 })
    if (seq !== spuSearchSeq) return
    spuItems.value = result.items
  } catch (err: any) {
    if (seq !== spuSearchSeq) return
    spuItems.value = []
    spuError.value = err instanceof QiandaoSpuServiceError ? err.message : '搜索失败，请检查网络后重试'
  } finally {
    if (seq === spuSearchSeq) spuLoading.value = false
  }
}
function spuAssetLabel(spu: QiandaoSpuSummary, sub: string) {
  return (spu.title || sub).slice(0, 12) // 与导入编辑器名称输入框 maxlength 一致
}
async function doImportSpu(item: QiandaoSpuSummary) {
  spuImportingId.value = item.id
  try {
    let spu = item
    if (!spu.transparentImage) {
      // 详情接口常带 whiteBgPng 透明图，拿到就能免手动裁剪；失败不阻断，退回列表图
      try {
        const detail = await spuService.client.getSpuDetail(item.id)
        if (detail) {
          spu = {
            ...item,
            title: detail.title || item.title,
            image: detail.image || item.image,
            transparentImage: detail.transparentImage || item.transparentImage,
            typeId: detail.typeId || item.typeId,
            typeName: detail.typeName || item.typeName,
            sourceUrl: detail.sourceUrl || item.sourceUrl,
            priceText: detail.priceText || item.priceText,
          }
        }
      } catch (_) {}
    }
    const remote = bestSpuImage(spu)
    if (!remote) {
      Taro.showToast({ title: '该谷子暂无可用图片', icon: 'none' })
      return
    }
    const dataUrl = await remoteImageToDataUrl(remote)
    if (!dataUrl.startsWith('data:')) {
      // 防盗链/CORS 拦截时宁可明确失败，也不把易失效的远程 URL 存进谷子池
      Taro.showToast({ title: '图片下载失败，请稍后重试', icon: 'none' })
      return
    }
    const sub = inferGuziSubFromSpu(spu)
    const shape = guessAssetShape('谷子', sub)
    closeSpuSearch()
    await openImportEditor(dataUrl, undefined, { sub, shape, label: spuAssetLabel(spu, sub), spuId: spu.id })
  } finally {
    spuImportingId.value = ''
  }
}
async function importSpuFromLibrary(item: QiandaoSpuSummary) {
  if (spuImportingId.value) return
  const existing = userAssets.value.find((asset) => asset.spuId === item.id)
  if (existing) {
    // 不静默重复：明确问一句；「去查看」直接切到素材架对应分类
    Taro.showModal({
      title: '已在谷子池',
      content: `「${existing.label}」已从资料库导入过，还要再导一份吗？`,
      confirmText: '再导一份',
      cancelText: '去查看',
      success: (res) => {
        if (res.confirm) {
          void doImportSpu(item)
        } else {
          closeSpuSearch()
          revealAssetInShelf('谷子', existing.sub)
        }
      },
    })
    return
  }
  await doImportSpu(item)
}

function openImportSourceMenu() {
  const isGuzi = category.value === '谷子'
  const itemList = isGuzi ? ['社区资料库', '拍摄', '相册'] : ['拍摄', '相册']
  Taro.showActionSheet({
    itemList,
    success: (res) => {
      const item = itemList[res.tapIndex]
      if (item === '社区资料库') {
        openSpuSearch()
        return
      }
      void chooseImageLayer(item === '拍摄' ? ['camera'] : ['album'])
    },
  })
}

async function chooseImageLayer(sourceType: Array<'album' | 'camera'> = ['album', 'camera']) {
  Taro.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType,
    success: async (res) => {
      const src = res.tempFilePaths && res.tempFilePaths[0]
      if (!src) return
      const fileSize = imageSizeFromFile((res as any).tempFiles && (res as any).tempFiles[0])
      await openImportEditor(src, fileSize)
    },
    fail: () => Taro.showToast({ title: '未选择图片', icon: 'none' }),
  })
}

function saveWork(showToast = true) {
  const data = { version: STORAGE_VERSION, ...storageSnapshot(), selectedId: selectedId.value, seq }
  try {
    Taro.setStorageSync(STORAGE_KEY, data)
    if (showToast) Taro.showToast({ title: '已保存', icon: 'none' })
  } catch (_) {
    if (showToast) Taro.showToast({ title: '保存失败', icon: 'none' })
  }
}
function loadWork() {
  try {
    const data = Taro.getStorageSync(STORAGE_KEY)
    if (!data || !Array.isArray(data.layers)) return
    applySnapshot({
      layers: data.layers,
      curBoard: typeof data.curBoard === 'number' ? data.curBoard : -1,
      curBag: data.curBag || 0,
      showGrid: data.version === STORAGE_VERSION && typeof data.showGrid === 'boolean' ? data.showGrid : false,
      boardTransform: data.version === STORAGE_VERSION ? data.boardTransform : undefined,
    })
    if (data.version !== STORAGE_VERSION && curBoard.value >= 0) resetBoardTransform(true)
    selectedId.value = data.selectedId || ''
    seq = data.seq || data.layers.length
  } catch (_) {}
}

function formatExportHistoryTime(ts: number) {
  const d = new Date(ts)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function normalizeExportRecord(r: Partial<StoredExportHistoryRecord>, i: number, src = r.src): ExportHistoryRecord | undefined {
  if (!r || !src || !r.createdAt) return undefined
  return {
    id: r.id || `${r.createdAt}-${i}`,
    src,
    createdAt: r.createdAt,
    name: r.name || '导出图',
    timeText: formatExportHistoryTime(r.createdAt),
  }
}
const exportHistoryStore = createKvStore(EXPORT_HISTORY_DB_NAME, EXPORT_HISTORY_STORE)
async function persistExportHistory() {
  const useDb = exportHistoryStore.canUse()
  if (useDb) {
    await Promise.all(exportHistory.value.map((record) => exportHistoryStore.put(record.id, record.src)))
  }
  const keepIds = new Set(exportHistory.value.map((record) => record.id))
  const storedRecords: StoredExportHistoryRecord[] = exportHistory.value.map((record) => ({
    id: record.id,
    createdAt: record.createdAt,
    name: record.name,
    timeText: record.timeText,
    src: useDb ? undefined : record.src,
  }))
  try {
    Taro.setStorageSync(EXPORT_HISTORY_KEY, storedRecords)
  } catch (_) {}
  if (useDb) {
    // Best-effort pruning; old inline-storage records are harmless if they were never mirrored.
    const records = Taro.getStorageSync(EXPORT_HISTORY_KEY)
    if (Array.isArray(records)) {
      await Promise.all(records.filter((r) => r?.id && !keepIds.has(r.id)).map((r) => exportHistoryStore.del(r.id)))
    }
  }
}
async function loadExportHistory() {
  try {
    const records = Taro.getStorageSync(EXPORT_HISTORY_KEY)
    if (!Array.isArray(records)) return
    const hydrated = await Promise.all(records.map(async (r, i) => {
      const src = r?.src || await exportHistoryStore.get(r?.id || "")
      return normalizeExportRecord(r, i, src)
    }))
    exportHistory.value = hydrated
      .filter((r): r is ExportHistoryRecord => !!r)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, EXPORT_HISTORY_LIMIT)
  } catch (_) {}
}
async function addExportHistory(src: string) {
  const createdAt = Date.now()
  const record: ExportHistoryRecord = {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
    src,
    createdAt,
    name: `${bags[curBag.value].label}导出图`,
    timeText: formatExportHistoryTime(createdAt),
  }
  exportHistory.value = [record, ...exportHistory.value].slice(0, EXPORT_HISTORY_LIMIT)
  await persistExportHistory()
}
async function openExportHistory() {
  await loadExportHistory()
  resultPreviewOpen.value = false
  exportHistoryOpen.value = true
}
function closeExportHistory() {
  exportHistoryOpen.value = false
}
async function previewExportHistory(record: ExportHistoryRecord) {
  const src = record.src || await exportHistoryStore.get(record.id)
  if (!src) {
    Taro.showToast({ title: '历史图片已失效', icon: 'none' })
    return
  }
  resultSrc.value = src
  exportHistoryOpen.value = false
  resultPreviewOpen.value = true
}

async function exportImage() {
  resultSrc.value = ''
  resultPreviewOpen.value = false
  exportHistoryOpen.value = false
  let result: Awaited<ReturnType<typeof exportEditorImage>> | undefined
  Taro.showLoading({ title: '导出中' })
  try {
    syncBoardTransformFromLayer()
    saveWork(false)
    result = await exportEditorImage({
      canvasId: 'exportCanvas',
      cw,
      ch,
      win,
      curBoard: curBoard.value,
      curBag: curBag.value,
      boardLayer: hasBoardLayer.value ? { ...boardLayer } : undefined,
      layers: cloneLayers(),
    })
    if (result.ok) {
      resultSrc.value = result.src
      await addExportHistory(result.src)
      resultPreviewOpen.value = true
    }
  } catch (err: any) {
    result = { ok: false, stage: 'unexpected', detail: (err && (err.message || err.errMsg)) || String(err) }
  } finally {
    Taro.hideLoading()
  }
  if (result && !result.ok) {
    // 分级、可截图的错误：让用户能把"卡在哪一步"直接发回来，而不是只有"请重试"。
    console.warn('[gooda-export] failed', result.stage, result.detail)
    Taro.showModal({
      title: '导出失败',
      content: `阶段：${result.stage}\n${result.detail}`,
      showCancel: false,
      confirmText: '知道了',
    })
  }
}
function closeExportPreview() {
  resultPreviewOpen.value = false
}
const EXPORT_FILE_NAME = 'gooda-export.png'

function dataUrlToFile(dataUrl: string, fileName = EXPORT_FILE_NAME) {
  if (typeof atob === 'undefined' || typeof File === 'undefined') return undefined
  const parts = dataUrl.split(',')
  if (parts.length < 2) return undefined
  const mime = parts[0].match(/data:([^;]+);base64/)?.[1] || 'image/png'
  const binary = atob(parts[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}

function triggerH5Download(src: string, file?: File) {
  if (typeof document === 'undefined') return false
  let href = src
  let objectUrl = ''
  if (file && typeof URL !== 'undefined' && URL.createObjectURL) {
    objectUrl = URL.createObjectURL(file)
    href = objectUrl
  }
  const a = document.createElement('a')
  a.href = href
  a.download = `gooda-export-${Date.now()}.png`
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1200)
  return true
}

async function saveH5ExportImage(src: string) {
  const file = src.startsWith('data:') ? dataUrlToFile(src) : undefined
  const nav = typeof navigator !== 'undefined' ? (navigator as any) : undefined
  if (file && nav?.share && nav?.canShare?.({ files: [file] })) {
    try {
      await nav.share({
        files: [file],
        title: '谷搭导出图',
      })
      Taro.showToast({ title: '已打开保存面板', icon: 'none' })
      return
    } catch (err: any) {
      if (err?.name === 'AbortError') return
    }
  }
  if (triggerH5Download(src, file)) {
    Taro.showToast({ title: '如未保存，请长按图片', icon: 'none' })
    return
  }
  Taro.showToast({ title: '请长按图片保存', icon: 'none' })
}

function saveError(detail: string) {
  console.warn('[gooda-export] save failed', detail)
  Taro.showModal({ title: '保存失败', content: detail, showCancel: false, confirmText: '知道了' })
}
// Dimina 回调以 [result] 数组形态回传，取首元素拿真实 errMsg。
function errMsgOf(err: any): string {
  const e = Array.isArray(err) ? err[0] : err
  return (e && (e.errMsg || e.message)) || ''
}
// iOS 宿主的 saveImageToPhotosAlbum 用 UIImage(contentsOfFile:) 直接打开 filePath，
// 不解析 difile:// → 直存失败。previewImage 会把 difile 解析成真实沙盒路径并弹出
// 原生大图（showMenu），用户长按走系统「存储图片」，由系统处理相册权限。这是纯
// Dimina 下 iOS 可靠的保存路径；Android 直存已可用，仅在直存失败时才走这里兜底。
function previewSaveFallback(path: string) {
  Taro.previewImage({
    current: path,
    urls: [path],
    success: () => Taro.showToast({ title: '长按图片选择「存储图片」', icon: 'none' }),
    fail: (err: any) => saveError(errMsgOf(err) || '无法打开图片预览'),
  })
}

async function saveExportImage() {
  if (!resultSrc.value) return
  if (process.env.TARO_ENV === 'h5') {
    await saveH5ExportImage(resultSrc.value)
    return
  }
  // 原生（Dimina/千岛）：canvasToTempFilePath 返回 data URL，而存相册/预览的原生
  // 图片 VC 只认临时目录路径（difile://usr 会报 image not found）。smart 保存会
  // 依次尝试 difile://tmp 文件 → difile://usr 文件 → data URL，第一个成功即用。
  Taro.showLoading({ title: '保存中' })
  let res: { ok: boolean; path: string; report: string }
  try {
    res = await saveImageNativeSmart(resultSrc.value)
  } finally {
    Taro.hideLoading()
  }
  if (res.ok) {
    Taro.showToast({ title: '已保存到相册', icon: 'none' })
    return
  }
  // 全部直存失败：兜底打开原生大图，用户长按走系统「存储图片」。附带诊断以便定位。
  console.warn('[gooda-export] save failed\n' + res.report)
  Taro.showModal({
    title: '保存失败',
    content: `已尝试多种方式仍失败，可点「打开大图」长按保存。\n${res.report}`,
    confirmText: '打开大图',
    cancelText: '关闭',
    success: (r: any) => {
      const rr = Array.isArray(r) ? r[0] : r
      if (rr && rr.confirm && res.path) previewSaveFallback(res.path)
    },
  })
}
</script>

<style src="../../styles/gooda-theme.css"></style>
