import GraphicalTransformer from "./transformer";
import * as d3 from "d3";
import * as helpers from "../helpers";

GraphicalTransformer.register("SliderTransformer", {
  constructor: GraphicalTransformer,
  redraw: ({ layer, transformer }) => {
    d3.select(layer.getGraphic())
      .selectAll(":not(.ig-layer-background)")
      .remove();
    const x1 = transformer.getSharedVar("x1") ?? 0;
    const x2 = transformer.getSharedVar("x2") ?? 0;
    const height = transformer.getSharedVar("height") ?? 0;
    const fill = transformer.getSharedVar("fill") ?? "#000000";
    const opacity = transformer.getSharedVar("opacity") ?? 0.3;
    d3.select(layer.getGraphic())
      .append("rect")
      .attr("x1", x1)
      .attr("x2", x2)
      .attr("width", x2 - x1)
      .attr("height", height)
      .attr("fill", fill)
      .attr("opacity", opacity);
  },
});

GraphicalTransformer.register("HighlightSelection", {
  constructor: GraphicalTransformer,
  redraw({ layer, transformer }) {
    const elems = d3
      .select(layer.getGraphic())
      .selectAll(transformer.getSharedVar("selector") || "*");
    const attrValueEntries = Object.entries(
      transformer.getSharedVar("highlightAttrValues")
    );
    attrValueEntries.forEach(([key, value]) => {
      elems.attr(key, value as string);
    });
  },
});

GraphicalTransformer.register("ExtentsLinkTransformer", {
  constructor: GraphicalTransformer,
  redraw: ({ transformer }) => {
    const linkLayers = transformer.getSharedVar("linkLayers");
    if (!Array.isArray(linkLayers) || linkLayers.length === 0) return;

    const extents = transformer.getSharedVar("extents");

    const highlightColor =
      transformer.getSharedVar("linkStrokeColor") ??
      transformer.getSharedVar("highlightColor") ??
      "#00ff1aff";
    const strokeWidth = transformer.getSharedVar("linkStrokeWidth") ?? 1;

    const isValidExtent = (extent) =>
      Array.isArray(extent) &&
      extent.length === 2 &&
      Number.isFinite(extent[0]) &&
      Number.isFinite(extent[1]) &&
      extent[0] < extent[1];

    const validEntries =
      extents && typeof extents === "object"
        ? Object.entries(extents).filter(([, extent]) => isValidExtent(extent))
        : [];

    linkLayers.forEach((layer) => {
      if (!layer || typeof layer.getGraphic !== "function") return;
      if (typeof (layer as any).setLayersOrder === "function") {
        (layer as any).setLayersOrder({
          linkSelectionLayer: 10,
          selectionLayer: 20,
          transientLayer: 30,
        });
      }
      const linkSelectionLayer = layer.getLayerFromQueue("linkSelectionLayer");
      const linkSelectionGraphic = linkSelectionLayer.getGraphic();
      if (!linkSelectionGraphic) return;
      while (linkSelectionGraphic.firstChild) {
        linkSelectionGraphic.removeChild(linkSelectionGraphic.lastChild);
      }

      if (validEntries.length === 0) return;

      const circles = d3.select(layer.getGraphic()).selectAll("circle").nodes();
      const frag = document.createDocumentFragment();
      circles.forEach((circle) => {
        const datum = layer.getDatum(circle);
        if (!datum) return;
        for (const [field, extent] of validEntries) {
          const value = datum[field];
          if (!Number.isFinite(value)) return;
          if (value < extent[0] || value > extent[1]) return;
        }
        const cloned = (circle as any).cloneNode(true) as SVGElement;
        cloned.setAttribute("fill", "none");
        cloned.setAttribute("stroke", highlightColor);
        cloned.setAttribute("stroke-width", String(strokeWidth));
        frag.appendChild(cloned);
      });
      linkSelectionGraphic.appendChild(frag);
    });
  },
});

