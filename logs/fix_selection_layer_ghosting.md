# Selection Layer Ghosting Fix Log
Date: 2026-01-28
Author: Trae AI Pair Programmer

## Issue Description
**Problem:**  
In the Excentric Labeling visualization, when the `LabelLayer` was updated (e.g., labels moved or disappeared), the `selectionLayer` was manually cleared in the DOM, but old highlighted label images (ghosts) would reappear shortly after.

**Root Cause:**  
The `SelectionService` maintains an internal state `_result` which stores the list of selected DOM elements. Even though the `selectionLayer`'s DOM nodes were removed in the `onUpdate` callback, the `SelectionService`'s asynchronous update cycle (`_evaluate`) would run again. Since `_result` still contained references to the old (now removed or changed) elements, the `SelectionTransformer` would re-clone these stale elements and append them back to the `selectionLayer`, causing the "ghosting" effect.

## Fix Implementation
**File:** `src/instrument/builtin.ts`  
**Location:** `HoverInstrument` registration -> `preAttach` -> `layer.onUpdate` callback

**Changes:**
Modified the `layer.onUpdate` callback to explicitly reset the `SelectionService`'s state instead of just manipulating the DOM.

```typescript
// Before (Manual DOM manipulation only):
// while (selectionLayer.firstChild) {
//   selectionLayer.removeChild(selectionLayer.firstChild);
// }

// After (State reset):
if (services) {
  // 1. Force clear the internal result cache to remove references to old elements
  (services as any)._result = [];
  
  // 2. Force re-evaluation. Since _result is empty, this will effectively 
  //    clear the selectionLayer and ensure no new clones are added until 
  //    the next valid interaction.
  (services as any)._evaluate(layer);
}
```

## Result
When the `LabelLayer` updates, the `SelectionService` is now immediately synchronized to an empty state. This prevents the `SelectionTransformer` from rendering stale data, effectively eliminating the ghosting artifact.
