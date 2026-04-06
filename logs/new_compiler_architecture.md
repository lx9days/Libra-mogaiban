# Libra 新版交互编译器架构与已对接项目

## 1. 架构概览 (Architecture Overview)
新版编译器采用了更加清晰的分层结构设计，通过 `Instrument` / `Trigger` / `Target` / `Feedback` 的配置范式，将用户的 DSL（领域特定语言）映射到 Libra 运行时的实际渲染与交互逻辑。主要工作流如下：

1. **规范化 (Normalization)**
   - **核心文件**: `normalize.js`
   - **职责**: 将用户 DSL 中复杂、嵌套的反馈配置（Feedback）进行展平与标准化，确保后续编译及运行时引擎能够以统一的结构进行读取和处理。

2. **校验与分发 (Validation & Dispatch)**
   - **核心文件**: `instrumentRules.js`
   - **职责**: 读取 DSL 的交互声明，根据交互类型将其路由映射到具体的编译器实现（例如 `selectionCompiler`、`lensCompiler` 等）。

3. **编译阶段 (Compilation)**
   - **职责**: 具体的 Compiler 根据规范化后的 DSL 生成底层的执行计划（Build Plans）。
   - 将高级交互意图拆解为底层的 `Service`（纯计算和逻辑节点）与 `Transformer`（状态订阅与视图重绘回调，如 `redrawFunc`）。

4. **运行时执行 (Runtime Execution)**
   - **职责**: 
     - `runBuildPlans` 负责挂载和激活对应的交互链路。
     - `LibraManager.js` 处理运行时的 Instrument 创建，以及进行修饰键（Modifier Key，如 Shift、Ctrl）的合法性检查（`__checkModifier()`）。
     - **图层管理 (`Libra.Layer`)**: 运行时的可视化组件被分配至不同的图层（例如 `mainLayer`, `LabelLayer`, `LensLayer`）。数据层通过调用 `postUpdate()` 触发依赖同步；辅助层需严格配置 `pointer-events: 'none'`，避免遮挡和拦截下层核心数据层的鼠标事件。

## 2. 核心模块与代码映射 (Key Code References)
通过以下关键文件可快速定位编译器的核心实现：
- **配置规范化**: [normalize.js](file:///d:/workspace/libra-实验室版/CompilerDemo/src/scripts/dsl-compiler/normalize.js)
- **编译路由规则**: [instrumentRules.js](file:///d:/workspace/libra-实验室版/CompilerDemo/src/scripts/dsl-compiler/rules/instrumentRules.js)
- **透镜交互编译**: [lensCompiler.js](file:///d:/workspace/libra-实验室版/CompilerDemo/src/scripts/dsl-compiler/compilers/lensCompiler.js)
- **运行时交互管理**: [LibraManager.js](file:///d:/workspace/libra-实验室版/CompilerDemo/src/core/LibraManager.js)

## 3. 已对接 / 已验证案例名单 (Integrated Examples)
以下交互案例已成功迁移或在新版编译器架构下完成验证与调试，确保了多层级渲染（Layer）、事件流转（Event Flow）以及组件混合的正常运行：

1. **Pan & Zoom** (`pan&zoom/pan&zoom.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了缩放、平移及与 Excentric Label (Lens) 的混合使用；修复了 `labelAccessor` 字段读取映射与 Lens 层事件拦截的问题。
   
2. **Group Selection Lens** (`group-selection-lens/group-selection-lens.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了框选（Brush）与 Lens 悬浮统计交互的组合与叠加；处理了多层状态的同步（`mainLayer.postUpdate()`）及鼠标事件穿透。

3. **Group Selection** (`group-selection/group-selection.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了基础框选操作（Brush）及多元素选取的高亮反馈逻辑。

4. **Edge Lens / Link Selection** (`edge-lens/edge-lens.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了基于 `LinkSelectionHubTransformer` 和全局 `Selection Hub` 的连边拓扑选择逻辑（节点悬浮联动连边高亮）；验证了使用 `customFeedbackFlow` 注入自定义底层服务（如 `EdgeLensLayoutService`）以实现边排斥（Edge Lens）效果。

5. **Point Selection** (`point-selection/point-selection.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了基础点选交互（Hover / Click）的触发条件、事件流阻断机制（stopPropagation）与反馈渲染。

6. **Teaser Matrix** (`teaser-Matrix/teaser-Matrix.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了基于新版 DSL 的矩阵行列拖拽重排（Reorder）交互基础用例；展示了 `redrawFunc: "default"` 的内置矩阵自动重绘逻辑。

7. **Gesture Matrix** (`gesture-matrix/gesture-matrix.js`)
   - **状态**: 已验证
   - **关键特性**: 在 `Teaser Matrix` 基础上，进一步支持了在 `trigger` 内部定义 `syntheticEvent`，以细分拖拽方向并实现不同手势对应的重排逻辑。

8. **Simple Parallel Coordinate** (`SimpleParallelCoordinate/SimpleParallelCoordinate.js`)
   - **状态**: 已验证
   - **关键特性**: 验证了平行坐标轴场景下的多维交互组合（包含 Axis Selection 与 Reorder）；移除了冗余的全局平移/缩放逻辑；使用自定义 `redrawFunc` 渲染拖拽更新；验证并修复了 `reorderCompiler` 对图层数组（Layer Array）作为 `copyFrom` 目标的支持。

9. **Parallel Coordinate** (`ParallelCoordinate/ParallelCoordinate.js`)
   - **状态**: 已验证
   - **关键特性**: 在多层平行坐标轴基础上，验证了复合交互能力：包含数据连线点选（Point Selection）、坐标轴刷选过滤数据（Axis Selection，联动 `LinkRectSelectionService` 执行数据级谓词匹配而非相交计算）以及坐标轴拖拽重排（Reorder）；确认了 `layersByName` 中辅助层与核心层（如 `mainLayer`）的正确别名映射。

10. **Teaser Simple SPLOM** (`teaser-SimpleSPLOM/teaser-SimpleSPLOM.js`)
    - **状态**: 已验证
    - **关键特性**: 验证了散点图矩阵（SPLOM）场景下的坐标轴拖拽重排（Reorder）以及对角线外单元格的跨图层联动刷选（Group Selection）；展示了如何将连线不透明度配置与跨单元格通信所用的比例尺规范化封装进 `feedback.context.link` 中。

11. **SPLOM** (`SPLOM/SPLOM.js`)
    - **状态**: 已验证
    - **关键特性**: 验证了平移（Pan）与缩放（Zoom）在新版 DSL 规范下通过 `feedback.context` 提供 `scaleX`/`scaleY` 参数的机制，并在 `navigationCompiler.js` 及 `builderRegistry.js` 层面补充了相应解析和注册逻辑；成功将旧版 `reordering` 和 `group selection` 迁移至新版嵌套结构（如 `feedback.service` 和 `feedback.feedforward`）。

---
*注：未来新增交互或进行功能对接时，需确保相应的 Compiler 已注册于 `instrumentRules.js`，并在多图层场景下注意 `pointer-events` 的分配与 `postUpdate()` 生命周期同步。*