GraphicalTransformer.register("LinkSelectionHubTransformer", {
  constructor: GraphicalTransformer,
  redraw: ({ layer, transformer }) => {
    const unsub = transformer.getSharedVar("_linkSelectionHubUnsub");
    if (!unsub) {
      transformer.setSharedVar(
        "_linkSelectionHubUnsub",
        helpers.subscribeLinkSelectionPredicates(() => transformer.redraw())
      );
    }

    const selectionLayer = layer.getLayerFromQueue("selectionLayer");
    const selectionGraphic = selectionLayer.getGraphic();
    if (!selectionGraphic) return;
    selectionGraphic.innerHTML = "";

    const merged = helpers.getMergedLinkSelectionPredicate();
    if (merged.empty) return;
    const DATUM_REF_FIELD = "__libra_datum__";
    const isPrimitive = (v: unknown) => {
      if (typeof v === "number") return Number.isFinite(v);
      return typeof v === "string" || typeof v === "boolean";
    };
    const isNumericRange = (v: unknown) => {
      if (!Array.isArray(v) || v.length !== 2) return false;
      const a = (v as any)[0];
      const b = (v as any)[1];
      return Number.isFinite(a) && Number.isFinite(b) && a !== b;
    };
    const validEntries = Object.entries(merged.extents).filter(([, predicate]) => {
      if (isNumericRange(predicate)) return true;
      if (Array.isArray(predicate)) return predicate.some(isPrimitive);
      if (predicate && typeof predicate === "object") return true;
      return isPrimitive(predicate);
    });
    if (validEntries.length === 0) return;

    const elements: Element[] =
      typeof (layer as any).getVisualElements === "function"
        ? (layer as any).getVisualElements()
        : d3.select(layer.getGraphic()).selectAll("*").nodes();

    const matched: Element[] = [];
    elements.forEach((el) => {
      const datum = (layer as any).getDatum?.(el);
      if (!datum) return;
      const matches = (value: unknown, predicate: unknown) => {
        if (isNumericRange(predicate)) {
          if (typeof value !== "number" || !Number.isFinite(value)) return false;
          const a = (predicate as any)[0];
          const b = (predicate as any)[1];
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          return value >= min && value <= max;
        }
        if (Array.isArray(predicate)) {
          const setVals = predicate.filter(isPrimitive);
          if (setVals.length === 0) return false;
          if (!isPrimitive(value)) return false;
          return setVals.some((v) => v === (value as any));
        }
        if (predicate && typeof predicate === "object") {
          return value === predicate;
        }
        if (!isPrimitive(predicate)) return false;
        if (!isPrimitive(value)) return false;
        return value === predicate;
      };

      for (const [field, predicate] of validEntries) {
        if (field === DATUM_REF_FIELD) {
          if (datum !== predicate) return;
          continue;
        }
        const value = (datum as any)[field];
        if (!matches(value, predicate)) return;
      }
      matched.push(el);
    });

    const resultNodes = matched.map((node) =>
      (layer as any).cloneVisualElements?.(node, false)
    );

    let selectionTransformer = transformer.getSharedVar("_selectionTransformer");
    if (!selectionTransformer) {
      selectionTransformer = GraphicalTransformer.initialize("SelectionTransformer", {
        transient: false,
        sharedVar: { layer: selectionLayer, result: [] },
      });
      transformer.setSharedVar("_selectionTransformer", selectionTransformer);
    }

    const highlightAttrValues = transformer.getSharedVar("highlightAttrValues");
    const highlightColor = transformer.getSharedVar("highlightColor");
    const linkStrokeColor = transformer.getSharedVar("linkStrokeColor");
    const linkStrokeWidth = transformer.getSharedVar("linkStrokeWidth") ?? 1;

    selectionTransformer.setSharedVars({
      layer: selectionLayer,
      result: resultNodes,
      highlightColor: highlightColor,
      highlightAttrValues: {
        ...(!highlightColor && !linkStrokeColor ? { fill: "none", stroke: "#00ff1aff" } : {}),
        ...(linkStrokeColor ? { stroke: linkStrokeColor } : {}),
        "stroke-width": linkStrokeWidth,
        ...(highlightAttrValues && typeof highlightAttrValues === "object"
          ? highlightAttrValues
          : {}),
      },
      tooltip: transformer.getSharedVar("tooltip"),
    });
  },
});

