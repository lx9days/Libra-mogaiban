
export type EventFeatures = {
  dwellTime: number; // ms
  mainDirection: "x" | "y" | "none";
  displacementX: number; // past 200ms
  displacementY: number; // past 200ms
  history: TrajectoryPoint[];
};

type TrajectoryPoint = {
  x: number;
  y: number;
  t: number;
};

type EventSnapshot = {
  type: string;
  target: EventTarget | null;
  bubbles: boolean;
  cancelable: boolean;
  view: Window | null;
  detail: number;
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  button: number;
  buttons: number;
  relatedTarget: EventTarget | null;
};

export class EventAnalyzer {
  private trajectory: TrajectoryPoint[] = [];
  private dwellStart: TrajectoryPoint | null = null;
  private dwellThreshold: number = 5; // px
  private historyWindow: number = 200; // ms
  private stayTimer: any = null;
  private lastEventSnapshot: EventSnapshot | null = null;

  public analyze(event: Event): EventFeatures {
    if ((event as any).libraFeatures) return (event as any).libraFeatures;

    // Detect if this is a re-dispatched stay event
    const isStayEvent = (event as any).libraStayEvent;
    
    const now = Date.now();
    const features: EventFeatures = {
      dwellTime: 0,
      mainDirection: "none",
      displacementX: 0,
      displacementY: 0,
      history: []
    };

    let clientX: number, clientY: number;
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else if ((event as any).changedTouches && (event as any).changedTouches.length > 0) {
      clientX = (event as any).changedTouches[0].clientX;
      clientY = (event as any).changedTouches[0].clientY;
    } else {
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
      
      if (dx > dy && dx > 2) features.mainDirection = "x";
      else if (dy > dx && dy > 2) features.mainDirection = "y";
    }

    // Calculate dwell logic
    if (!this.dwellStart) {
      this.dwellStart = { x: clientX, y: clientY, t: now };
    } else {
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
      } else {
        features.dwellTime = now - this.dwellStart.t;
      }
    }

    // Attach to event object
    (event as any).libraFeatures = features;
    
    // Manage Stay Timer
    // Only set timer if not already a stay event and we are starting/continuing a dwell
    if (!isStayEvent && event instanceof MouseEvent && event.type === "mousemove") {
      if (this.stayTimer) clearTimeout(this.stayTimer);
      
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

  private dispatchStayEvent() {
    if (!this.lastEventSnapshot || !this.lastEventSnapshot.target) return;
    
    const snapshot = this.lastEventSnapshot;
    
    // Check if target is still connected to DOM (optional robustness check)
    if (snapshot.target instanceof Node && !snapshot.target.isConnected) {
      return;
    }

    console.log("[Libra Debug] Dispatching synthetic stay event from snapshot", snapshot);

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
    (stayEvent as any).libraStayEvent = true;
    
    // Dispatch
    snapshot.target.dispatchEvent(stayEvent);
  }
}

export const eventAnalyzer = new EventAnalyzer();
