# Brush Zoom Interaction Registration Fix in New DSL Architecture

## Issue
In the new DSL architecture, the `brush-zoom` interaction was not functioning properly. While `brush-zoom1` (the old DSL version) worked correctly, the new DSL version failed to establish the cross-instrument communication required for zooming the brush selection.

## Root Cause
1. **Missing Registration in Registry**: The `builderRegistry.js` was creating instances for Selection-family tools (like `group-selection`, `point-selection`, `lasso`, `axis-selection`) and `brush-zoom`, but it was failing to write these instantiated objects back into the `runtimeContext.registry`. Without this registration, dependent interactions like `brush-zoom` could not reverse-lookup their target brush instrument.
2. **Missing Returns in Builder Methods**: Inside `LibraManager.js`, the builder methods (such as `buildGroupSelectionInstrument`, `buildPointSelectionInstrument`, `buildBrushZoomInstrument`, etc.) were merely executing `Libra.Interaction.build(buildOptions)` without actually `return`ing the resulting instrument instance. Consequently, even if `builderRegistry.js` tried to register the instance, it was receiving `undefined`.

## Changes Made
1. **`LibraManager.js`**:
   - Added `return` statements to all relevant builder methods (`buildGroupSelectionInstrument`, `buildPointSelectionInstrument`, `buildLassoSelectionInstrument`, `buildAxisSelectionInstrument`, `buildBrushZoomInstrument`, etc.) so that `Libra.Interaction.build(buildOptions)` returns the instrument instances (which are typically arrays).
   - Updated `LibraManager.__resolveBrushContext` to safely unwrap the array if the returned `brushInstrument` is an array of instruments (e.g., `if (Array.isArray(brushInstrument) && brushInstrument.length > 0) brushInstrument = brushInstrument[0];`).

2. **`builderRegistry.js`**:
   - Introduced a `registerSelectionRuntimeEntry` function.
   - Updated the runtime builders for Selection tools (`group-selection`, `point-selection`, `lasso`, `axis-selection`) to capture the `instance` returned by `LibraManager` and pass it to `registerSelectionRuntimeEntry`.
   - Now, the newly created Selection instances are correctly persisted in `runtimeContext.registry`.

## Result
With these modifications, when `GroupSelection` is compiled, its runtime instance is successfully stored in the registry. When `Zoom` (configured to update the brush) is subsequently compiled, it successfully resolves the target `GroupSelection` from the registry via `resolveTargetBrush`, retrieves the underlying `RectSelectionService`, and correctly applies the scaling logic on wheel events.

The `brush-zoom` demo has now been added to the gallery.