GraphicalTransformer.register("TransientRectangleTransformer", {
  constructor: GraphicalTransformer,
  className: ["draw-shape", "transient-shape", "rectangle-shape"],
  redraw: ({ layer, transformer }) => {
    const selection = d3
      .select(layer.getGraphic())
      .selectAll(":not(.ig-layer-background)")
      .remove();
    const brushStyle = transformer.getSharedVar("brushStyle") || {};
    const fill =
      brushStyle.fill ??
      brushStyle.fillColor ??
      transformer.getSharedVar("fillColor") ??
      "#000000";
    const opacity =
      brushStyle.opacity ?? transformer.getSharedVar("opacity") ?? 0.3;

    // Draw current selection rectangle
    const x = transformer.getSharedVar("x");
    const y = transformer.getSharedVar("y");
    const width = transformer.getSharedVar("width");
    const height = transformer.getSharedVar("height");
    
    if (width > 0 && height > 0) {
      const rect = d3
        .select(layer.getGraphic())
        .append("rect")
        .attr("x", x)
        .attr("y", y)
        .attr("width", width)
        .attr("height", height)
        .attr("fill", fill)
        .attr("opacity", opacity);
      Object.entries(brushStyle).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          rect.attr(key, value as string);
        }
      });
    }

    // Draw historical selection rectangles
    const selectionHistory = transformer.getSharedVar("selectionHistory");
    if (selectionHistory && Array.isArray(selectionHistory)) {
      selectionHistory.forEach((histItem) => {
        if (histItem.width > 0 && histItem.height > 0) {
          const histRect = d3
            .select(layer.getGraphic())
            .append("rect")
            .attr("x", histItem.offsetx ?? histItem.x)
            .attr("y", histItem.offsety ?? histItem.y)
            .attr("width", histItem.width)
            .attr("height", histItem.height)
            .attr("fill", fill) // Use same style for consistency, or customize if needed
            .attr("opacity", opacity);
          Object.entries(brushStyle).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              histRect.attr(key, value as string);
            }
          });
        }
      });
    }
  },
});

GraphicalTransformer.register("SelectionTransformer", {
  constructor: GraphicalTransformer,
  redraw: ({ layer, transformer }) => {
    transformer.getSharedVar("result")?.forEach((resultNode) => {
      layer.getGraphic().appendChild(resultNode);
    });
    const highlightColor = transformer.getSharedVar("highlightColor");
    const attrValueEntries = Object.entries(
      transformer.getSharedVar("highlightAttrValues") || {}
    );
    if (highlightColor || attrValueEntries.length) {
      const elems = d3.selectAll(transformer.getSharedVar("result"));

      if (highlightColor) {
        elems.attr("fill", highlightColor).attr("stroke", highlightColor);
      }

      attrValueEntries.forEach(([key, value]) => {
        if (key === "fill" || key === "stroke") {
          elems.style(key, value as string);
        } else {
          elems.attr(key, value as string);
        }
      });
    }
    const tooltip = transformer.getSharedVar("tooltip");
    if (tooltip) {
      if (
        typeof tooltip === "object" &&
        ((tooltip.fields && tooltip.fields.length) || tooltip.text)
      ) {
        const tooltipQueue = [];
        let shouldDisplay = false;
        if (typeof tooltip === "object" && tooltip.prefix) {
          tooltipQueue.push(tooltip.prefix);
        }
        if (tooltip.text) {
          tooltipQueue.push(tooltip.text);
          shouldDisplay = true;
        }
        if (tooltip.fields && tooltip.fields.length) {
          const result = transformer.getSharedVar("result");
          if (result && result.length <= 1) {
            tooltip.fields.forEach((field) => {
              const displayContent = layer.getDatum(result?.[0])?.[field] ?? "";
              if (displayContent) {
                tooltipQueue.push(displayContent);
                shouldDisplay = true;
              }
            });
          } else if (result && result.length > 1) {
            const queueArray = [];
            result.forEach((el) => {
              const datum = layer.getDatum(el);
              if (datum) {
                const subArray = [el];
                tooltip.fields.forEach((field) => {
                  const displayContent = datum?.[field] ?? "";
                  if (displayContent) {
                    subArray.push(displayContent);
                  }
                });
                queueArray.push(subArray);
              }
            });
            shouldDisplay = true;
            tooltipQueue.push(queueArray);
          }
        }
        if (typeof tooltip === "object" && tooltip.suffix) {
          tooltipQueue.push(tooltip.suffix);
        }
        const tooltipText = tooltipQueue.join(" ");
        if (tooltipText && shouldDisplay) {
          if (tooltip.position == "absolute") {
            const tooltipArrayIndex = tooltipQueue.findIndex(
              (item) => item instanceof Array
            );
            if (tooltipArrayIndex !== -1) {
              const tooltipPrefix = tooltipQueue.slice(0, tooltipArrayIndex);
              const tooltipArray = tooltipQueue[tooltipArrayIndex];
              const tooltipSuffix = tooltipQueue.slice(tooltipArrayIndex + 1);
              tooltipArray.forEach((subArray) => {
                const el = subArray[0];
                const str = [
                  ...tooltipPrefix,
                  ...subArray.slice(1),
                  ...tooltipSuffix,
                ].join(" ");
                // Make the tooltip offset relative to the element
                const offsetX =
                  (el.getBBox()?.x ?? 0) + (tooltip.offset?.x ?? 0);
                const offsetY =
                  (el.getBBox()?.y ?? 0) + (tooltip.offset?.y ?? 0);
                d3.select(layer.getGraphic())
                  .append("text")
                  .attr("x", offsetX)
                  .attr("y", offsetY)
                  .text(str);
              });
            }
          } else {
            d3.select(layer.getGraphic())
              .append("text")
              .attr(
                "x",
                transformer.getSharedVar("x") -
                  (layer._offset?.x ?? 0) +
                  (tooltip.offset?.x ?? 0)
              )
              .attr(
                "y",
                transformer.getSharedVar("y") -
                  (layer._offset?.y ?? 0) +
                  (tooltip.offset?.y ?? 0)
              )
              .text(tooltipText);
          }
        }
      }
      if (typeof tooltip === "object" && tooltip.image) {
        if (typeof tooltip.image === "string") {
          d3.select(layer.getGraphic())
            .append("image")
            .attr(
              "x",
              transformer.getSharedVar("x") -
                (layer._offset?.x ?? 0) +
                (tooltip.offset?.x ?? 0)
            )
            .attr(
              "y",
              transformer.getSharedVar("y") -
                (layer._offset?.y ?? 0) +
                (tooltip.offset?.y ?? 0)
            )
            .attr("width", tooltip.width ?? 100)
            .attr("height", tooltip.height ?? 100)
            .attr("style", "object-fit: contain")
            .attr("xlink:href", tooltip.image);
        } else if (tooltip.image instanceof Function) {
          try {
            const image = tooltip.image(
              layer.getDatum(transformer.getSharedVar("result")[0])
            );
            if (image) {
              d3.select(layer.getGraphic())
                .append("image")
                .attr(
                  "x",
                  transformer.getSharedVar("x") -
                    (layer._offset?.x ?? 0) +
                    (tooltip.offset?.x ?? 0)
                )
                .attr(
                  "y",
                  transformer.getSharedVar("y") -
                    (layer._offset?.y ?? 0) +
                    (tooltip.offset?.y ?? 0)
                )
                .attr("width", tooltip.width ?? 100)
                .attr("height", tooltip.height ?? 100)
                .attr("style", "object-fit: contain")
                .attr("xlink:href", image);
            }
          } catch (e) {
            // Do nothing
          }
        }
      }
    }
  },
});

