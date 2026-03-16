// 辅助函数（从 helpers.ts 迁移）
function isLinkPredicatePrimitive(v) {
    if (typeof v === "number")
        return Number.isFinite(v);
    return typeof v === "string" || typeof v === "boolean";
}
function normalizeLinkPredicateValue(value) {
    if (Array.isArray(value)) {
        if (value.length === 2) {
            const a = value[0];
            const b = value[1];
            if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
                const min = Math.min(a, b);
                const max = Math.max(a, b);
                return min < max ? { kind: "range", min, max } : null;
            }
        }
        const vals = value.filter(isLinkPredicatePrimitive);
        if (vals.length === 0)
            return null;
        const set = new Set(vals);
        if (set.size === 1)
            return { kind: "exact", value: vals[0] };
        return { kind: "set", values: set };
    }
    if (isLinkPredicatePrimitive(value)) {
        return { kind: "exact", value };
    }
    if (value && typeof value === "object") {
        return { kind: "exact", value };
    }
    return null;
}
function mergeLinkPredicateValues(prev, next) {
    if (prev.kind === "range" && next.kind === "range") {
        const min = Math.max(prev.min, next.min);
        const max = Math.min(prev.max, next.max);
        return min < max ? { kind: "range", min, max } : null;
    }
    if (prev.kind === "exact" && next.kind === "exact") {
        return prev.value === next.value ? prev : null;
    }
    if (prev.kind === "exact" && typeof prev.value === "object")
        return null;
    if (next.kind === "exact" && typeof next.value === "object")
        return null;
    const exactInRange = (exact, range) => {
        if (typeof exact !== "number")
            return null;
        return exact >= range.min && exact <= range.max ? exact : null;
    };
    const exactInSet = (exact, set) => {
        return set.has(exact) ? exact : null;
    };
    const setIntersect = (a, b) => {
        const out = new Set();
        a.forEach((v) => {
            if (b.has(v))
                out.add(v);
        });
        return out;
    };
    if (prev.kind === "range" && next.kind === "exact") {
        if (typeof next.value === "object")
            return null;
        const hit = exactInRange(next.value, prev);
        return hit === null ? null : { kind: "exact", value: hit };
    }
    if (prev.kind === "exact" && next.kind === "range") {
        if (typeof prev.value === "object")
            return null;
        const hit = exactInRange(prev.value, next);
        return hit === null ? null : { kind: "exact", value: hit };
    }
    if (prev.kind === "set" && next.kind === "exact") {
        if (typeof next.value === "object")
            return null;
        const hit = exactInSet(next.value, prev.values);
        return hit === null ? null : { kind: "exact", value: hit };
    }
    if (prev.kind === "exact" && next.kind === "set") {
        if (typeof prev.value === "object")
            return null;
        const hit = exactInSet(prev.value, next.values);
        return hit === null ? null : { kind: "exact", value: hit };
    }
    if (prev.kind === "set" && next.kind === "set") {
        const inter = setIntersect(prev.values, next.values);
        if (inter.size === 0)
            return null;
        if (inter.size === 1)
            return { kind: "exact", value: [...inter][0] };
        return { kind: "set", values: inter };
    }
    const setWithinRange = (set, range) => {
        const out = new Set();
        set.forEach((v) => {
            if (typeof v !== "number")
                return;
            if (v >= range.min && v <= range.max)
                out.add(v);
        });
        return out;
    };
    if (prev.kind === "range" && next.kind === "set") {
        const inter = setWithinRange(next.values, prev);
        if (inter.size === 0)
            return null;
        if (inter.size === 1)
            return { kind: "exact", value: [...inter][0] };
        return { kind: "set", values: inter };
    }
    if (prev.kind === "set" && next.kind === "range") {
        const inter = setWithinRange(prev.values, next);
        if (inter.size === 0)
            return null;
        if (inter.size === 1)
            return { kind: "exact", value: [...inter][0] };
        return { kind: "set", values: inter };
    }
    return null;
}
export class LinkSelectionHub {
    constructor(id, name) {
        this.id = id;
        this.name = name;
        this.predicates = new Map();
        this.subscribers = new Set();
    }
    setPredicate(sourceId, predicate) {
        if (!sourceId)
            return;
        const entries = predicate && typeof predicate === "object"
            ? Object.entries(predicate)
            : [];
        const hasAnyValidPredicate = entries.some(([, value]) => {
            return normalizeLinkPredicateValue(value) !== null;
        });
        if (!hasAnyValidPredicate) {
            this.predicates.delete(sourceId);
        }
        else {
            this.predicates.set(sourceId, predicate);
        }
        // console.log(`[Hub:${this.name}] Predicates Updated:`, this.predicates);
        this.notifySubscribers();
    }
    subscribe(cb) {
        this.subscribers.add(cb);
        return () => {
            this.subscribers.delete(cb);
        };
    }
    notifySubscribers() {
        this.subscribers.forEach((cb) => {
            try {
                cb();
            }
            catch (e) {
                console.error(`[Hub:${this.name}] Subscriber error:`, e);
            }
        });
    }
    getMergedPredicate() {
        const merged = {};
        const mergedNormalized = {};
        let empty = false;
        this.predicates.forEach((predicate) => {
            if (!predicate || typeof predicate !== "object")
                return;
            Object.entries(predicate).forEach(([field, value]) => {
                const nextNorm = normalizeLinkPredicateValue(value);
                if (!nextNorm)
                    return;
                const prevNorm = mergedNormalized[field];
                if (!prevNorm) {
                    mergedNormalized[field] = nextNorm;
                    return;
                }
                const mergedValue = mergeLinkPredicateValues(prevNorm, nextNorm);
                if (!mergedValue) {
                    empty = true;
                    return;
                }
                mergedNormalized[field] = mergedValue;
            });
        });
        Object.entries(mergedNormalized).forEach(([field, norm]) => {
            if (norm.kind === "range")
                merged[field] = [norm.min, norm.max];
            else if (norm.kind === "exact")
                merged[field] = norm.value;
            else
                merged[field] = Array.from(norm.values);
        });
        return { extents: merged, empty };
    }
}
class LinkSelectionHubManager {
    constructor() {
        this.hubs = new Map();
        // Initialize default hub
        this.createHub(LinkSelectionHubManager.DEFAULT_HUB_ID, "Default Hub");
    }
    createHub(id, name) {
        if (this.hubs.has(id)) {
            return this.hubs.get(id);
        }
        const hub = new LinkSelectionHub(id, name);
        this.hubs.set(id, hub);
        return hub;
    }
    getHub(id) {
        return this.hubs.get(id);
    }
    getOrCreateHub(id, name) {
        if (this.hubs.has(id)) {
            return this.hubs.get(id);
        }
        return this.createHub(id, name || id);
    }
    getDefaultHub() {
        return this.getHub(LinkSelectionHubManager.DEFAULT_HUB_ID);
    }
}
LinkSelectionHubManager.DEFAULT_HUB_ID = "default";
export const hubManager = new LinkSelectionHubManager();
