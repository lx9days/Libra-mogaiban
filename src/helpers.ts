import { Instrument } from "./instrument";
import { Interactor } from "./interactor";
import { Layer } from "./layer";
import { AllRecordingComponents } from "./history";

export const LibraSymbol = Symbol("Libra");

export const globalConfig = {
  debug: true
};

export enum QueryType {
  Shape,
  Data,
  Attr,
}

export enum ShapeQueryType {
  SurfacePoint,
  Point,
  Circle,
  Rect,
  Polygon,
}

export enum DataQueryType {
  Quantitative,
  Nominal,
  Temporal,
}

// export enum AttrQueryType {

// }

// We assume the transformation in Libra are all affined
type DomainInputType = any[] | void;
type DomainOutputType<T> = T extends any[] ? void : any[];
type RangeInputType = number[];
type RangeOutputType<T> = T extends void ? void : number[];

export type Transformation = {
  (domain: any): number;
  invert(range: number): any;
  copy(): Transformation;
  domain?(): any[];
  domain?(newDomain: any[]): Transformation;
  range?(): number[];
  range?(newRange: number[]): Transformation;
  clamp?(bool: boolean): Transformation;
};

export type ShapeBasedQuery =
  | SurfacePointQuery
  | PointQuery
  | CircleQuery
  | RectQuery
  | PolygonQuery;

export type SurfacePointQuery = {
  baseOn: QueryType.Shape;
  type: ShapeQueryType.SurfacePoint;
  x: number;
  y: number;
};

export type PointQuery = {
  baseOn: QueryType.Shape;
  type: ShapeQueryType.Point;
  x: number;
  y: number;
};

export type CircleQuery = {
  baseOn: QueryType.Shape;
  type: ShapeQueryType.Circle;
  x: number;
  y: number;
  r: number;
};