GraphicalTransformer.register("LineTransformer", {
  constructor: GraphicalTransformer,
  transient: true,
  sharedVar: {
    orientation: ["horizontal", "vertical"],
    style: {},
  },
  redraw({ layer, transformer }) {
        const mainLayer = layer.getLayerFromQueue("mainLayer");
        const orientation = transformer.getSharedVar("orientation");
        const style = transformer.getSharedVar("style");
        const x = transformer.getSharedVar("offsetx") ? transformer.getSharedVar("offsetx") : transformer.getSharedVar("x");
        const y = transformer.getSharedVar("offsety") ? transformer.getSharedVar("offsety") : transformer.getSharedVar("y");
        const tooltipConfig = transformer.getSharedVar("tooltip");
        const scaleX = transformer.getSharedVar("scaleX");
        const scaleY = transformer.getSharedVar("scaleY");
        const result = transformer.getSharedVar("result");
    if (
      result &&
      result.slope !== undefined &&
      result.intercept !== undefined
    ) {
      // Draw regression line, will ignore orientation
      orientation.splice(0, orientation.length);
      const line = d3
        .select(layer.getGraphic())
        .append("line")
        .attr("x1", 0)
        .attr("x2", mainLayer.getGraphic().getBoundingClientRect().width)
        .attr("y1", result.intercept)
        .attr(
          "y2",
          result.slope * mainLayer.getGraphic().getBoundingClientRect().width +
            result.intercept
        )
        .attr("stroke-width", 1)
        .attr("stroke", "#000");
      if (style) {
        Object.entries(style).forEach(([key, value]: [string, string]) => {
          line.attr(key, value);
        });
      }
    }
    const tooltipQueue = [];
    let tooltipOffsetX = 0;
    let tooltipOffsetY = 0;
    if (tooltipConfig) {
      if (typeof tooltipConfig === "object" && tooltipConfig.prefix) {
        tooltipQueue.push(tooltipConfig.prefix);
      }
      if (scaleX && scaleX.invert && typeof x === "number") {
        tooltipQueue.push(scaleX.invert(x - (layer._offset?.x ?? 0)));
      }
      if (scaleY && scaleY.invert && typeof y === "number") {
        tooltipQueue.push(scaleY.invert(y - (layer._offset?.y ?? 0)));
      }
      if (typeof tooltipConfig === "object" && tooltipConfig.suffix) {
        tooltipQueue.push(tooltipConfig.suffix);
      }
      if (typeof tooltipConfig === "object" && tooltipConfig.offset) {
        if (typeof tooltipConfig.offset.x === "number") {
          tooltipOffsetX = tooltipConfig.offset.x;
        }
        if (typeof tooltipConfig.offset.y === "number") {
          tooltipOffsetY = tooltipConfig.offset.y;
        }
        if (
          typeof tooltipConfig.offset.x === "function" &&
          typeof x === "number"
        ) {
          tooltipOffsetX = tooltipConfig.offset.x(x - (layer._offset?.x ?? 0));
        }
        if (
          typeof tooltipConfig.offset.y === "function" &&
          typeof y === "number"
        ) {
          tooltipOffsetY = tooltipConfig.offset.y(y - (layer._offset?.y ?? 0));
        }
      }
    }
    const tooltip = tooltipQueue.join(" ");
    if (orientation.includes("horizontal") && typeof y === "number") {
      const line = d3
        .select(layer.getGraphic())
        .append("line")
        .attr("x1", 0)
        .attr("x2", mainLayer.getGraphic().getBoundingClientRect().width)
        .attr("y1", y - (layer._offset?.y ?? 0))
        .attr("y2", y - (layer._offset?.y ?? 0))
        .attr("stroke-width", 1)
        .attr("stroke", "#000");
      if (style) {
        Object.entries(style).forEach(([key, value]: [string, string]) => {
          line.attr(key, value);
        });
      }
    }
    if (orientation.includes("vertical") && typeof x === "number") {
      const line = d3
        .select(layer.getGraphic())
        .append("line")
        .attr("y1", 0)
        .attr("y2", mainLayer.getGraphic().getBoundingClientRect().height)
        .attr("x1", x - (layer._offset?.x ?? 0))
        .attr("x2", x - (layer._offset?.x ?? 0))
        .attr("stroke-width", 1)
        .attr("stroke", "#000");
      if (style) {
        Object.entries(style).forEach(([key, value]: [string, string]) => {
          line.attr(key, value);
        });
      }
    }
    if (tooltip) {
      d3.select(layer.getGraphic())
        .append("text")
        .attr("x", x - (layer._offset?.x ?? 0))
        .attr("y", y - (layer._offset?.y ?? 0))
        .text(tooltip);
    }
  },
});

