// Export-history data layer: the recent-exports list + its two-tier persistence
// (metadata in Taro storage, image blobs in a kv-store), lifted out of index.vue.
//
// Self-contained. The page keeps the open/close/preview orchestration because those
// bridge the shared export-preview overlay (resultSrc / resultPreviewOpen); this
// composable owns the list, the drawer-open flag, and load/persist/add + src lookup.
// Pure record helpers (formatExportHistoryTime / normalizeExportRecord) live in
// editor-export.ts. Covered indirectly by the export flow; the list math is simple.
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { STORAGE_KEY } from './editor-core'
import type { ExportHistoryRecord, StoredExportHistoryRecord } from './editor-core'
import { formatExportHistoryTime, normalizeExportRecord } from './editor-export'
import { createKvStore } from '../../services/storage/kv-store'

const EXPORT_HISTORY_KEY = `${STORAGE_KEY}-export-history`
const EXPORT_HISTORY_LIMIT = 8
const EXPORT_HISTORY_DB_NAME = 'gooda-export-history'
const EXPORT_HISTORY_STORE = 'exports'

export function useExportHistory() {
  const exportHistory = ref<ExportHistoryRecord[]>([])
  const exportHistoryOpen = ref(false)
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
        const src = r?.src || await exportHistoryStore.get(r?.id || '')
        return normalizeExportRecord(r, i, src)
      }))
      exportHistory.value = hydrated
        .filter((r): r is ExportHistoryRecord => !!r)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, EXPORT_HISTORY_LIMIT)
    } catch (_) {}
  }

  // name 由调用方给出（当前用「<痛包名>导出图」），避免此处耦合 bag / curBag。
  async function addExportHistory(src: string, name: string) {
    const createdAt = Date.now()
    const record: ExportHistoryRecord = {
      id: `${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
      src,
      createdAt,
      name,
      timeText: formatExportHistoryTime(createdAt),
    }
    exportHistory.value = [record, ...exportHistory.value].slice(0, EXPORT_HISTORY_LIMIT)
    await persistExportHistory()
  }

  // 取历史图源：记录自带 src 就用它，否则回 kv-store 拿（可能已失效 → undefined）。
  async function resolveHistorySrc(record: ExportHistoryRecord) {
    return record.src || await exportHistoryStore.get(record.id)
  }

  return { exportHistory, exportHistoryOpen, loadExportHistory, persistExportHistory, addExportHistory, resolveHistorySrc }
}
