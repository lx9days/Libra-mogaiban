export type EventFeatures = {
    dwellTime: number;
    mainDirection: "x" | "y" | "none";
    displacementX: number;
    displacementY: number;
    history: TrajectoryPoint[];
    startAxis?: "x" | "y" | "none";
    moveElapsed?: number;
    buffered?: boolean;
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
    private startDown;
    private startWindowMs;
    private stayEnabled;
    private moveEnabled;
    private startAxisEnabled;
    private movingSince;
    private lastMoveX;
    private lastMoveY;
    private moveThreshold;
    private startAxisLogged;
    private pendingStartEvent;
    private startEventTimer;
    setEnabledGestures(options: {
        stay?: boolean;
        move?: boolean;
        startAxis?: boolean;
    }): void;
    analyze(event: Event): EventFeatures;
    private flushPendingStart;
    private dispatchStayEvent;
}
export declare const eventAnalyzer: EventAnalyzer;
export {};
