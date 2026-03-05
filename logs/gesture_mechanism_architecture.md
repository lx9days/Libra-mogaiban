# Libra Gesture System Architecture & Mechanism

## 1. Overview
In the Libra system, **Gestures** serve as a high-level event filtering and validation layer that sits between raw DOM events and the `Instrument` execution logic. Unlike simple event listeners (e.g., `mousedown`), gestures allow instruments to express complex intent requirements (e.g., "only trigger if the user drags horizontally").

Gestures are configured via the `sharedVar` of an Instrument and are validated centrally during the event dispatch phase.

## 2. Core Components

### 2.1 EventAnalyzer (`src/instrument/eventAnalyzer.ts`)
The `EventAnalyzer` is a singleton service responsible for extracting higher-level features from raw DOM events. It maintains state across event frames to calculate temporal and spatial properties.

**Key Features Extracted:**
- **`dwellTime`**: How long the pointer has stayed within a small radius.
- **`moveElapsed`**: Duration of continuous movement.
- **`startAxis`**: The dominant direction ("x" or "y") of the initial drag vector.
- **`buffered`**: A flag indicating if the event is currently being withheld (see Section 4).

### 2.2 Instrument Dispatcher (`src/instrument/instrument.ts`)
The `Instrument._dispatch` method is the central entry point for all events targeting a layer. It performs the following steps:
1.  **Feature Extraction**: Calls `eventAnalyzer.analyze(e)`.
2.  **Buffering Check**: If `features.buffered` is true, the event is immediately stopped (`stopPropagation`) and not dispatched to *any* instrument.
3.  **Instrument Filtering**: Iterates through all registered instruments and checks their `gesture` requirement against the extracted features.
4.  **Execution**: If the gesture validates, the event is passed to the Instrument's `Interactor`.

## 3. Supported Gestures

### 3.1 `stay` (Hover/Dwell)
- **Intent**: Trigger when the user hovers over an element for a set duration (default 1000ms).
- **Mechanism**:
    - `EventAnalyzer` tracks `dwellStart` time.
    - If the pointer moves less than `dwellThreshold` (5px), `dwellTime` increases.
    - Once `dwellTime` > 1000ms, a synthetic event is dispatched (or the current event is marked valid).

### 3.2 `move` (Continuous Drag)
- **Intent**: Trigger only after the user has been moving the mouse for a certain duration (avoid jitter).
- **Mechanism**:
    - `EventAnalyzer` tracks `movingSince`.
    - `Instrument` checks if `moveElapsed` > `gestureMoveDelay` (default 200ms).

### 3.3 `start-horizontally` / `start-vertically` (Directional Drag)
- **Intent**: Disambiguate dragging direction at the very moment of initiation. Useful for Matrix visualizations where dragging a row (horizontal) and dragging a column (vertical) are distinct operations on the same cell.
- **Mechanism**: Uses the **Delayed Dispatch Strategy** (detailed below).

## 4. Deep Dive: Delayed Dispatch for Start-Axis Gestures

A critical challenge with directional gestures is that at the exact moment of `mousedown`, the direction is unknown (displacement is 0). If we dispatch `mousedown` immediately, an Instrument might wake up and claim the interaction before the user's intent (direction) is clear.

To solve this, we implemented a **Buffering & Re-dispatch** mechanism.

### 4.1 The Process

1.  **Buffering Phase (`mousedown`)**:
    - When a `mousedown` occurs, if `startAxis` detection is enabled, `EventAnalyzer` marks the event as **buffered**.
    - It saves the event in `pendingStartEvent`.
    - **Result**: The event is stopped at the dispatcher level. No Instrument receives it. The UI appears to "wait".

2.  **Analysis Phase (0ms - 200ms)**:
    - As the user moves the mouse, `EventAnalyzer` calculates the vector from the `mousedown` point.
    - **Fast Path**: If movement > 5px and one axis is clearly dominant (> 2x the other), the direction is determined immediately.
    - **Timeout**: If 200ms passes without clear movement, it defaults to "none" (or the best guess).

3.  **Flush & Re-dispatch**:
    - Once the axis is determined (e.g., "x"), `EventAnalyzer` clones the original `mousedown` event.
    - It attaches the determined feature: `startAxis: "x"`.
    - It dispatches this *new* event to the target.

4.  **Instrument Activation**:
    - Instruments with `gesture: "start-horizontally"` see `startAxis: "x"` -> **Activate**.
    - Instruments with `gesture: "start-vertically"` see `startAxis: "x"` -> **Ignore**.

### 4.2 Configuration
- **`startWindowMs`**: The maximum wait time. Currently set to **200ms**.
- **`gesture`**: Set in the Instrument DSL (e.g., `gesture: "start-horizontally"`).

## 5. Implementation Reference

**`EventAnalyzer.analyze` (Buffering Logic):**
```typescript
// src/instrument/eventAnalyzer.ts

if (event instanceof MouseEvent && event.type === "mousedown" && this.startAxisEnabled && !(event as any).libraStartEvent) {
  this.pendingStartEvent = event;
  this.startEventTimer = setTimeout(() => {
    this.flushPendingStart("none");
  }, this.startWindowMs); // 200ms

  features.buffered = true; // Signals dispatcher to stop
  return features;
}
```

**`Instrument._dispatch` (Filtering Logic):**
```typescript
// src/instrument/instrument.ts

const features = eventAnalyzer.analyze(e);
if (features.buffered) {
  e.preventDefault();
  e.stopPropagation();
  return; // Stop everything
}

// ... inside instrument loop ...
} else if (gesture === "start-horizontally") {
    if (features.startAxis !== "x") continue;
}
```
