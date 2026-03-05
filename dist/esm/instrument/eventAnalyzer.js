export class EventAnalyzer {
    constructor() {
        this.trajectory = [];
        this.dwellStart = null;
        this.dwellThreshold = 5; // px
        this.historyWindow = 200; // ms
        this.stayTimer = null;
        this.lastEventSnapshot = null;
        this.startDown = null;
        this.startWindowMs = 200; // ms
        this.stayEnabled = true;
        this.moveEnabled = false;
        this.startAxisEnabled = false;
        this.movingSince = null;
        this.lastMoveX = null;
        this.lastMoveY = null;
        this.moveThreshold = 0.5; // px
        this.startAxisLogged = false;
        this.pendingStartEvent = null;
        this.startEventTimer = null;
    }
    setEnabledGestures(options) {
        if (typeof options?.stay === "boolean") {
            this.stayEnabled = options.stay;
            if (!this.stayEnabled && this.stayTimer) {
                clearTimeout(this.stayTimer);
                this.stayTimer = null;
            }
        }
        if (typeof options?.move === "boolean") {
            this.moveEnabled = options.move;
            if (!this.moveEnabled) {
                this.movingSince = null;
                this.lastMoveX = null;
                this.lastMoveY = null;
            }
        }
        if (typeof options?.startAxis === "boolean") {
            this.startAxisEnabled = options.startAxis;
        }
    }
    analyze(event) {
        if (event.libraFeatures)
            return event.libraFeatures;
        // Detect if this is a re-dispatched stay event
        const isStayEvent = event.libraStayEvent;
        const now = Date.now();
        const features = {
            dwellTime: 0,
            mainDirection: "none",
            displacementX: 0,
            displacementY: 0,
            history: []
        };
        let clientX, clientY;
        if (event instanceof MouseEvent) {
            clientX = event.clientX;
            clientY = event.clientY;
            if (event.type === "mousedown") {
                this.startDown = { x: clientX, y: clientY, t: now };
                this.startAxisLogged = false;
            }
        }
        else if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        }
        else {
            // Non-pointer events: keep last state or return empty
            return features;
        }
        // Update trajectory
        this.trajectory.push({ x: clientX, y: clientY, t: now });
        // Clean old points (> 200ms)
        this.trajectory = this.trajectory.filter(p => now - p.t <= this.historyWindow);
        features.history = [...this.trajectory];
        // Calculate displacement & direction over history
        if (this.trajectory.length > 1) {
            const start = this.trajectory[0];
            const end = this.trajectory[this.trajectory.length - 1];
            const dx = Math.abs(end.x - start.x);
            const dy = Math.abs(end.y - start.y);
            features.displacementX = dx;
            features.displacementY = dy;
            if (dx > dy && dx > 2)
                features.mainDirection = "x";
            else if (dy > dx && dy > 2)
                features.mainDirection = "y";
        }
        // Compute start-axis over first 200ms after mousedown
        if (this.startAxisEnabled && this.startDown) {
            const elapsed = now - this.startDown.t;
            const dxStart = Math.abs(clientX - this.startDown.x);
            const dyStart = Math.abs(clientY - this.startDown.y);
            const dist = Math.sqrt(dxStart * dxStart + dyStart * dyStart);
            let determinedAxis = null;
            // Early detection: if moved > 5px and clearly dominant
            if (dist > 5 && (dxStart > dyStart * 2 || dyStart > dxStart * 2)) {
                if (dxStart > dyStart)
                    determinedAxis = "x";
                else
                    determinedAxis = "y";
            }
            else if (elapsed >= this.startWindowMs) {
                // Timeout detection
                if (dxStart > dyStart && dxStart > 2)
                    determinedAxis = "x";
                else if (dyStart > dxStart && dyStart > 2)
                    determinedAxis = "y";
                else
                    determinedAxis = "none";
            }
            if (determinedAxis) {
                features.startAxis = determinedAxis;
                if (this.pendingStartEvent) {
                    this.flushPendingStart(determinedAxis);
                }
                if (!this.startAxisLogged && (features.startAxis === "x" || features.startAxis === "y")) {
                    const label = features.startAxis === "x" ? "start-horizontally" : "start-vertically";
                    try {
                        console.log("[Libra Debug]", label);
                    }
                    catch { }
                    this.startAxisLogged = true;
                }
            }
            else {
                features.startAxis = "none";
            }
        }
        else {
            features.startAxis = "none";
        }
        // Handle Mousedown Buffering
        if (event instanceof MouseEvent && event.type === "mousedown" && this.startAxisEnabled && !event.libraStartEvent) {
            this.pendingStartEvent = event;
            if (this.startEventTimer)
                clearTimeout(this.startEventTimer);
            this.startEventTimer = setTimeout(() => {
                this.flushPendingStart("none");
            }, this.startWindowMs);
            features.buffered = true;
            event.libraFeatures = features;
            return features;
        }
        // Handle Mouseup Buffering
        if (event instanceof MouseEvent && event.type === "mouseup" && this.pendingStartEvent) {
            this.flushPendingStart("none");
        }
        // Compute move elapsed based on continuous movement beyond threshold
        if (this.moveEnabled && event instanceof MouseEvent && event.type === "mousemove") {
            const lastX = this.lastMoveX;
            const lastY = this.lastMoveY;
            if (lastX === null || lastY === null) {
                this.lastMoveX = clientX;
                this.lastMoveY = clientY;
                this.movingSince = null;
                features.moveElapsed = 0;
            }
            else {
                const dx = clientX - lastX;
                const dy = clientY - lastY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > this.moveThreshold) {
                    if (this.movingSince === null)
                        this.movingSince = now;
                    this.lastMoveX = clientX;
                    this.lastMoveY = clientY;
                }
                else {
                    this.movingSince = null;
                    // Reset reference to current position to avoid large jumps if we resume moving from a new spot?
                    // Actually, if we stopped, we are at clientX, clientY.
                    this.lastMoveX = clientX;
                    this.lastMoveY = clientY;
                }
                features.moveElapsed = this.movingSince === null ? 0 : now - this.movingSince;
            }
        }
        else {
            features.moveElapsed = 0;
        }
        // Calculate dwell logic
        if (!this.dwellStart) {
            this.dwellStart = { x: clientX, y: clientY, t: now };
        }
        else {
            const dist = Math.sqrt(Math.pow(clientX - this.dwellStart.x, 2) + Math.pow(clientY - this.dwellStart.y, 2));
            if (dist > this.dwellThreshold) {
                // Moved too much: reset dwell
                this.dwellStart = { x: clientX, y: clientY, t: now };
                features.dwellTime = 0;
                // Clear pending stay timer if moved
                if (this.stayTimer) {
                    clearTimeout(this.stayTimer);
                    this.stayTimer = null;
                }
            }
            else {
                features.dwellTime = now - this.dwellStart.t;
            }
        }
        // Attach to event object
        event.libraFeatures = features;
        // Manage Stay Timer
        // Only set timer if not already a stay event and we are starting/continuing a dwell
        if (this.stayEnabled && !isStayEvent && event instanceof MouseEvent && event.type === "mousemove") {
            if (this.stayTimer)
                clearTimeout(this.stayTimer);
            // If we haven't dwelled enough yet, set a timer to dispatch the stay event
            // We target 1000ms as the threshold
            const timeElapsed = features.dwellTime;
            const timeRemaining = Math.max(0, 1000 - timeElapsed);
            // Create snapshot immediately
            this.lastEventSnapshot = {
                type: event.type,
                target: event.target,
                bubbles: event.bubbles,
                cancelable: event.cancelable,
                view: event.view,
                detail: event.detail,
                screenX: event.screenX,
                screenY: event.screenY,
                clientX: event.clientX,
                clientY: event.clientY,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                button: event.button,
                buttons: event.buttons,
                relatedTarget: event.relatedTarget
            };
            this.stayTimer = setTimeout(() => {
                this.dispatchStayEvent();
            }, timeRemaining);
        }
        return features;
    }
    flushPendingStart(forcedAxis) {
        if (!this.pendingStartEvent)
            return;
        if (this.startEventTimer) {
            clearTimeout(this.startEventTimer);
            this.startEventTimer = null;
        }
        const event = this.pendingStartEvent;
        this.pendingStartEvent = null;
        const features = {
            dwellTime: 0,
            mainDirection: "none",
            displacementX: 0,
            displacementY: 0,
            history: [],
            startAxis: forcedAxis || "none",
            moveElapsed: 0,
            buffered: false
        };
        const newEvent = new MouseEvent(event.type, {
            bubbles: event.bubbles,
            cancelable: event.cancelable,
            view: event.view,
            detail: event.detail,
            screenX: event.screenX,
            screenY: event.screenY,
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            button: event.button,
            buttons: event.buttons,
            relatedTarget: event.relatedTarget
        });
        newEvent.libraFeatures = features;
        newEvent.libraStartEvent = true;
        if (event.target) {
            event.target.dispatchEvent(newEvent);
        }
    }
    dispatchStayEvent() {
        if (!this.lastEventSnapshot || !this.lastEventSnapshot.target)
            return;
        const snapshot = this.lastEventSnapshot;
        // Check if target is still connected to DOM (optional robustness check)
        if (snapshot.target instanceof Node && !snapshot.target.isConnected) {
            return;
        }
        // console.log("[Libra Debug] Dispatching synthetic stay event from snapshot", snapshot);
        // Create a new event based on the snapshot
        const stayEvent = new MouseEvent(snapshot.type, {
            bubbles: snapshot.bubbles,
            cancelable: snapshot.cancelable,
            view: snapshot.view,
            detail: snapshot.detail,
            screenX: snapshot.screenX,
            screenY: snapshot.screenY,
            clientX: snapshot.clientX,
            clientY: snapshot.clientY,
            ctrlKey: snapshot.ctrlKey,
            altKey: snapshot.altKey,
            shiftKey: snapshot.shiftKey,
            metaKey: snapshot.metaKey,
            button: snapshot.button,
            buttons: snapshot.buttons,
            relatedTarget: snapshot.relatedTarget
        });
        // Mark as stay event
        stayEvent.libraStayEvent = true;
        // Dispatch
        snapshot.target.dispatchEvent(stayEvent);
    }
}
export const eventAnalyzer = new EventAnalyzer();
