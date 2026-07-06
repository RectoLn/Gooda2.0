<template>
  <view v-if="open" class="spu-mask" @tap.self="$emit('close')">
    <view class="spu-panel" @tap.stop>
      <view class="spu-head">
        <text class="spu-title">千岛资料库</text>
        <view class="spu-close" @tap="$emit('close')"><text>×</text></view>
      </view>
      <view v-if="serviceMode === 'mock'" class="spu-mode-tip">
        演示数据 · 资料库服务未配置（联调时设置 TARO_APP_SPU_PROXY_BASE）
      </view>
      <view class="spu-search-row">
        <!-- 拼音失焦根因：weapp/Dimina 运行时在组件重渲染时会重建原生 input，打断 IME
             组合态 → 失焦/无法选字。所以打字期间【绝不触发任何重渲染】：
             1) 不绑 :value（非受控）；2) @input 只写面板本地的【非响应式】变量 keywordValue
             （普通 let，改它不会 re-render）；3) 到搜索/回车才把关键词随事件抛给父组件。
             面板 v-if 每次打开都重挂载 → keywordValue 天然重置为空。 -->
        <input
          class="spu-input"
          type="text"
          confirm-type="search"
          placeholder="搜索 IP / 角色 / 谷子名"
          @input="onInput"
          @confirm="onSearch"
        />
        <view class="spu-search-btn" @tap="onSearch">搜索</view>
      </view>
      <view class="spu-body">
        <view v-if="loading" class="spu-status"><text>搜索中…</text></view>
        <view v-else-if="error" class="spu-status error">
          <text>{{ error }}</text>
          <view v-if="searched" class="spu-retry" @tap="$emit('search')">重试</view>
        </view>
        <view v-else-if="!searched" class="spu-status">
          <text>从千岛官方 SPU 资料库找谷子</text>
          <text>导入后即可拖到痛包排版</text>
        </view>
        <view v-else-if="!items.length" class="spu-status"><text>没有找到相关谷子，换个关键词试试</text></view>
        <view v-else class="spu-grid">
          <view v-for="it in items" :key="it.id" class="spu-card">
            <view class="spu-card-imgbox">
              <image
                v-if="bestSpuImage(it)"
                :src="bestSpuImage(it)"
                class="spu-card-img"
                mode="aspectFit"
                :draggable="false"
                @contextmenu.stop.prevent
                @dragstart.stop.prevent
              />
              <view v-else class="spu-card-noimg"><text>无图</text></view>
              <text v-if="it.transparentImage" class="spu-card-badge">透明图</text>
            </view>
            <text class="spu-card-title">{{ it.title }}</text>
            <text class="spu-card-type">{{ [it.typeName, it.priceText].filter(Boolean).join(' · ') || ' ' }}</text>
            <view
              class="spu-card-import"
              :class="{ owned: ownedIds.includes(it.id), busy: importingId === it.id }"
              @tap="$emit('import-item', it)"
            >{{ importingId === it.id ? '导入中…' : ownedIds.includes(it.id) ? '已在谷子池' : '导入' }}</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { bestSpuImage } from '../../../services/qiandao/types'
import type { QiandaoSpuSummary } from '../../../services/qiandao/types'
import type { QiandaoSpuServiceMode } from '../../../services/qiandao/client'

defineProps<{
  open: boolean
  serviceMode: QiandaoSpuServiceMode
  loading: boolean
  error: string
  searched: boolean
  items: QiandaoSpuSummary[]
  importingId: string
  ownedIds: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'search', keyword: string): void
  (e: 'import-item', item: QiandaoSpuSummary): void
}>()

// 关键：非响应式（普通 let，不是 ref）——@input 改它不触发任何重渲染，原生 input
// 的 IME 组合态因此不会被打断。面板 v-if 重挂载时随组件重建自动归零。
let keywordValue = ''
function onInput(e: any) {
  keywordValue = (e && e.detail && e.detail.value) || ''
}
function onSearch() {
  emit('search', keywordValue.trim())
}
</script>
