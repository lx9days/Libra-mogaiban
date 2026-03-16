# Group Selection：空点击后选框消失但高亮残留

## 现象
- 在 group selection（brush）完成一次有效框选后，画面出现高亮/Dim 反馈与“历史选框”矩形。
- 随后在画布上“空点一下”（mousedown + mouseup），不拖拽出新框：
  - 原来的选框矩形会消失
  - 但上一次选择的高亮/Dim 效果仍然保留（selectionLayer 里克隆出来的高亮节点没有被清掉）

## 复现环境
- Demo：`CompilerDemo/src/pages/group-selection/group-selection.js`
  - DSL：`Trigger: brush`
  - `feedbackOptions`：
    - `Highlight: "#00ff1aff"`
    - `Dim: { opacity: 0.1, selector: ".mark" }`
    - `RemnantKey: "shift"`

## 关键链路（为什么会出现“框没了但高亮还在”）
### 1) 选框消失：因为空点也会触发 dragstart，且 dragstart 会清空 selectionHistory
- Brush 的历史选框矩形来自 `selectionHistory`，由 `TransientRectangleTransformer` 绘制。
- `BrushInstrument.dragstart` 中：只要没按 `remnantKey`（shift），就会清空 `selectionHistory`。
- MouseTraceInteractor 的定义里：`mousedown` 会触发 `dragstart`，所以“空点一下”也会进到 dragstart。

结论：空点触发 dragstart → selectionHistory 被清空 → 历史选框矩形消失。

相关代码：
- `Libra/src/interactor/builtin.ts`：MouseTraceInteractor（mousedown -> dragstart）
- `Libra/src/instrument/builtin.ts`：BrushInstrument.dragstart 清空 selectionHistory
- `Libra/src/transformer/builtin.ts`：TransientRectangleTransformer 绘制 selectionHistory

### 2) 高亮残留：因为空点没有触发一次“把 result 变空并重绘 selectionLayer”的计算
- 高亮/Dim 的渲染来自 SelectionService/RectSelectionService：
  - `_evaluate()` 会清空 selectionLayer，再按最新 `_result` 把高亮节点 append 回去。
- 空点不触发 `drag`（mousemove），因此不会走 `BrushInstrument.drag` 中那条持续更新 sharedVar（含 event/remnantKey）的路径。
- `dragstart` 虽然调用了 `SelectionService.filter(...)`，但在当前配置下（没有做 data dimension 的 `attrName` 过滤）这条 `filter` 分支基本不会触发一次“有效的重新 evaluate”，导致 selectionLayer 没按“空结果”被清掉。

结论：框选后的高亮停留在上一次 `_result`；空点只清了历史选框（selectionHistory），没有触发 selectionLayer 的清空/重绘。

相关代码：
- `Libra/src/service/selectionService.ts`：`_evaluate()` 清空 selectionLayer、应用 dim、重绘 selectionLayer
- `Libra/src/instrument/builtin.ts`：BrushInstrument.drag 才会在移动时更新 SelectionService sharedVars

## 下次 Debug 的切入点（待解决方向）
- 目标行为：空点击（无拖拽、无有效新框）时，应该清除 selectionLayer 高亮与 dim（或保持原选择与原选框，二选一保持一致）。
- 可能修复点（先选一个统一语义）：
  1) 在 BrushInstrument 的 `dragend` 判断“是否发生有效拖拽”（width/height 过小）：
     - 若无有效拖拽：显式把 SelectionService 的共享变量设为 width/height=0 并触发一次 evaluate，使 `_result` 为空，从而清空 selectionLayer 和 dim。
  2) 或者在 `dragstart`（非 merging）时同步清掉 selectionLayer（调用 RectSelectionService/SelectionService 的清空逻辑），让“清框”与“清高亮”一致。
  3) 另外注意：目前 `dragstart` 里对 `SelectionService.filter(...)` 的调用在无 `attrName` 时可能不生效，导致“看起来调用了 filter，但没有清高亮”。

## 最小观察点（调试时打印/断点）
- `BrushInstrument.dragstart/drag/dragend`：是否进入、width/height 计算是否为 0
- `SelectionService._evaluate()`：是否被调用、调用时 `_result` 是否为空、selectionLayer 是否被清空
- selectionLayer DOM：空点后是否仍保留上次高亮节点