export type RectQuery = {
  baseOn: QueryType.Shape;
  type: ShapeQueryType.Rect;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PolygonQuery = {
  baseOn: QueryType.Shape;
  type: ShapeQueryType.Polygon;
  points: { x: number; y: number }[];
};

export type DataBasedQuery = QuantitativeQuery | NominalQuery | TemporalQuery;

export type QuantitativeQuery = {
  baseOn: QueryType.Data;
  type: DataQueryType.Quantitative;
} & (
  | {
      attrName: string;
      extent: [number, number];
    }
  | {
      attrName: string[];
      extent: [number, number][];
    }
);
export type NominalQuery = {
  baseOn: QueryType.Data;
  type: DataQueryType.Nominal;
} & (
  | {
      attrName: string;
      extent: unknown[];
    }
  | {
      attrName: string[];
      extent: unknown[][];
    }
);
export type TemporalQuery = {
  baseOn: QueryType.Data;
  type: DataQueryType.Temporal;
} & (
  | {
      attrName: string;
      extent: [Date, Date];
      dateParser?: (value: unknown) => Date;
    }
  | {
      attrName: string[];
      extent: [Date, Date][];
      dateParser?: ((value: unknown) => Date)[];
    }
);

export type AttributeBasedQuery = {
  baseOn: QueryType.Attr;
  type: string;
  attrName: string;
  value: unknown;
  //[parameter: string]: any;
};

export type ArbitraryQuery =
  | ShapeBasedQuery
  | DataBasedQuery
  | AttributeBasedQuery;

export type CommonHandlerInput<T> = {
  self: T;
  layer: Layer<any>;
  instrument: Instrument;
  interactor: Interactor;
  [parameter: string]: any;
};

class NonsenseClass {}

type FindableListType<T> = T[] &
  T & {
    find(name: string, defaultValue?: string): FindableListType<T>;
    add(...args: any[]): FindableListType<T>;
    remove(name: string): FindableListType<T>;
    join(extents: any[]): FindableListType<T>;
    filter(extents: any[]): FindableListType<T>;
  };

let tryRegisterDynamicInstance = (...args: any) => {};
export function makeFindableList<T extends AllRecordingComponents>(
  list: any,
  typing:
    | { new (...args: any[]): NonsenseClass }
    | { initialize(...args: any[]): T },
  addFunc: (newElement: T) => void,
  removeFunc: (element: T) => void,
  self: AllRecordingComponents
): FindableListType<T> {
  return new Proxy(list, {
    get(target, p) {
      if (p === "find") {
        return function (name: string, defaultValue: string) {
          if (!("initialize" in typing)) {
            const filteredResult = target.slice();
            filteredResult.forEach((newTarget) => {
              newTarget.find(...arguments);
            });
            return makeFindableList(
              filteredResult,
              typing,
              addFunc,
              removeFunc,
              self
            );
          } else {
            const filteredResult = target.filter((item) =>
              item.isInstanceOf(name)
            );
            if (filteredResult.length <= 0 && defaultValue) {
              const newElement = typing.initialize(defaultValue) as T;
              addFunc(newElement);
              filteredResult.push(newElement);
              tryRegisterDynamicInstance(self, newElement);
            }
            return makeFindableList(
              filteredResult,
              typing,
              addFunc,
              removeFunc,
              self
            );
          }
        };
      } else if (p === "add") {
        return (...args: any[]) => {
          const filteredResult = target.slice();
          if (!("initialize" in typing)) {
            filteredResult.forEach((newTarget) => {
              newTarget.add(...args);
            });
            return makeFindableList(
              filteredResult,
              typing,
              addFunc,
              removeFunc,
              self
            );
          } else {
            const newElement = typing.initialize(...args) as T;
            addFunc(newElement);
            filteredResult.push(newElement);
            tryRegisterDynamicInstance(self, newElement);
            return makeFindableList(
              filteredResult,
              typing,
              addFunc,
              removeFunc,
              self
            );
          }
        };
      } else if (p === "remove") {
        return (name: string) => {
          if (typing === NonsenseClass) {
            const filteredResult = target.slice();
            filteredResult.forEach((newTarget) => {
              newTarget.remove(name);
            });
            return makeFindableList(
              filteredResult,
              typing,
              addFunc,
              removeFunc,
              self
            );
          } else {
            const origin = target.slice();
            const filteredResult = origin.filter((item) =>
              item.isInstanceOf(name)
            );
            filteredResult.forEach((item) => {
              removeFunc(item);
              origin.splice(origin.indexOf(item), 1);
            });
            return makeFindableList(origin, typing, addFunc, removeFunc, self);
          }
        };
      } else if (p in target && p !== "join" && p !== "filter") {
        return target[p];
      } else {
        if (!target.length) {
          const f = () => {};
          f[Symbol.iterator] = function* () {};
          return f;
        } else if (target[0][p] instanceof Function) {
          return function () {
            return makeFindableList(
              target.map((t) => t[p].apply(t, arguments)),
              NonsenseClass,
              () => {},
              () => {},
              self
            );
          };
        } else {
          return makeFindableList(
            target.map((t) => t[p]),
            NonsenseClass,
            () => {},
            () => {},
            self
          );
        }
      }
    },
  });
}

export function getTransform(elem: SVGElement) {
  try {
    const transform = elem
      .getAttribute("transform")
      .split("(")[1]
      .split(")")[0]
      .split(",")
      .map((i) => parseFloat(i));
    return transform;
  } catch (e) {
    return [0, 0];
  }
}

/**
 * Parse an event selector string.
 * Returns an array of event stream definitions.
 */
export function parseEventSelector(selector: string) {
  return parseMerge(selector.trim()).map(parseSelector);
}

const VIEW = "view",
  LBRACK = "[",
  RBRACK = "]",
  LBRACE = "{",
  RBRACE = "}",
  COLON = ":",
  COMMA = ",",
  NAME = "@",
  GT = ">",
  ILLEGAL = /[[\]{}]/,
  DEFAULT_SOURCE = VIEW,
  DEFAULT_MARKS = {
    "*": 1,
    arc: 1,
    area: 1,
    group: 1,
    image: 1,
    line: 1,
    path: 1,
    rect: 1,
    rule: 1,
    shape: 1,
    symbol: 1,
    text: 1,
    trail: 1,
  },
  MARKS = DEFAULT_MARKS;

function isMarkType(type: string) {
  return MARKS.hasOwnProperty(type);
}

function find(
  s: string,
  i: number,
  endChar: string,
  pushChar?: string,
  popChar?: string
) {
  let count = 0,
    c: string;
  const n = s.length;

  for (; i < n; ++i) {
    c = s[i];
    if (!count && c === endChar) return i;
    else if (popChar && popChar.indexOf(c) >= 0) --count;
    else if (pushChar && pushChar.indexOf(c) >= 0) ++count;
  }
  return i;
}

export type EventStream = {
  source: string;
  type: string;
  markname?: string;
  marktype?: string;
  consume?: boolean;
  filter?: string[];
  throttle?: number;
  debounce?: number;
};

export type BetweenEventStream =
  | (EventStream & {
      between: (EventStream | BetweenEventStream)[];
    })
  | {
      between: (EventStream | BetweenEventStream)[];
      stream: BetweenEventStream[];
    };

function parseMerge(s: string) {
  const output: string[] = [],
    n = s.length;
  let start = 0,
    i = 0;

  while (i < n) {
    i = find(s, i, COMMA, LBRACK + LBRACE, RBRACK + RBRACE);
    output.push(s.substring(start, i).trim());
    start = ++i;
  }

  if (output.length === 0) {
    throw "Empty event selector: " + s;
  }
  return output;
}

function parseSelector(s: string) {
  return s[0] === "[" ? parseBetween(s) : parseStream(s);
}

function parseBetween(s: string): BetweenEventStream {
  const n = s.length;
  let i = 1,
    b: string[],
    stream;

  i = find(s, i, RBRACK, LBRACK, RBRACK);
  if (i === n) {
    throw "Empty between selector: " + s;
  }

  b = parseMerge(s.substring(1, i));
  if (b.length !== 2) {
    throw "Between selector must have two elements: " + s;
  }

  s = s.slice(i + 1).trim();
  if (s[0] !== GT) {
    throw "Expected '>' after between selector: " + s;
  }

  const bt = b.map(parseSelector);

  stream = parseSelector(s.slice(1).trim());
  if (stream.between) {
    return {
      between: bt,
      stream: stream,
    };
  } else {
    stream.between = bt;
  }

  return stream;
}

function parseStream(s: string) {
  const stream: EventStream = {
      source: DEFAULT_SOURCE,
      type: "",
    },
    source = [];
  let throttle = [0, 0],
    markname = 0,
    start = 0,
    n = s.length,
    i = 0,
    j: number,
    filter: string[];

  // extract throttle from end
  if (s[n - 1] === RBRACE) {
    i = s.lastIndexOf(LBRACE);
    if (i >= 0) {
      try {
        throttle = parseThrottle(s.substring(i + 1, n - 1));
      } catch (e) {
        throw "Invalid throttle specification: " + s;
      }
      s = s.slice(0, i).trim();
      n = s.length;
    } else throw "Unmatched right brace: " + s;
    i = 0;
  }

  if (!n) throw s;

  // set name flag based on first char
  if (s[0] === NAME) markname = ++i;

  // extract first part of multi-part stream selector
  j = find(s, i, COLON);
  if (j < n) {
    source.push(s.substring(start, j).trim());
    start = i = ++j;
  }

  // extract remaining part of stream selector
  i = find(s, i, LBRACK);
  if (i === n) {
    source.push(s.substring(start, n).trim());
  } else {
    source.push(s.substring(start, i).trim());
    filter = [];
    start = ++i;
    if (start === n) throw "Unmatched left bracket: " + s;
  }

  // extract filters
  while (i < n) {
    i = find(s, i, RBRACK);
    if (i === n) throw "Unmatched left bracket: " + s;
    filter.push(s.substring(start, i).trim());
    if (i < n - 1 && s[++i] !== LBRACK) throw "Expected left bracket: " + s;
    start = ++i;
  }

  // marshall event stream specification
  if (!(n = source.length) || ILLEGAL.test(source[n - 1])) {
    throw "Invalid event selector: " + s;
  }

  if (n > 1) {
    stream.type = source[1];
    if (markname) {
      stream.markname = source[0].slice(1);
    } else if (isMarkType(source[0])) {
      stream.marktype = source[0];
    } else {
      stream.source = source[0];
    }
  } else {
    stream.type = source[0];
  }
  if (stream.type.slice(-1) === "!") {
    stream.consume = true;
    stream.type = stream.type.slice(0, -1);
  }
  if (filter != null) stream.filter = filter;
  if (throttle[0]) stream.throttle = throttle[0];
  if (throttle[1]) stream.debounce = throttle[1];

  return stream;
}

function parseThrottle(s: string) {
  const a = s.split(COMMA);
  if (!s.length || a.length > 2) throw s;
  return a.map(function (_) {
    const x = +_;
    if (x !== x) throw s;
    return x;
  });
}

export function deepClone(obj) {
  if (
    obj &&
    obj instanceof Object &&
    "copy" in obj &&
    obj.copy instanceof Function
  ) {
    const nodeCopy = obj.copy();
    // Assign other custom properties to the node
    for (let key in Object.getOwnPropertyDescriptors(obj)) {
      if (!(key in nodeCopy)) {
        nodeCopy[key] = obj[key];
      }
    }
    return nodeCopy;
  }
  if (obj instanceof Array) {
    return obj.map(deepClone);
  }
  if (
    [
      "string",
      "number",
      "boolean",
      "undefined",
      "bigint",
      "symbol",
      "function",
    ].includes(typeof obj)
  ) {
    return obj;
  }
  if (obj === null) return null;
  if (LibraSymbol in obj && obj[LibraSymbol]) {
    return obj;
  }
  if (obj instanceof Node) {
    const nodeCopy = obj.cloneNode(true);
    // Assign other custom properties to the node (e.g., __data__ from D3)
    Object.assign(nodeCopy, obj);
    return nodeCopy;
  }
  const propertyObject = Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, deepClone(v)])
  );
  return Object.assign(
    Object.create(Object.getPrototypeOf(obj)),
    propertyObject
  );
}

