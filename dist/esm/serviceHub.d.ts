export type LinkPredicatePrimitive = string | number | boolean;
export type LinkPredicateExact = LinkPredicatePrimitive | object;
export type LinkPredicateNormalized = {
    kind: "range";
    min: number;
    max: number;
} | {
    kind: "exact";
    value: LinkPredicateExact;
} | {
    kind: "set";
    values: Set<LinkPredicatePrimitive>;
};
export declare class LinkSelectionHub {
    id: string;
    name: string;
    private predicates;
    private subscribers;
    constructor(id: string, name: string);
    setPredicate(sourceId: string, predicate: Record<string, unknown> | null | undefined): void;
    subscribe(cb: () => void): () => void;
    private notifySubscribers;
    getMergedPredicate(): {
        extents: Record<string, unknown>;
        empty: boolean;
    };
}
declare class LinkSelectionHubManager {
    private hubs;
    static readonly DEFAULT_HUB_ID = "default";
    constructor();
    createHub(id: string, name: string): LinkSelectionHub;
    getHub(id: string): LinkSelectionHub | undefined;
    getOrCreateHub(id: string, name?: string): LinkSelectionHub;
    getDefaultHub(): LinkSelectionHub;
}
export declare const hubManager: LinkSelectionHubManager;
export {};
