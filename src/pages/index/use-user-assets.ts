// User-imported / SPU-imported material assets: the in-memory collection plus its
// two-tier persistence (metadata in Taro storage, large src blobs in a kv-store),
// lifted out of index.vue.
//
// Fully self-contained — no page-state callbacks. index.vue keeps the page-level
// orchestration (delete also touches doc.layers / selection; add/edit build the
// asset object), but the collection ref, persistence, and layer-src hydration all
// live here. Covered by scripts/verify-state.cjs (save→load hydration round-trip).
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { STORAGE_KEY } from './editor-core'
import type { Layer, UserAsset, StoredUserAsset } from './editor-core'
import { guessAssetShape, defaultAssetSize } from './asset-helpers'
import { createKvStore } from '../../services/storage/kv-store'

const USER_ASSETS_KEY = `${STORAGE_KEY}-user-assets`
const USER_ASSETS_DB_NAME = 'gooda-user-assets'
const USER_ASSETS_STORE = 'images'

export function useUserAssets() {
  const userAssets = ref<UserAsset[]>([])
  const userAssetsStore = createKvStore(USER_ASSETS_DB_NAME, USER_ASSETS_STORE)

  // Fill in a layer's `src` from its owning asset when it was dropped for storage
  // (assetId-backed layers persist without their data URL).
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

  // Drop one asset's stored image blob. The caller owns the rest of the delete
  // flow (doc.layers / selection / persist), so the exact sequence stays there.
  function removeAssetImage(id: string) {
    return userAssetsStore.del(id)
  }

  return { userAssets, hydrateLayerAssetSources, persistUserAssets, loadUserAssets, removeAssetImage }
}
