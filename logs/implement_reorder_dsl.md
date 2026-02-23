# Reorder（Reordering）DSL 规则说明

本日志记录项目内 `reordering`（reorder）交互在 DSL 中的配置方式、参数含义与常见用法。该 DSL 由 `compileInteractionsDSL` 编译并部署为 Libra 的 reorder instrument。

相关实现：
- `compileInteractionsDSL`：`Libra-mogaiban-demo/src/scripts/modules/interactionCompiler.js`
- `buildReorderInstrument`：`Libra-mogaiban-demo/src/core/LibraManager.js`

---

## 1. 基本规则结构

一条 reorder 规则是一个对象，通常包含：

- `Instrument`: 必须为 `"reordering"`（大小写不敏感，编译时会转成小写判断）
- `Trigger`: 必须为 `"Drag"`（会被校验是否允许）
- `"Target layer"`: 触发拖拽的目标 layer 名称
- `Direction`: `"x"` 或 `"y"`，表示在横向或纵向上重排
- `"Feedback options"`: 主要承载 `contextRef` 与可选 `redrawRef`

最小示例（需要提供 redraw 或 autoRedraw 才会在拖拽结束更新画面）：

```js
{
  Instrument: "reordering",
  Trigger: "Drag",
  "Target layer": "xAxisLayer",
  Direction: "x",
  "Feedback options": {
    contextRef: {
      names,
      scales: { x: scaleX, y: scaleY },
      copyFrom,
      offset: { x: 0, y: 0 }
    }
  }
}
```

---

## 2. contextRef 约定（reorder 的核心输入）

`contextRef` 是一个对象（或 refs 中的 key），用于把数据与尺度传给 reorder instrument：

- `names: string[]`
  - 维度/列名/行名的当前顺序（会被 reorder 直接修改并回写到 `scaleX.domain(names)` / `scaleY.domain(names)`）

- `scales: { x?: d3.ScaleBand, y?: d3.ScaleBand }`
  - 用于计算拖拽命中的 item 以及生成新的 domain

- `copyFrom: Layer | Layer[] | Record<string, Layer>`
  - 用于拖拽过程中“复制”被拖拽对象的视觉反馈（copy layer）
  - 常见用法：
    - Matrix：`copyFrom: cellLayer`
    - SPLOM：`copyFrom: Object.values(cellLayers)`
    - ParallelCoordinate：`copyFrom: Object.values(axisLayers)`

- `offset: { x: number, y: number }`
  - 用于拷贝反馈时的布局偏移（不同图表可能需要把坐标从屏幕/容器坐标修正到 layer 坐标）

---

## 3. redraw：两种模式

reorder 的重排结果（`reorderedNames`, `x`, `y`）需要在 **拖拽结束** 时落到图形上。项目中有两种方式：

### 3.1 显式回调（redrawRef）

在 `"Feedback options"` 中提供 `redrawRef`（函数），由 DSL 编译器传入 reorder instrument：

```js
{
  Instrument: "reordering",
  Trigger: "Drag",
  "Target layer": "headersLayer",
  Direction: "x",
  "Feedback options": {
    redrawRef: redrawParallel,
    contextRef: { names, scales: { x }, copyFrom: Object.values(axisLayers), offset: { x: MARGIN.left, y: 0 } }
  }
}
```

该函数签名约定为：

```js
function redraw(reorderedNames, newScaleX, newScaleY) {}
```

### 3.2 无回调默认重绘（autoRedraw）

当 `redrawRef/redraw` 都未提供时，如果 `contextRef.autoRedraw` 存在，则编译器会生成一个默认 redraw。

当前内置实现支持 Matrix 类 band-matrix 的重绘（约定 class 与字段名），最简写法是：

```js
contextRef: {
  names,
  scales: { x: scaleX, y: scaleY },
  copyFrom: cellLayer,
  offset: { x: 0, y: 0 },
  autoRedraw: true
}
```

`autoRedraw` 也可以写成字符串或对象：

```js
autoRedraw: "matrix"
// 或
autoRedraw: { type: "matrix" }
```

默认 matrix 重绘做的事情：
- 更新 `.cell`：`x/y/width/height`（按 `d.col`、`d.row` 映射到新 band scale）
- 更新 `.col-label`、`.row-label`：重新绑定 `data(newNames)`，更新位置并同步 `text(d=>d)`
- x 轴 label 的 rotate/常量位置会尽量从现有 DOM 的 `transform/y` 推断（如推断失败则使用 0）

注意：
- autoRedraw 是“就地更新属性”，不会重建 defs/clip/axis 等复杂结构；
- 适用于结构稳定、只需要更新 band 布局的场景（如 Matrix）。

---

## 4. layersByName 传参建议

`compileInteractionsDSL([...], { layersByName: { ... } })` 用来把 DSL 中 `"Target layer"` 名称解析到具体 layer 实例。

reorder 规则至少需要能解析 `"Target layer"` 对应 layer：

```js
await compileInteractionsDSL(interactions, {
  layersByName: { xAxisLayer, yAxisLayer }
});
```

当使用 `autoRedraw`，建议也把 autoRedraw 会用到的 layer 一并传入（虽然默认实现也会尝试用 `Libra.Layer.findLayer(name)` 回退查找）：

```js
await compileInteractionsDSL(interactions, {
  layersByName: { cellLayer, xAxisLayer, yAxisLayer }
});
```

---

## 5. 完整示例（Matrix）

```js
const interactions = [
  {
    Instrument: "reordering",
    Trigger: "Drag",
    "Target layer": "xAxisLayer",
    Direction: "x",
    "Feedback options": {
      contextRef: {
        names,
        scales: { x: scaleX, y: scaleY },
        copyFrom: cellLayer,
        offset: { x: 0, y: 0 },
        autoRedraw: true
      }
    }
  },
  {
    Instrument: "reordering",
    Trigger: "Drag",
    "Target layer": "yAxisLayer",
    Direction: "y",
    "Feedback options": {
      contextRef: {
        names,
        scales: { x: scaleX, y: scaleY },
        copyFrom: cellLayer,
        offset: { x: 0, y: 0 },
        autoRedraw: true
      }
    }
  }
];

await compileInteractionsDSL(interactions, {
  layersByName: { cellLayer, xAxisLayer, yAxisLayer }
});
```

---

## 6. 常见问题

### 6.1 不提供 redrawRef 也不提供 autoRedraw 会怎样？

reorder 的顺序与 scale domain 仍然会被更新，但拖拽结束不会触发可视化更新（因为没有 redraw 可调用）。

### 6.2 SPLOM/ParallelCoordinate 适合用 autoRedraw 吗？

通常不适合：这些图的重绘涉及多个 layer、复杂 mark 结构、局部 scale 以及轴/clip 的更新，默认的“就地更新属性”难以覆盖，因此更推荐显式 `redrawRef`。

