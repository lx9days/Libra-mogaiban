import Service from "./service";
import * as helpers from "../helpers";
import { GraphicalTransformer } from "../transformer";
const DIM_MANAGED_ATTR = "data-libra-dim-managed";
const DIM_ORIG_ATTR_OPACITY = "data-libra-dim-orig-attr-opacity";
const DIM_ORIG_STYLE_OPACITY = "data-libra-dim-orig-style-opacity";
function clampOpacity(value, fallback) {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(0, Math.min(1, n));
}
function normalizeDimConfig(dim) {
    if (dim === undefined || dim === null || dim === false)
        return null;
    if (dim === true)
        return { opacity: 0.15 };
    if (typeof dim === "number" || typeof dim === "string") {
        return { opacity: clampOpacity(dim, 0.15) };
    }
    if (typeof dim === "object") {
        const opacityRaw = dim.opacity ?? dim.Opacity ?? dim.value ?? dim.Value;
        const opacity = clampOpacity(opacityRaw, 0.15);
        const selectorRaw = dim.selector ?? dim.Selector;
        const selector = typeof selectorRaw === "string" && selectorRaw.trim() ? selectorRaw.trim() : undefined;
        return { opacity, ...(selector ? { selector } : {}) };
    }
    return null;
}
function markDimOriginalOpacity(el) {
    if (el.hasAttribute(DIM_MANAGED_ATTR))
        return;
    el.setAttribute(DIM_MANAGED_ATTR, "1");
    el.setAttribute(DIM_ORIG_ATTR_OPACITY, el.getAttribute("opacity") ?? "");
    const style = el.style;
    el.setAttribute(DIM_ORIG_STYLE_OPACITY, style && typeof style.opacity === "string" ? style.opacity : "");
}
function restoreDimOpacity(el, cleanup) {
    const origAttr = el.getAttribute(DIM_ORIG_ATTR_OPACITY);
    if (origAttr === null)
        return;
    if (origAttr === "")
        el.removeAttribute("opacity");
    else
        el.setAttribute("opacity", origAttr);
    const origStyle = el.getAttribute(DIM_ORIG_STYLE_OPACITY);
    const style = el.style;
    if (style) {
        if (!origStyle)
            style.removeProperty("opacity");
        else
            style.opacity = origStyle;
    }
    if (cleanup) {
        el.removeAttribute(DIM_MANAGED_ATTR);
        el.removeAttribute(DIM_ORIG_ATTR_OPACITY);
        el.removeAttribute(DIM_ORIG_STYLE_OPACITY);
    }
}
function restoreAllDimmed(root) {
    const managed = root.querySelectorAll(`[${DIM_MANAGED_ATTR}="1"]`);
    managed.forEach((el) => restoreDimOpacity(el, true));
}
function buildKeepSet(result, root) {
    const keep = new Set();
    if (!Array.isArray(result))
        return keep;
    result.forEach((node) => {
        if (!(node instanceof Element))
            return;
        if (node === root)
            return;
        let cur = node;
        while (cur && cur !== root) {
            keep.add(cur);
            cur = cur.parentElement;
        }
    });
    return keep;
}
function applyDimming(root, selector, dimOpacity, keep) {
    const targets = root.querySelectorAll(selector && selector.trim() ? selector : "*");
    targets.forEach((el) => {
        if (!(el instanceof Element))
            return;
        if (el.classList.contains("ig-layer-background"))
            return;
        markDimOriginalOpacity(el);
        if (keep.has(el)) {
            restoreDimOpacity(el, false);
            return;
        }
        const style = el.style;
        if (style)
            style.opacity = String(dimOpacity);
        else
            el.setAttribute("opacity", String(dimOpacity));
    });
}
export default class SelectionService extends Service {
    constructor(baseName, options) {
        super(baseName, {
            ...options,
            resultAlias: options?.resultAlias ?? "result",
        });
        this._currentDimension = [];
        if ((options?.renderSelection ?? options?.sharedVar?.renderSelection) !== false) {
            console.log("[SelectionService] Attaching SelectionTransformer to", this._baseName, this);
            this._transformers.push(GraphicalTransformer.initialize("SelectionTransformer", {
                transient: true,
                sharedVar: {
                    [this._resultAlias]: [],
                    layer: null,
                    highlightColor: options?.sharedVar?.highlightColor,
                    highlightAttrValues: options?.sharedVar?.highlightAttrValues,
                    tooltip: options?.sharedVar?.tooltip,
                },
            }));
        }
        else {
            console.log("[SelectionService] No SelectionTransformer to", this._baseName, this);
        }
        this._selectionMapping = new Map();
        Object.entries({
            ...(this._userOptions?.query?.attrName
                ? typeof this._userOptions.query.attrName === "string"
                    ? {
                        [this._userOptions.query.attrName]: this._userOptions?.query?.extent ?? [],
                    }
                    : Object.fromEntries(this._userOptions.query.attrName.map((attr, i) => [
                        attr,
                        this._userOptions?.query?.extent?.[i] ?? [],
                    ]))
                : {}),
            ...(this._sharedVar?.attrName
                ? typeof this._sharedVar.attrName === "string"
                    ? {
                        [this._sharedVar.attrName]: this._sharedVar?.extent ?? [],
                    }
                    : Object.fromEntries(this._sharedVar.attrName.map((attr, i) => [
                        attr,
                        this._sharedVar?.extent?.[i] ?? [],
                    ]))
                : {}),
        })
            .filter(([_, v]) => v instanceof Array)
            .forEach(([key, value]) => this._selectionMapping.set(key, value));
    }
    async setSharedVar(sharedName, value, options) {
        if (options &&
            options.layer &&
            this._layerInstances.length !== 0 &&
            !this._layerInstances.includes(options.layer)) {
            return;
        }
        this.preUpdate();
        this._sharedVar[sharedName] = value;
        this._transformers
            .filter((t) => t.isInstanceOf("draw-shape"))
            .forEach((t) => {
            const layer = options?.layer || this._layerInstances[0];
            if (!layer)
                return;
            let bbox = layer.getGraphic().getBoundingClientRect();
            if ((layer._width && bbox.width > layer._width) ||
                (layer._height && bbox.height > layer._height)) {
                const tempRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                tempRect.setAttribute("x", "0");
                tempRect.setAttribute("y", "0");
                tempRect.setAttribute("width", layer._width.toString());
                tempRect.setAttribute("height", layer._height.toString());
                tempRect.setAttribute("opacity", "0");
                layer.getGraphic().appendChild(tempRect);
                bbox = tempRect.getBoundingClientRect();
                layer.getGraphic().removeChild(tempRect);
            }
            const x = this._sharedVar.x ?? bbox.left;
            const y = this._sharedVar.y ?? bbox.top;
            const width = this._sharedVar.width ?? layer._width ?? 0;
            const height = this._sharedVar.height ?? layer._height ?? 0;
            if (this._sharedVar.width !== undefined ||
                this._sharedVar.height !== undefined) {
                // only set when width or height is set
                t.setSharedVars({
                    layer: layer.getLayerFromQueue("transientLayer"),
                    x: x - bbox.left,
                    y: y - bbox.top,
                    width: width,
                    height: height,
                    ...(this._sharedVar.brushStyle
                        ? { brushStyle: this._sharedVar.brushStyle }
                        : {}),
                });
            }
        }); // transient shape
        if ((options?.layer || this._layerInstances.length == 1) &&
            this._userOptions.query) {
            const layer = options?.layer || this._layerInstances[0];
            if (this._nextTick) {
                return;
            }
            this._nextTick = requestAnimationFrame(async () => {
                this._evaluate(layer);
            });
        }
        else {
            this.postUpdate();
        }
    }
    _evaluate(layer) {
        if (!layer)
            return;
        if (!this._sharedVar.skipPicking) {
            this._oldResult = this._result;
            const newResult = layer.picking({
                ...this._userOptions.query,
                ...this._sharedVar,
            });
            // Check for remnantKey to enable multi-selection (merge behavior)
            const remnantKey = this._sharedVar.remnantKey;
            const event = this._sharedVar.event || window.event; // Try to get event from sharedVar or global
            let isMerging = false;
            if (remnantKey && event && helpers.checkModifier(event, remnantKey)) {
                isMerging = true;
            }
            if (isMerging && this._result) {
                // Merge and deduplicate: union of _result and newResult
                const combined = [...this._result, ...newResult];
                this._result = [...new Set(combined)];
            }
            else {
                this._result = newResult;
            }
            if (this.isInstanceOf("SurfacePointSelectionService")) {
                // console.log(
                //   "[SurfacePointSelectionService] picking result:",
                //   this._result
                // );
            }
        }
        const shouldDim = (this.isInstanceOf("SurfacePointSelectionService") ||
            this.isInstanceOf("PointSelectionService") ||
            this.isInstanceOf("RectSelectionService")) &&
            Object.prototype.hasOwnProperty.call(this._sharedVar, "dim");
        if (shouldDim) {
            const cfg = normalizeDimConfig(this._sharedVar.dim);
            const root = layer.getGraphic();
            if (!cfg) {
                restoreAllDimmed(root);
            }
            else {
                const hasHit = Array.isArray(this._result) &&
                    this._result.some((n) => n instanceof Element && n !== root);
                if (!hasHit) {
                    restoreAllDimmed(root);
                }
                else {
                    const keep = buildKeepSet(this._result, root);
                    applyDimming(root, cfg.selector, cfg.opacity, keep);
                }
            }
        }
        else {
            restoreAllDimmed(layer.getGraphic());
        }
        const selectionLayer = layer
            .getLayerFromQueue("selectionLayer")
            .getGraphic();
        while (selectionLayer?.firstChild) {
            selectionLayer.removeChild(selectionLayer.lastChild);
        }
        if (this._sharedVar.deepClone) {
            let resultNodes = [];
            let refNodes = [];
            this._result.forEach((node) => {
                if (node !== layer.getGraphic()) {
                    let k = refNodes.length;
                    for (let i = 0; i < k; i++) {
                        const refNode = refNodes[i];
                        const resultNode = resultNodes[i];
                        if (node.contains(refNode)) {
                            refNodes.splice(i, 1);
                            resultNodes.splice(i, 1);
                            resultNode.remove();
                            i--;
                            k--;
                        }
                    }
                    resultNodes.push(layer.cloneVisualElements(node, true));
                    refNodes.push(node);
                }
            });
            this._services.forEach((service) => {
                service.setSharedVars({
                    name: this._baseName,
                    ...this._sharedVar,
                    [this._resultAlias]: resultNodes,
                });
            });
        }
        else {
            this._services.forEach((service) => {
                service.setSharedVars({
                    ...this._sharedVar,
                    [this._resultAlias]: this._result
                        ? this._result.map((node) => layer.cloneVisualElements(node, false))
                        : [],
                });
            });
            this._transformers
                .filter((t) => !t.isInstanceOf("draw-shape"))
                .forEach((transformer) => {
                transformer.setSharedVars({
                    name: this._baseName,
                    ...this._sharedVar,
                    x: this._sharedVar.offsetx ?? this._sharedVar.x,
                    y: this._sharedVar.offsety ?? this._sharedVar.y,
                    layer: layer.getLayerFromQueue("selectionLayer"),
                    [this._resultAlias]: this._result
                        ? this._result.map((node) => layer.cloneVisualElements(node, false))
                        : [],
                });
            });
            // Pass selectionHistory to TransientRectangleTransformer
            const selectionHistory = this._sharedVar.selectionHistory;
            if (selectionHistory) {
                this._transformers
                    .filter((t) => t.isInstanceOf("TransientRectangleTransformer"))
                    .forEach((transformer) => {
                    transformer.setSharedVars({
                        selectionHistory: selectionHistory,
                    });
                });
            }
        }
        if (this._sharedVar.scaleX &&
            this._sharedVar.scaleX.invert &&
            this._sharedVar.scaleY &&
            this._sharedVar.scaleY.invert) {
            const x = this._sharedVar.offsetx;
            const y = this._sharedVar.offsety;
            const width = this._sharedVar.width;
            const height = this._sharedVar.height;
            const layerOffsetX = layer._offset?.x ?? 0;
            const layerOffsetY = layer._offset?.y ?? 0;
            const makeExtentFromRect = (offsetx, offsety, w, h) => {
                const ex = [offsetx, offsetx + w]
                    .map((v) => Number(this._sharedVar.scaleX.invert(v)))
                    .sort((a, b) => a - b);
                const ey = [offsety, offsety + h]
                    .map((v) => Number(this._sharedVar.scaleY.invert(v)))
                    .sort((a, b) => a - b);
                return [ex, ey];
            };
            const selectionHistory = this._sharedVar.selectionHistory;
            if (Array.isArray(selectionHistory) && selectionHistory.length > 0) {
                let unionExtentX = null;
                let unionExtentY = null;
                selectionHistory.forEach((histItem) => {
                    const hx = histItem?.offsetx;
                    const hy = histItem?.offsety;
                    const hw = histItem?.width;
                    const hh = histItem?.height;
                    if (!Number.isFinite(hx) ||
                        !Number.isFinite(hy) ||
                        !Number.isFinite(hw) ||
                        !Number.isFinite(hh) ||
                        hw <= 0 ||
                        hh <= 0) {
                        return;
                    }
                    const [ex, ey] = makeExtentFromRect(hx, hy, hw, hh);
                    if (!unionExtentX)
                        unionExtentX = ex;
                    else
                        unionExtentX = [
                            Math.min(unionExtentX[0], ex[0]),
                            Math.max(unionExtentX[1], ex[1]),
                        ];
                    if (!unionExtentY)
                        unionExtentY = ey;
                    else
                        unionExtentY = [
                            Math.min(unionExtentY[0], ey[0]),
                            Math.max(unionExtentY[1], ey[1]),
                        ];
                });
                if (unionExtentX && unionExtentY) {
                    this.filter([unionExtentX, unionExtentY], { passive: true });
                }
            }
            else {
                if (width <= 0 && height <= 0) {
                    this.filter(null, { passive: true });
                }
                else {
                    const [currentExtentX, currentExtentY] = makeExtentFromRect(x - layerOffsetX, y - layerOffsetY, width, height);
                    this.filter([currentExtentX, currentExtentY], { passive: true });
                }
            }
        }
        else if (this._sharedVar.scaleX && this._sharedVar.scaleX.invert) {
            const x = this._sharedVar.offsetx;
            const width = this._sharedVar.width;
            const layerOffsetX = layer._offset?.x ?? 0;
            if (width <= 0) {
                this.filter(null, { passive: true });
            }
            else {
                const newExtentX = [x - layerOffsetX, x - layerOffsetX + width].map(this._sharedVar.scaleX.invert);
                this.filter(newExtentX, { passive: true });
            }
        }
        else if (this._sharedVar.scaleY && this._sharedVar.scaleY.invert) {
            const y = this._sharedVar.offsety;
            const height = this._sharedVar.height;
            const layerOffsetY = layer._offset?.y ?? 0;
            if (height <= 0) {
                this.filter(null, { passive: true });
            }
            else {
                const newExtentY = [y - layerOffsetY, y - layerOffsetY + height].map(this._sharedVar.scaleY.invert);
                this.filter(newExtentY, { passive: true });
            }
        }
        this._nextTick = 0;
        this.postUpdate();
    }
    isInstanceOf(name) {
        return ("SelectionService" === name ||
            this._baseName === name ||
            this._name === name);
    }
    /** Cross filter */
    dimension(dimension, formatter) {
        let dimArr = [];
        let fmtArr = [];
        if (typeof dimension === "string") {
            dimArr = [dimension];
            fmtArr = [formatter ?? ((d) => d)];
        }
        else {
            dimArr = helpers.deepClone(dimension);
            fmtArr =
                formatter ?? dimArr.map(() => (d) => d);
        }
        const zipArr = dimArr.map((d, i) => [d, fmtArr[i]]);
        const scopeSharedVar = {};
        let scopeLayerInstances = [];
        this._currentDimension = zipArr;
        return new Proxy(this, {
            get(target, p, receiver) {
                if (p === "dimension") {
                    return target.dimension.bind(target);
                }
                else if (p === "_currentDimension") {
                    return zipArr;
                }
                else if (p === "_scopeMode") {
                    return true;
                }
                else if (p === "_sharedVar") {
                    if (Object.keys(scopeSharedVar).length)
                        return new Proxy({
                            ...target._sharedVar,
                            scaleX: undefined,
                            scaleY: undefined,
                            ...scopeSharedVar,
                        }, {
                            set: (target, p, value) => {
                                scopeSharedVar[p] = value;
                                return true;
                            },
                        });
                    return new Proxy(target._sharedVar, {
                        set: (target, p, value) => {
                            scopeSharedVar[p] = value;
                            return true;
                        },
                    });
                }
                else if (p === "_layerInstances") {
                    if (scopeLayerInstances.length) {
                        return scopeLayerInstances;
                    }
                    else {
                        return target._layerInstances;
                    }
                }
                else if (target[p] instanceof Function) {
                    return target[p].bind(receiver);
                }
                else {
                    return target[p];
                }
            },
            set(target, p, value) {
                if (p === "_layerInstances") {
                    scopeLayerInstances = value;
                    return true;
                }
                target[p] = value;
                return true;
            },
        });
    }
    filter(extent, options) {
        if (options &&
            options.layer &&
            this._layerInstances.length !== 0 &&
            !this._layerInstances.includes(options.layer)) {
            return this;
        }
        const layer = options?.layer || this._layerInstances[0];
        if (extent === null) {
            this._selectionMapping.clear();
            if (this._sharedVar.linkSelection || this._sharedVar.linkLayers) {
                const sourceId = String(this._sharedVar.linkSelectionSource ?? this._baseName);
                if (this._sharedVar.linkSelectionHub) {
                    const hub = helpers.globalHubManager.getHub(this._sharedVar.linkSelectionHub);
                    if (hub) {
                        hub.set(sourceId, null);
                    }
                }
                else {
                    helpers.setLinkSelectionPredicate(sourceId, null);
                }
            }
            if (!options?.passive) {
                this._sharedVar.attrName = [];
                this._sharedVar.extent = [];
                this._evaluate(layer);
            }
            this._services.forEach((service) => {
                service.setSharedVar("extents", {});
            });
            this._transformers.forEach((transformer) => {
                transformer.setSharedVar("extents", {});
            });
            return this;
        }
        if (this._currentDimension.length === 0 &&
            extent instanceof Array &&
            extent.length > 0) {
            if (this._sharedVar.attrName) {
                this._userOptions.query.attrName = this._sharedVar.attrName;
            }
            if (this._userOptions.query.attrName) {
                this.dimension(this._userOptions.query.attrName).filter(extent);
            }
        }
        else if (this._currentDimension.length === 1 &&
            extent instanceof Array &&
            extent.length > 0 &&
            !(extent[0] instanceof Array)) {
            this._selectionMapping.set(this._currentDimension[0][0], this._currentDimension[0][1](extent)
                .sort((a, b) => typeof a === "number" ? a - b : a < b ? -1 : a == b ? 0 : 1));
            if (this._sharedVar.linkSelection || this._sharedVar.linkLayers) {
                const sourceId = String(this._sharedVar.linkSelectionSource ?? this._baseName);
                if (this._sharedVar.linkSelectionHub) {
                    const hub = helpers.globalHubManager.getHub(this._sharedVar.linkSelectionHub);
                    if (hub) {
                        hub.set(sourceId, this.extents);
                    }
                }
                else {
                    helpers.setLinkSelectionPredicate(sourceId, this.extents);
                }
            }
            if (!options?.passive) {
                this._sharedVar.attrName = [...this._selectionMapping.keys()];
                this._sharedVar.extent = [...this._selectionMapping.values()];
                this._evaluate(layer);
            }
            this._services.forEach((service) => {
                service.setSharedVar("extents", this.extents);
            });
            this._transformers.forEach((transformer) => {
                transformer.setSharedVar("extents", this.extents);
            });
        }
        else if (this._currentDimension.length === extent.length &&
            extent.every((ex) => ex instanceof Array)) {
            const computedMapping = new Map();
            this._currentDimension.forEach((dim, i) => {
                const key = dim[0];
                const nextExtent = dim[1](extent[i]).sort((a, b) => typeof a === "number" ? a - b : a < b ? -1 : a == b ? 0 : 1);
                if (computedMapping.has(key)) {
                    const prevExtent = computedMapping.get(key);
                    if (prevExtent instanceof Array &&
                        nextExtent instanceof Array &&
                        prevExtent.length === 2 &&
                        nextExtent.length === 2 &&
                        typeof prevExtent[0] === "number" &&
                        typeof prevExtent[1] === "number" &&
                        typeof nextExtent[0] === "number" &&
                        typeof nextExtent[1] === "number") {
                        computedMapping.set(key, [
                            Math.max(prevExtent[0], nextExtent[0]),
                            Math.min(prevExtent[1], nextExtent[1]),
                        ]);
                    }
                    else {
                        computedMapping.set(key, nextExtent);
                    }
                }
                else {
                    computedMapping.set(key, nextExtent);
                }
            });
            computedMapping.forEach((v, k) => this._selectionMapping.set(k, v));
            if (this._sharedVar.linkSelection || this._sharedVar.linkLayers) {
                const sourceId = String(this._sharedVar.linkSelectionSource ?? this._baseName);
                helpers.setLinkSelectionPredicate(sourceId, this.extents);
            }
            if (!options?.passive) {
                this._sharedVar.attrName = [...this._selectionMapping.keys()];
                this._sharedVar.extent = [...this._selectionMapping.values()];
                this._evaluate(layer);
            }
            this._services.forEach((service) => {
                service.setSharedVar("extents", this.extents);
            });
            this._transformers.forEach((transformer) => {
                transformer.setSharedVar("extents", this.extents);
            });
        }
        return this;
    }
    get extents() {
        return Object.fromEntries(this._selectionMapping.entries());
    }
}
Service.SelectionService = SelectionService;
Service.register("SelectionService", {
    constructor: SelectionService,
});
Service.register("SurfacePointSelectionService", {
    constructor: SelectionService,
    query: {
        baseOn: helpers.QueryType.Shape,
        type: helpers.ShapeQueryType.SurfacePoint,
        x: 0,
        y: 0,
    },
});
Service.register("PointSelectionService", {
    constructor: SelectionService,
    query: {
        baseOn: helpers.QueryType.Shape,
        type: helpers.ShapeQueryType.Point,
        x: 0,
        y: 0,
    },
});
Service.register("RectSelectionService", {
    constructor: SelectionService,
    transformers: [
        GraphicalTransformer.initialize("TransientRectangleTransformer", {
            sharedVar: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                opacity: 0.3,
            },
        }),
    ],
    query: {
        baseOn: helpers.QueryType.Shape,
        type: helpers.ShapeQueryType.Rect,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
    },
});
Service.register("CircleSelectionService", {
    constructor: SelectionService,
    query: {
        baseOn: helpers.QueryType.Shape,
        type: helpers.ShapeQueryType.Circle,
        x: 0,
        y: 0,
        r: 1,
    },
});
Service.register("PolygonSelectionService", {
    constructor: SelectionService,
    query: {
        baseOn: helpers.QueryType.Shape,
        type: helpers.ShapeQueryType.Polygon,
        points: [],
    },
});
Service.register("QuantitativeSelectionService", {
    constructor: SelectionService,
    transformers: [
        GraphicalTransformer.initialize("TransientRectangleTransformer", {
            sharedVar: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                opacity: 0.3,
            },
        }),
    ],
    query: {
        baseOn: helpers.QueryType.Data,
        type: helpers.DataQueryType.Quantitative,
        attrName: "",
        extent: [0, 0],
    },
});
