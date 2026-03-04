export type EventFeatures = {
    dwellTime: number;
    mainDirection: "x" | "y" | "none";
    displacementX: number;
    displacementY: number;
    history: TrajectoryPoint[];
};
type TrajectoryPoint = {
    x: number;
    y: number;
    t: number;
};
export declare class EventAnalyzer {
    private trajectory;
    private dwellStart;
    private dwellThreshold;
    private historyWindow;
    private stayTimer;
    private lastEventSnapshot;
    analyze(event: Event): EventFeatures;
    private dispatchStayEvent;
}
export declare const eventAnalyzer: EventAnalyzer;
export {};
