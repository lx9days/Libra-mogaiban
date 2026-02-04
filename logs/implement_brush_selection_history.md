# Implement Brush Selection History and RemnantKey Mechanism

**Date:** 2026-01-29
**Author:** Trae AI

## Overview
Implemented a mechanism to retain multiple selection boxes in `BrushInstrument` using a `remnantKey` (e.g., Shift key). This allows users to make multiple disjoint selections on the same layer.

## Key Changes

### 1. BrushInstrument (`src/instrument/builtin.ts`)
*   **History Management Logic**:
    *   **DragStart**: Checks if a merge should occur.
        *   If `remnantKey` is defined AND pressed: History is retained (Merge mode).
        *   If `remnantKey` is undefined (Default) OR not pressed: History is cleared (New selection/Reset).
    *   **DragEnd**:
        *   If `remnantKey` is defined but not pressed: Current selection is discarded (Transient/Cancel behavior).
        *   Otherwise (Default or Merge mode): Current selection is calculated and pushed to `selectionHistory`.
*   **Coordinate Calculation Fixes**:
    *   **Stability**: Switched from using `event.offsetX` directly (which varies based on the event target) to a delta-based approach: `currentOffset = startOffset + (currentClientX - startClientX)`.
    *   **Layer Offset**: Adjusted the stored history coordinates by subtracting `layer._offset` (`offsetx - layerOffsetX`) to ensure the history selection aligns correctly with the layer's coordinate system.

### 2. SelectionService (`src/service/selectionService.ts`)
*   **Multi-Select Logic**: Updated `_evaluate` to merge new selection results with existing ones when `remnantKey` is active (Union operation), instead of overwriting.
*   **Visualization Sync**: Passed `selectionHistory` from `SharedVar` to `TransientRectangleTransformer` to ensure visual persistence of past selections.

### 3. TransientRectangleTransformer (`src/transformer/builtin.ts`)
*   **Rendering**: Modified `redraw` method to:
    1.  Render the active (dragging) selection rectangle.
    2.  Iterate through `selectionHistory` and render all historical rectangles using the same style.
    *   Fixed rendering logic to prioritize `offsetx`/`offsety` over `x`/`y` for history items to match the layer's local coordinate system.

## Bug Fixes
*   Fixed `TS2588: Cannot assign to 'event'` error in `builtin.ts` by creating a mutable `inputEvent` variable.
*   Resolved the "offset drift" issue where historical selections appeared shifted to the bottom-right due to missing layer offset subtraction.
*   **Default Behavior Fix**: Resolved an issue where undefined `remnantKey` caused infinite history accumulation. Now defaults to standard single-selection behavior (auto-clears history on new drag).