export const global = {
  stopTransient: false,
  linkSelectionPredicates: new Map<string, Record<string, unknown>>(),
  linkSelectionSubscribers: new Set<() => void>(),
};

type LinkPredicatePrimitive = string | number | boolean;
type LinkPredicateExact = LinkPredicatePrimitive | object;
type LinkPredicateNormalized =
  | { kind: "range"; min: number; max: number }
  | { kind: "exact"; value: LinkPredicateExact }
  | { kind: "set"; values: Set<LinkPredicatePrimitive> };

function isLinkPredicatePrimitive(v: unknown): v is LinkPredicatePrimitive {
  if (typeof v === "number") return Number.isFinite(v);
  return typeof v === "string" || typeof v === "boolean";
}

function normalizeLinkPredicateValue(
  value: unknown
): LinkPredicateNormalized | null {
  if (Array.isArray(value)) {
    if (value.length === 2) {
      const a = value[0] as any;
      const b = value[1] as any;
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        const min = Math.min(a, b);
        const max = Math.max(a, b);
        return min < max ? { kind: "range", min, max } : null;
      }
    }
    const vals = value.filter(isLinkPredicatePrimitive);
    if (vals.length === 0) return null;
    const set = new Set<LinkPredicatePrimitive>(vals);
    if (set.size === 1) return { kind: "exact", value: vals[0] as any };
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

function mergeLinkPredicateValues(
  prev: LinkPredicateNormalized,
  next: LinkPredicateNormalized
): LinkPredicateNormalized | null {
  if (prev.kind === "range" && next.kind === "range") {
    const min = Math.max(prev.min, next.min);
    const max = Math.min(prev.max, next.max);
    return min < max ? { kind: "range", min, max } : null;
  }

  if (prev.kind === "exact" && next.kind === "exact") {
    return prev.value === next.value ? prev : null;
  }

  if (prev.kind === "exact" && typeof prev.value === "object") return null;
  if (next.kind === "exact" && typeof next.value === "object") return null;

  const exactInRange = (exact: LinkPredicatePrimitive, range: any) => {
    if (typeof exact !== "number") return null;
    return exact >= range.min && exact <= range.max ? exact : null;
  };

  const exactInSet = (exact: LinkPredicatePrimitive, set: Set<LinkPredicatePrimitive>) => {
    return set.has(exact) ? exact : null;
  };

  const setIntersect = (
    a: Set<LinkPredicatePrimitive>,
    b: Set<LinkPredicatePrimitive>
  ) => {
    const out = new Set<LinkPredicatePrimitive>();
    a.forEach((v) => {
      if (b.has(v)) out.add(v);
    });
    return out;
  };

  if (prev.kind === "range" && next.kind === "exact") {
    if (typeof next.value === "object") return null;
    const hit = exactInRange(next.value, prev);
    return hit === null ? null : { kind: "exact", value: hit };
  }
  if (prev.kind === "exact" && next.kind === "range") {
    if (typeof prev.value === "object") return null;
    const hit = exactInRange(prev.value, next);
    return hit === null ? null : { kind: "exact", value: hit };
  }

  if (prev.kind === "set" && next.kind === "exact") {
    if (typeof next.value === "object") return null;
    const hit = exactInSet(next.value, prev.values);
    return hit === null ? null : { kind: "exact", value: hit };
  }
  if (prev.kind === "exact" && next.kind === "set") {
    if (typeof prev.value === "object") return null;
    const hit = exactInSet(prev.value, next.values);
    return hit === null ? null : { kind: "exact", value: hit };
  }

  if (prev.kind === "set" && next.kind === "set") {
    const inter = setIntersect(prev.values, next.values);
    if (inter.size === 0) return null;
    if (inter.size === 1) return { kind: "exact", value: [...inter][0] };
    return { kind: "set", values: inter };
  }

  const setWithinRange = (set: Set<LinkPredicatePrimitive>, range: any) => {
    const out = new Set<LinkPredicatePrimitive>();
    set.forEach((v) => {
      if (typeof v !== "number") return;
      if (v >= range.min && v <= range.max) out.add(v);
    });
    return out;
  };

  if (prev.kind === "range" && next.kind === "set") {
    const inter = setWithinRange(next.values, prev);
    if (inter.size === 0) return null;
    if (inter.size === 1) return { kind: "exact", value: [...inter][0] };
    return { kind: "set", values: inter };
  }
  if (prev.kind === "set" && next.kind === "range") {
    const inter = setWithinRange(prev.values, next);
    if (inter.size === 0) return null;
    if (inter.size === 1) return { kind: "exact", value: [...inter][0] };
    return { kind: "set", values: inter };
  }

  return null;
}

export interface LinkSelectionHub {
  set(sourceId: string, predicate: unknown): void;
  subscribe(cb: () => void): () => void;
  get(): unknown;
}

export class SelectionHub implements LinkSelectionHub {
  private predicates = new Map<string, Record<string, unknown>>();
  private subscribers = new Set<() => void>();

  set(sourceId: string, predicate: Record<string, unknown> | null | undefined) {
    if (!sourceId) return;
    const entries =
      predicate && typeof predicate === "object"
        ? Object.entries(predicate)
        : [];
    const hasAnyValidPredicate = entries.some(([, value]) => {
      return normalizeLinkPredicateValue(value) !== null;
    });

    if (!hasAnyValidPredicate) {
      this.predicates.delete(sourceId);
    } else {
      this.predicates.set(sourceId, predicate as Record<string, unknown>);
    }

    console.log("Selection Hub Update:", this.predicates);

    this.notify();
  }

  subscribe(cb: () => void) {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  get() {
    const merged: Record<string, unknown> = {};
    const mergedNormalized: Record<string, LinkPredicateNormalized> = {};
    let empty = false;

    this.predicates.forEach((predicate) => {
      if (!predicate || typeof predicate !== "object") return;
      Object.entries(predicate).forEach(([field, value]) => {
        const nextNorm = normalizeLinkPredicateValue(value);
        if (!nextNorm) return;

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
      if (norm.kind === "range") merged[field] = [norm.min, norm.max];
      else if (norm.kind === "exact") merged[field] = norm.value;
      else merged[field] = Array.from(norm.values);
    });

    return { extents: merged, empty };
  }
}

export class GenericHub implements LinkSelectionHub {
  private predicates = new Map<string, unknown>();
  private subscribers = new Set<() => void>();

  set(sourceId: string, predicate: unknown) {
    if (!sourceId) return;
    
    if (predicate === null || predicate === undefined) {
      this.predicates.delete(sourceId);
    } else {
      this.predicates.set(sourceId, predicate);
    }

    this.notify();
  }

  subscribe(cb: () => void) {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch {}
    });
  }

  get() {
    // Generic hub simply returns all predicates as a map object
    // It does not attempt to merge them
    return Object.fromEntries(this.predicates);
  }
}

export class LinkSelectionHubManager {
  private hubs = new Map<string, LinkSelectionHub>();
  static DEFAULT_HUB_ID = "default";

  constructor() {
    // Initialize with the default SelectionHub to maintain backward compatibility behavior
    this.hubs.set(LinkSelectionHubManager.DEFAULT_HUB_ID, new SelectionHub());
  }

  getHub(hubId: string): LinkSelectionHub | undefined {
    return this.hubs.get(hubId);
  }

  createHub(hubId: string, type: "selection" | "generic"): LinkSelectionHub {
    const hub = type === "selection" ? new SelectionHub() : new GenericHub();
    this.hubs.set(hubId, hub);
    return hub;
  }
  
  getDefaultHub() {
      return this.hubs.get(LinkSelectionHubManager.DEFAULT_HUB_ID)!;
  }
}

export const globalHubManager = new LinkSelectionHubManager();

// Backward compatibility wrappers
export function setLinkSelectionPredicate(
  sourceId: string,
  predicate: Record<string, unknown> | null | undefined
) {
  globalHubManager.getDefaultHub().set(sourceId, predicate);
}

export function subscribeLinkSelectionPredicates(cb: () => void) {
  return globalHubManager.getDefaultHub().subscribe(cb);
}

export function getMergedLinkSelectionPredicate() {
  return globalHubManager.getDefaultHub().get() as { extents: Record<string, unknown>, empty: boolean };
}

import("./history").then((HM) => {
  tryRegisterDynamicInstance = HM.tryRegisterDynamicInstance;
});

export function checkModifier(
  event: MouseEvent | TouchEvent,
  modifier: string
): boolean {
  if (!modifier) return true;
  if (!(event instanceof MouseEvent)) return true;

  switch (modifier.toLowerCase()) {
    case "ctrl":
      return event.ctrlKey;
    case "shift":
      return event.shiftKey;
    case "alt":
      return event.altKey;
    case "meta":
    case "cmd":
    case "command":
      return event.metaKey;
    default:
      return true;
  }
}