GraphicalTransformer.register("TextTransformer", {
  constructor: GraphicalTransformer,
  transient: true,
  sharedVar: {
    style: {},
    content: "",
    field: null,
  },
  redraw({ layer, transformer }) {
    const style = transformer.getSharedVar("style");
    const x =
      transformer.getSharedVar("offsetx") || transformer.getSharedVar("x");
    const y =
      transformer.getSharedVar("offsety") || transformer.getSharedVar("y");
    const content = transformer.getSharedVar("content");
    const field = transformer.getSharedVar("field");
    const result = transformer.getSharedVar("result");
    const position = transformer.getSharedVar("position");
    let displayContent = content;
    let displayX = x,
      displayY = y;
    if (field) {
      const datum = layer.getDatum(result);
      if (datum) {
        displayContent = datum?.[field] ?? "";
        if (position instanceof Function) {
          let { x, y } = position(datum);
          displayX = x ?? displayX;
          displayY = y ?? displayY;
        } else {
          displayX = position?.x ?? displayX;
          displayY = position?.y ?? displayY;
        }
      } else {
        displayContent = "";
      }
    }
    d3.select(layer.getGraphic())
      .append("text")
      .attr("x", displayX)
      .attr("y", displayY)
      .text(displayContent)
      .call((t) => {
        if (style) {
          Object.entries(style).forEach(([key, value]: [string, string]) => {
            t.style(key, value);
          });
        }
      });
  },
});
