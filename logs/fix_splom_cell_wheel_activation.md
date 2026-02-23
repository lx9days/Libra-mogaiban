# 修复 SPLOM 4×4 单元格中部分视图滚轮无效问题
**Date:** 2026-02-12  
**Author:** Trae AI Pair Programmer

## 问题描述
- 在 4×4 SPLOM 示例中，鼠标滚轮缩放仅在部分 cell 上生效，其他 cell 进入图层空白区域时滚轮不触发，进入 marks 区域更容易触发。
- 页面元素显示 `pointer-events: auto`，但命中行为仍不稳定。

## 根因分析
- 命中门禁偏差（viewport）：早前逻辑用 `event.offsetX/offsetY` 与 `layer._offset/_width/_height` 比较，在存在 `transform/viewBox/preserveAspectRatio` 时坐标空间不一致，进入图层空白区被误判为“不在视口内”。
- 状态机限制：`MouseWheelInteractor` 的 `wheel` 仅在 `running` 状态触发；`mouseenter` 更多基于容器/命中结果，导致处于 `start` 状态时直接滚轮无法触发，表现为“只有部分视图响应”。

## 修复方案
### 1. Viewport 命中逻辑改为 BCR 边界判断
- 使用图层 `graphic` 的 `getBoundingClientRect()` 与 `MouseEvent.clientX/clientY` 判断是否在图层边界内，稳健覆盖 `transform/viewBox` 情形。
- 代码位置： [instrument.ts:L749-L769](file:///c:/workspace/libra多交互协作板/Libra-mogaiban/src/instrument/instrument.ts#L749-L769)

### 2. 允许 wheel 从 start 直接触发并进入 running
- 将 `wheel` 的状态转移扩展为 `start → running` 与 `running → running`，首次滚轮即可生效，无需依赖 `mouseenter` 预先置为 `running`。
- 代码位置： [builtin.ts:L186-L197](file:///c:/workspace/libra多交互协作板/Libra-mogaiban/src/interactor/builtin.ts#L186-L197)

### 3. 图层偏移计算一致化（相关增强）
- 在 `PlotLayer/VegaLayer` 的 `_offset` 计算中合并容器与 `graphic` 的 `transform`，避免仅移动子节点时 `_offset` 未更新。
- 代码位置： [plotLayer.ts:L70-L95](file:///c:/workspace/libra多交互协作板/Libra-mogaiban/src/layer/plotLayer.ts#L70-L95)、[vegaLayer.ts:L71-L96](file:///c:/workspace/libra多交互协作板/Libra-mogaiban/src/layer/vegaLayer.ts#L71-L96)

## 结果
- 在任意 cell 的空白区域或 marks 区域，滚轮均可正确触发缩放（viewport 模式）。
- 跨 cell 切换时不再依赖 `mouseenter` 先行置 `running`；首次滚轮即可进入交互。
- 竞争与传播策略保持不变：若存在更高优先级且 `stopPropagation=true` 的 instrument，后续会被屏蔽。

## 验证
- 构建通过：类型检查与打包成功，生成 `dist/libra.js` 与 `dist/libra.min.js`。
- 行为验证：在 4×4 SPLOM 的每个 cell 上直接滚轮均生效；进入空白区域命中稳定。

## 兼容性与注意事项
- `visiblePainted` 模式仍需在可绘制元素上命中，行为未改变；可根据需求选择 `pointerEvents` 策略。
- 保持图层容器 `pointer-events: auto`；若 `display:none` 或不可见，`getBoundingClientRect` 为零矩形，命中将失败。

