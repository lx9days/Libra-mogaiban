# Implement Feedforward Mechanism & HUD

**Date**: 2026-02-05
**Author**: Trae AI Pair Programmer

## Background
Users needed a way to understand which instruments are currently active or available for interaction at the current mouse position. The goal was to provide a real-time "feedforward" mechanism that displays this information, including required modifier keys and descriptions.

## Summary of Changes

### 1. Core Feedforward Logic (`src/instrument/instrument.ts`)
- **Global Instrument Scanning**: Modified `_dispatch` to iterate through all globally registered instrument instances (`instanceInstruments`) instead of just those attached to the current layer's event map. This ensures we catch instruments that might be relevant even if they aren't currently triggering an event.
- **Active vs. Candidate Detection**:
  - **Active**: Instruments with an Interactor in a non-`start` state (i.e., currently dragging or interacting).
  - **Candidate**: Instruments that *could* interact at the current position based on hit testing and `pointerEvents` settings.
- **Hit Testing Improvements**:
  - Aligned `pointerEvents` default behavior: If undefined, defaults to `viewport` (consistent with `_dispatch` logic), allowing instruments like `BrushInstrument` to be detected in empty areas of a layer.
  - Correctly handled `visiblePainted` vs `viewport` modes during the candidate check.

### 2. HUD Implementation (`src/instrument/instrument.ts`)
- **Visual Feedback**: Replaced initial console logs with a DOM-based HUD (`#libra-feedforward-hud`).
- **Positioning**:
  - Implemented logic to mount the HUD as a **sibling** to the layer's container.
  - Positions the HUD at the top-right of the container (`position: absolute; top: 10px; right: 10px;`).
  - Falls back to `fixed` positioning on `document.body` if the container structure is unexpected.
- **Styling**:
  - Dark background with semi-transparent opacity.
  - Color-coded text:
    - **Active**: Green header.
    - **Candidates**: Blue header.
    - **Descriptions**: Peach/Orange (`#ffab91`).
    - **Modifier Keys**: Purple (`#ce93d8`).
  - Layout: Each instrument occupies its own line for better readability.

### 3. API Extensions (`src/interaction/index.ts`)
- **Description Support**: Extended `Libra.Interaction.build` to accept a top-level `description` parameter.
- **Injection**: This description is automatically injected into the instrument's `sharedVar`, making it accessible to the HUD without manual `sharedVar` configuration.

### 4. Sorting & Stability
- **Priority Sorting**: Instruments in the HUD are sorted by their `_priority` (descending).
- **Stability**: Added a secondary sort key (Alphabetical by Name) to ensure the order remains stable when multiple instruments have the same priority.

## Files Modified
- `d:\workspace\libra-实验室版\Libra\src\instrument\instrument.ts`: Core dispatch logic, HUD rendering, sorting logic.
- `d:\workspace\libra-实验室版\Libra\src\interaction\index.ts`: `buildAPI` type definition and implementation update.

## Outcome
The system now provides immediate, non-intrusive visual feedback to the user, clarifying interaction possibilities and current system state. The HUD is context-aware (attached to the relevant visualization) and supports rich metadata (descriptions, modifiers).
