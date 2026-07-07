// Undo/redo history stack machinery, lifted out of index.vue.
//
// The composable owns the reusable, self-contained part: the two snapshot stacks,
// the suppress flag, and push/undo/redo/commit. The *content* of a snapshot
// (which editor state to capture / restore) stays in index.vue and is injected as
// callbacks — that part is inherently page-state-bound.
//
// Behavior is identical to the previous inline version. Covered by
// scripts/verify-state.cjs (undo/redo round-trip + redo-stack clear).
import { ref, computed } from 'vue'
import type { Snapshot } from './editor-core'

const HISTORY_LIMIT = 50

export type HistoryDeps = {
  // Capture the current editor state as a snapshot.
  snapshot: () => Snapshot
  // Restore the editor to a snapshot. Runs inside runSuppressed so it never
  // re-enters pushHistory.
  applySnapshot: (s: Snapshot) => void
  // Persist current work (called after every committed mutation).
  save: () => void
}

export function useHistory(deps: HistoryDeps) {
  const history = ref<Snapshot[]>([])
  const redoStack = ref<Snapshot[]>([])
  let suppressed = false

  const canUndo = computed(() => history.value.length > 1)
  const canRedo = computed(() => redoStack.value.length > 0)

  // Run a restore without recording it as a new history entry.
  function runSuppressed(fn: () => void) {
    suppressed = true
    try {
      fn()
    } finally {
      suppressed = false
    }
  }

  function pushHistory() {
    if (suppressed) return
    history.value.push(deps.snapshot())
    if (history.value.length > HISTORY_LIMIT) history.value.shift()
    redoStack.value = []
  }

  function commit() {
    pushHistory()
    deps.save()
  }

  function undo() {
    if (!canUndo.value) return
    const cur = history.value.pop()
    if (cur) redoStack.value.push(cur)
    const prev = history.value[history.value.length - 1]
    if (prev) deps.applySnapshot(prev)
  }

  function redo() {
    const next = redoStack.value.pop()
    if (!next) return
    deps.applySnapshot(next)
    history.value.push(deps.snapshot())
  }

  return { history, redoStack, canUndo, canRedo, runSuppressed, pushHistory, commit, undo, redo }
}
