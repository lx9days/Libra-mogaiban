# Implement Linked Selection Predicate Hub (链接选择谓词中转站)

**Date**: 2026-02-22  
**Author**: Trae AI Pair Programmer

## 背景与问题

原有“链接选择”主要通过在目标图层创建/清空 `linkSelectionLayer` 并绘制克隆高亮来实现。这种方式存在两个结构性问题：

1. **覆盖冲突**：多个选择源同时联动时，目标图层需要频繁 `clear linkSelectionLayer`，天然导致“最后一次更新覆盖其他来源”的冲突。
2. **职责混杂**：联动既要维护选择状态（谓词/结果），又要处理渲染落点（在哪个 layer 画），导致扩展/调试成本高。

为解决“多个来源并存 + 统一渲染落点”的需求，引入“全局选择谓词中转站 + 统一 selectionLayer 渲染”的新机制。

## 方案概览

核心思想：把“链接选择”分成两段链路：

- **选择源（Source）**：链接型选择在发生时，只负责把自己的“选择谓词”写入全局中转站。
- **渲染端（Hub/Renderer）**：所有参与联动的图层订阅中转站变化，使用“合并后的最终谓词”计算命中元素，并统一渲染到各自的 `selectionLayer`。

这样可以做到：

- 多个来源不会互相清空对方的渲染层（因为渲染由每个目标层自己完成，来源只写谓词）。
- 选择的语义（谓词）与渲染策略（selectionLayer + SelectionTransformer）解耦。

## 选择谓词格式

当前谓词采用 `extents` 形式（字段名 → 数值区间）：

```js
{
  sepal_length: [4.8, 6.1],
  sepal_width:  [2.2, 3.5]
}
```

约束：

- value 必须是 `[number, number]`，且 `min < max`。
- 命中判定为 AND：同一个 datum 必须同时满足谓词中的所有字段区间。

## 全局中转站（Predicate Hub）

### 实现位置
- `src/helpers.ts`

### 数据结构

- `global.linkSelectionPredicates: Map<string, Record<string, unknown>>`
  - key 为 `sourceId`
  - value 为该来源的 `extents` 谓词对象

- `global.linkSelectionSubscribers: Set<() => void>`
  - 用于谓词变更通知（轻量订阅机制）

### API

- `setLinkSelectionPredicate(sourceId, predicate)`
  - 写入/更新某个来源的谓词；当谓词无有效区间时会删除该来源条目。
  - 写入后同步通知所有订阅者。

- `subscribeLinkSelectionPredicates(cb) -> unsubscribe()`
  - 注册回调，返回取消订阅函数。

- `getMergedLinkSelectionPredicate() -> { extents, empty }`
  - 将所有来源的谓词合并为一个最终谓词：
    - 同字段区间：取交集。
    - 不同字段：AND。
  - 若交集为空则 `empty = true`。

## 上游：链接型 SelectionService 如何写入谓词

### 触发点
- `SelectionService.filter(...)` 在更新 `_selectionMapping`（也就是 extents）之后，会判断是否为链接型：
  - `sharedVar.linkSelection === true` 或 `sharedVar.linkLayers` 存在

### 关键修复：passive 更新也要写入

brush 场景下，从屏幕坐标转换到数据域区间常通过 `filter(..., { passive: true })` 触发。

如果只在非 passive 写入谓词，会导致：

- 中转站始终为空
- Hub 端永远拿不到可用谓词
- 其他图层看不到联动高亮

因此当前实现为：只要是链接型 service，**无论 passive 与否**，都会调用 `setLinkSelectionPredicate(...)` 写入中转站。

### sourceId 的选择

为避免多个来源互相覆盖，需要 `sourceId` 在可并存的来源之间保持唯一。

目前在 brush 相关 instrument 中，使用“当前 layer 名称”作为 `linkSelectionSource`，保证在 SPLOM 这类多图层场景下每个 cell 的来源唯一。

## 下游：LinkSelectionHubTransformer 的生命周期职能

### 实现位置
- `src/transformer/builtin.ts`：`LinkSelectionHubTransformer`

### 职能

`LinkSelectionHubTransformer` 是链接选择的“渲染端/汇聚端”，它：

1. **订阅中转站变化**：第一次 `redraw()` 时注册订阅；任何来源谓词更新都会触发它重新 `redraw()`。
2. **读取最终谓词**：调用 `getMergedLinkSelectionPredicate()` 获取合并后的谓词。
3. **计算命中元素**：
   - 遍历当前 layer 的 visual elements。
   - 对每个元素取 `layer.getDatum(el)`。
   - 对 datum 按最终谓词进行区间判定（AND）。
4. **统一渲染到 selectionLayer**：
   - 清空本 layer 的 `selectionLayer`。
   - 将命中元素 clone 为可渲染节点数组 `resultNodes`。
   - 把 `resultNodes` 交给一个内部持有的 `SelectionTransformer`（通过 `setSharedVars` 触发其 redraw），并设置描边高亮（例如 `fill: none` + `stroke`）。

### 组件间通信方式

Hub 与其下游 `SelectionTransformer` 的通信不是事件总线，而是：

- Hub 持有 `SelectionTransformer` 的对象引用
- 通过 `selectionTransformer.setSharedVars(...)` 直接写 sharedVar，触发下游 redraw

## 如何挂载到系统里（上游是谁）

当前由 brush 系列 instrument 在 `preAttach` 时决定是否挂载 Hub：

- 当 instrument 的 sharedVar 配置包含 `linkLayers` 时：
  - 在“当前 layer + linkLayers”上分别初始化一个 `LinkSelectionHubTransformer`，确保所有参与联动的图层都能订阅并渲染最终谓词。
  - 并给对应的 `RectSelectionService` 注入链接型标记（`linkSelection`/`linkSelectionSource`）。

## Demo：SPLOM 全联动

在 `Libra-mogaiban-demo/src/pages/SPLOM/SPLOM.js` 中，Group Selection 的 `LinkLayers` 被调整为包含所有 `cellLayers`，从而实现“任意 cell 的 brush 都影响全体 cell”的联动效果。

## 已知限制与后续方向

1. **谓词表达能力有限**：当前仅支持“数值区间 extents”。如需支持离散集合/字符串/多态谓词，建议将谓词升级为 AST 或统一 matcher 接口。
2. **职责边界仍可优化**：Hub 目前作为 Transformer 同时承担“命中计算（偏 Service）+ 渲染调度（偏 Transformer）”。后续可拆分为：
   - `LinkSelectionHubService`：订阅与命中计算
   - `SelectionTransformer`：只负责绘制
3. **性能**：每次谓词更新会对每个参与图层遍历 visual elements 并取 datum，SPLOM 大规模数据需关注优化（缓存 datum、索引、增量更新等）。

## 相关文件

- `c:\workspace\libra多交互协作板\Libra-mogaiban\src\helpers.ts`
- `c:\workspace\libra多交互协作板\Libra-mogaiban\src\service\selectionService.ts`
- `c:\workspace\libra多交互协作板\Libra-mogaiban\src\transformer\builtin.ts`
- `c:\workspace\libra多交互协作板\Libra-mogaiban\src\instrument\builtin.ts`
- `c:\workspace\libra多交互协作板\Libra-mogaiban-demo\src\pages\SPLOM\SPLOM.js`

