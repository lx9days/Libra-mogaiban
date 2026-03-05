var _a;
import { Interactor } from "../interactor";
import * as helpers from "../helpers";
import { Command } from "../command";
import { Layer } from "../layer";
import { Service, findService } from "../service";
import { GraphicalTransformer } from "../transformer";
import { eventAnalyzer } from "./eventAnalyzer";
export const registeredInstruments = {};
export const instanceInstruments = [];
const EventDispatcher = new Map();
const EventQueue = [];
let eventHandling = false;
export default class Instrument {
    constructor(baseName, options) {
        this._transformers = [];
        this._linkCache = {};
        this[_a] = true;
        options.preInitialize && options.preInitialize.call(this, this);
        this._preInitialize = options.preInitialize ?? null;
        this._postInitialize = options.postInitialize ?? null;
        this._preAttach = options.preAttach ?? null;
        this._postUse = options.postUse ?? null;
        this._baseName = baseName;
        this._userOptions = options;
        this._name = options.name ?? baseName;
        // this._on = helpers.deepClone(options.on ?? {});
        this._on = Object.assign({}, options.on ?? {});
        this._interactors = [];
        this._layers = [];
        this._layerInteractors = new Map();
        this._services = options.services ?? [];
        this._serviceInstances = [];
        this._sharedVar = options.sharedVar ?? {};
        this._priority = options.priority ?? 0;
        this._stopPropagation = options.stopPropagation ?? false;
        this._transformers = options.transformers ?? [];
        if (options.interactors) {
            options.interactors.forEach((interactor) => {
                if (typeof interactor === "string") {
                    this.useInteractor(Interactor.initialize(interactor));
                }
                else if ("options" in interactor) {
                    if (typeof interactor.interactor === "string") {
                        this.useInteractor(Interactor.initialize(interactor.interactor, interactor.options));
                    }
                    else {
                        this.useInteractor(interactor.interactor, interactor.options);
                    }
                }
                else {
                    this.useInteractor(interactor);
                }
            });
        }
        this._services.forEach((service) => {
            if (typeof service === "string" || !("options" in service)) {
                this.useService(service);
            }
            else {
                this.useService(service.service, service.options);
            }
        });
        if (options.layers) {
            options.layers.forEach((layer) => {
                if ("options" in layer) {
                    this.attach(layer.layer, layer.options);
                }
                else {
                    this.attach(layer);
                }
            });
        }
        options.postInitialize && options.postInitialize.call(this, this);
    }
    emit(action, options) {
        if (this._on[action]) {
            this._on[action].forEach((feedforwardOrCommand) => {
                if (feedforwardOrCommand instanceof Command) {
                    feedforwardOrCommand.execute(Object.assign({
                        self: this,
                        layer: null,
                        instrument: this,
                        interactor: null,
                    }, options || {}));
                }
                else {
                    feedforwardOrCommand(Object.assign({
                        self: this,
                        layer: null,
                        instrument: this,
                        interactor: null,
                    }, options || {}));
                }
            });
        }
        if (action.includes("confirm")) {
            this._serviceInstances.forEach((service) => {
                service.invokeCommand();
            });
        }
    }
    on(action, feedforwardOrCommand) {
        if (action instanceof Array) {
            action.forEach((action) => {
                if (!this._on[action]) {
                    this._on[action] = [];
                }
                this._on[action].push(feedforwardOrCommand);
            });
        }
        else {
            if (!this._on[action]) {
                this._on[action] = [];
            }
            this._on[action].push(feedforwardOrCommand);
        }
        return this;
    }
    off(action, feedforwardOrCommand) {
        if (!this._on[action])
            return;
        if (this._on[action].includes(feedforwardOrCommand)) {
            this._on[action].splice(this._on[action].indexOf(feedforwardOrCommand), 1);
        }
        return this;
    }
    _use(service, options) {
        service.preAttach(this);
        this._serviceInstances.push(service);
        service.postUse(this);
    }
    useService(service, options) {
        if (typeof service !== "string" &&
            this._serviceInstances.includes(service)) {
            return;
        }
        if (arguments.length >= 2) {
            this._services.push({ service, options });
        }
        else {
            this._services.push(service);
        }
        if (typeof service === "string") {
            const services = findService(service);
            services.forEach((service) => this._use(service, options));
        }
        else {
            this._use(service, options);
        }
    }
    useInteractor(interactor, options) {
        interactor.preUse(this);
        // TODO: inject options
        if (arguments.length >= 2) {
            this._interactors.push({ interactor, options });
        }
        else {
            this._interactors.push(interactor);
        }
        this._layers.forEach((layer) => {
            let layr;
            if (layer instanceof Layer) {
                layr = layer;
            }
            else {
                layr = layer.layer;
            }
            if (!this._layerInteractors.has(layr)) {
                this._layerInteractors.set(layr, []);
            }
            const copyInteractor = Interactor.initialize(interactor._baseName, interactor._userOptions);
            this._layerInteractors.get(layr).push(copyInteractor);
            copyInteractor.setActions(copyInteractor.getActions().map((action) => ({
                ...action,
                sideEffect: async (options) => {
                    action.sideEffect && action.sideEffect(options);
                    if (this._on[action.action]) {
                        for (let command of this._on[action.action]) {
                            try {
                                if (command instanceof Command) {
                                    await command.execute({
                                        ...options,
                                        self: this,
                                        instrument: this,
                                    });
                                }
                                else {
                                    await command({
                                        ...options,
                                        self: this,
                                        instrument: this,
                                    });
                                }
                            }
                            catch (e) {
                                console.error(e);
                            }
                        }
                    }
                },
            })));
            copyInteractor.getAcceptEvents().forEach((event) => {
                if (!EventDispatcher.has(layr.getContainerGraphic())) {
                    EventDispatcher.set(layr.getContainerGraphic(), new Map());
                }
                if (!EventDispatcher.get(layr.getContainerGraphic()).has(event)) {
                    layr
                        .getContainerGraphic()
                        .addEventListener(event, this._dispatch.bind(this, layr, event));
                    EventDispatcher.get(layr.getContainerGraphic()).set(event, []);
                }
                EventDispatcher.get(layr.getContainerGraphic())
                    .get(event)
                    .push([
                    copyInteractor,
                    layr,
                    layer instanceof Layer ? null : layer.options,
                    this,
                ]);
            });
        });
        interactor.postUse(this);
    }
    attach(layer, options) {
        if (this._layers.find((l) => l instanceof Layer ? l === layer : l.layer === layer))
            return; // Reject for duplicated attach
        this.preAttach(layer, options ?? null);
        if (arguments.length >= 2) {
            this._layers.push({ layer, options });
        }
        else {
            this._layers.push(layer);
        }
        this.postUse(layer);
    }
    getSharedVar(sharedName, options) {
        if (!(sharedName in this._sharedVar) &&
            options &&
            "defaultValue" in options) {
            this.setSharedVar(sharedName, options.defaultValue, options);
        }
        return this._sharedVar[sharedName];
    }
    setSharedVar(sharedName, value, options) {
        this._sharedVar[sharedName] = value;
        if (this._on[`update:${sharedName}`]) {
            const feedforwardOrCommands = this._on[`update:${sharedName}`];
            feedforwardOrCommands.forEach((feedforwardOrCommand) => {
                if (feedforwardOrCommand instanceof Command) {
                    feedforwardOrCommand.execute({
                        self: this,
                        layer: null,
                        instrument: this,
                        interactor: null,
                    });
                }
                else {
                    feedforwardOrCommand({
                        self: this,
                        layer: null,
                        instrument: this,
                        interactor: null,
                    });
                }
            });
        }
        // const linkProps =
        //   this.getSharedVar("linkProps") || Object.keys(this._sharedVar);
        // if (this._sharedVar.linking) {
        //   for (let prop of linkProps) {
        //     if (this._linkCache[prop] === this._sharedVar[prop]) continue;
        //     this._sharedVar.linking.setSharedVar(prop, this._sharedVar[prop]);
        //   }
        // }
    }
    watchSharedVar(sharedName, handler) {
        this.on(`update:${sharedName}`, handler);
    }
    preAttach(layer, options) {
        this._preAttach && this._preAttach.call(this, this, layer);
        this._interactors.forEach((interactor) => {
            let inter;
            if (interactor instanceof Interactor) {
                inter = interactor;
            }
            else {
                inter = interactor.interactor;
            }
            if (!this._layerInteractors.has(layer)) {
                this._layerInteractors.set(layer, []);
            }
            const copyInteractor = Interactor.initialize(inter._baseName, inter._userOptions);
            this._layerInteractors.get(layer).push(copyInteractor);
            copyInteractor.setActions(copyInteractor.getActions().map((action) => ({
                ...action,
                sideEffect: async (options) => {
                    action.sideEffect && action.sideEffect(options);
                    if (this._on[action.action]) {
                        for (let command of this._on[action.action]) {
                            try {
                                if (command instanceof Command) {
                                    await command.execute({
                                        ...options,
                                        self: this,
                                        instrument: this,
                                    });
                                }
                                else {
                                    await command({
                                        ...options,
                                        self: this,
                                        instrument: this,
                                    });
                                }
                            }
                            catch (e) {
                                console.error(e);
                            }
                        }
                    }
                },
            })));
            copyInteractor.getAcceptEvents().forEach((event) => {
                if (!EventDispatcher.has(layer.getContainerGraphic())) {
                    EventDispatcher.set(layer.getContainerGraphic(), new Map());
                }
                if (!EventDispatcher.get(layer.getContainerGraphic()).has(event)) {
                    layer
                        .getContainerGraphic()
                        .addEventListener(event, this._dispatch.bind(this, layer, event));
                    EventDispatcher.get(layer.getContainerGraphic()).set(event, []);
                }
                EventDispatcher.get(layer.getContainerGraphic())
                    .get(event)
                    .push([copyInteractor, layer, options, this]);
            });
        });
    }
    async _dispatch(layer, event, e) {
        try {
            const anyStayGesture = instanceInstruments.some((inst) => {
                const g = inst.getSharedVar("gesture");
                return typeof g === "string" && g.toLowerCase() === "stay";
            });
            const anyMoveGesture = instanceInstruments.some((inst) => {
                const g = inst.getSharedVar("gesture");
                return typeof g === "string" && g.toLowerCase() === "move";
            });
            const anyStartAxisGesture = instanceInstruments.some((inst) => {
                const g = inst.getSharedVar("gesture");
                const gv = typeof g === "string" ? g.toLowerCase() : "";
                return gv === "start-horizontally" || gv === "start-vertically";
            });
            eventAnalyzer.setEnabledGestures({
                stay: anyStayGesture,
                move: anyMoveGesture,
                startAxis: anyStartAxisGesture,
            });
        }
        catch { }
        const features = eventAnalyzer.analyze(e);
        if (features.buffered) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }
        if (layer._baseName !== "Layer") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        // Feedforward Mechanism
        if (event === "mousemove" && e instanceof MouseEvent) {
            const activeInsts = new Map();
            const candidateInsts = new Map();
            // Use global instance list to ensure we check all possibilities 
            // regardless of which layer triggered the event
            for (const inst of instanceInstruments) {
                // Check Active
                // We need to check ALL interactors, including those cloned for layers (_layerInteractors)
                // and the original ones (_interactors), to find any that are active (state !== "start").
                // Usually, active interactors are the cloned ones in _layerInteractors.
                let isActive = false;
                // Check original interactors (though usually these are templates)
                inst._interactors.forEach(i => {
                    const inter = i instanceof Interactor ? i : i.interactor;
                    if (inter._state !== "start")
                        isActive = true;
                });
                // Check layer-specific interactors (these are the ones actually running)
                if (!isActive) {
                    inst._layerInteractors.forEach((interactors) => {
                        if (interactors.some(inter => inter._state !== "start")) {
                            isActive = true;
                        }
                    });
                }
                if (isActive) {
                    let name = inst._name || inst._baseName;
                    const desc = inst.getSharedVar("description");
                    let html = `<span>${name}</span>`;
                    if (desc) {
                        html += ` <span style="color: #ffab91;">(${desc})</span>`;
                    }
                    activeInsts.set(inst, html);
                }
                // Check Candidate
                // We need to check if this instrument matches the current event context
                // Since we are iterating all instruments, we must check if they are attached to a layer 
                // that is relevant to the current pointer position.
                inst._layerInteractors.forEach((interactors, layr) => {
                    // Find the interactor corresponding to this instrument logic
                    // In _layerInteractors, we have copies. We need to check if any of them are in start state.
                    const hasStartInteractor = interactors.some(inter => inter._state === "start");
                    if (hasStartInteractor) {
                        // We need to find the options for this layer attachment to check pointerEvents
                        // The structure of _layers is (Layer | {layer, options})[]
                        let layerOption = null;
                        const layerEntry = inst._layers.find(l => (l instanceof Layer ? l === layr : l.layer === layr));
                        if (layerEntry && !(layerEntry instanceof Layer)) {
                            layerOption = layerEntry.options;
                        }
                        let isHit = false;
                        const layerName = layr._name?.toLowerCase().replaceAll("-", "").replaceAll("_", "");
                        const isBg = layerName === "backgroundlayer" || layerName === "bglayer";
                        const pointerEvents = layerOption?.pointerEvents;
                        if (isBg || pointerEvents === "all") {
                            isHit = true;
                        }
                        else if (pointerEvents === "visiblePainted") {
                            // Explicitly visiblePainted
                            try {
                                // Check bounds first (optimization)
                                const maybeD3Layer = layr;
                                let inBounds = true;
                                if (maybeD3Layer._offset &&
                                    maybeD3Layer._width &&
                                    maybeD3Layer._height) {
                                    if (e.offsetX < maybeD3Layer._offset.x ||
                                        e.offsetX > maybeD3Layer._offset.x + maybeD3Layer._width ||
                                        e.offsetY < maybeD3Layer._offset.y ||
                                        e.offsetY > maybeD3Layer._offset.y + maybeD3Layer._height) {
                                        inBounds = false;
                                    }
                                }
                                if (inBounds) {
                                    const query = layr.picking({
                                        baseOn: helpers.QueryType.Shape,
                                        type: helpers.ShapeQueryType.Point,
                                        x: e.clientX,
                                        y: e.clientY,
                                    });
                                    isHit = query.length > 0;
                                }
                            }
                            catch (err) {
                                // Ignore picking errors
                            }
                        }
                        else {
                            // Default: viewport (matches _dispatch logic when layerOption is undefined)
                            // Check bounds only
                            const maybeD3Layer = layr;
                            if (maybeD3Layer._offset &&
                                maybeD3Layer._width &&
                                maybeD3Layer._height) {
                                if (e.offsetX >= maybeD3Layer._offset.x &&
                                    e.offsetX <= maybeD3Layer._offset.x + maybeD3Layer._width &&
                                    e.offsetY >= maybeD3Layer._offset.y &&
                                    e.offsetY <= maybeD3Layer._offset.y + maybeD3Layer._height) {
                                    isHit = true;
                                }
                            }
                            else {
                                isHit = true;
                            }
                        }
                        if (isHit) {
                            let name = inst._name || inst._baseName;
                            const mod = inst.getSharedVar("modifierKey");
                            const desc = inst.getSharedVar("description");
                            let html = `<span>${name}</span>`;
                            if (mod)
                                html += ` <span style="color: #ce93d8;">[${mod}]</span>`;
                            if (desc)
                                html += ` <span style="color: #ffab91;">(${desc})</span>`;
                            candidateInsts.set(inst, html);
                        }
                    }
                });
            }
            // Update Feedforward HUD
            let hud = document.getElementById("libra-feedforward-hud");
            // We create it initially in body, but we might move it later
            if (!hud) {
                hud = document.createElement("div");
                hud.id = "libra-feedforward-hud";
                Object.assign(hud.style, {
                    position: "absolute",
                    backgroundColor: "rgba(33, 33, 33, 0.9)",
                    color: "#e0e0e0",
                    padding: "12px 16px",
                    borderRadius: "6px",
                    fontFamily: "'Segoe UI', Consolas, monospace",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    zIndex: "99999",
                    pointerEvents: "none",
                    whiteSpace: "pre-wrap",
                    maxWidth: "320px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    transition: "opacity 0.2s"
                });
                document.body.appendChild(hud);
            }
            const sortInstruments = (map) => {
                return Array.from(map.entries())
                    .sort((a, b) => {
                    const pA = a[0]._priority || 0;
                    const pB = b[0]._priority || 0;
                    if (pA !== pB)
                        return pB - pA; // Descending priority
                    // Tie-breaker: Alphabetical by name
                    const nameA = a[0]._name || a[0]._baseName || "";
                    const nameB = b[0]._name || b[0]._baseName || "";
                    return nameA.localeCompare(nameB);
                })
                    .map(entry => `<div style="margin-left: 8px;">${entry[1]}</div>`)
                    .join("");
            };
            const activeStr = sortInstruments(activeInsts) || "<div style='margin-left: 8px;'>None</div>";
            const candidateStr = sortInstruments(candidateInsts) || "<div style='margin-left: 8px;'>None</div>";
            hud.innerHTML = `
         <div style="margin-bottom: 4px; color: #81c784;"><strong>Active:</strong></div>
         ${activeStr}
         <div style="margin-top: 8px; margin-bottom: 4px; color: #64b5f6;"><strong>Candidates:</strong></div>
         ${candidateStr}
         <div style="margin-top: 8px; color: #9e9e9e; font-size: 11px;">Pos: (${e.clientX}, ${e.clientY})</div>
       `;
            // Position HUD relative to the layer container (Top-Right, Outside)
            try {
                const container = layer.getContainerGraphic();
                if (container && container.parentNode) {
                    // Ensure HUD is a sibling of the container
                    if (hud.parentNode !== container.parentNode) {
                        container.parentNode.appendChild(hud);
                        // Make sure parent is positioned so absolute positioning works
                        const parentStyle = window.getComputedStyle(container.parentNode);
                        if (parentStyle.position === 'static') {
                            container.parentNode.style.position = 'relative';
                        }
                    }
                    hud.style.top = "10px";
                    hud.style.right = "10px";
                    hud.style.left = "auto";
                    hud.style.bottom = "auto";
                }
                else {
                    // Fallback if no container parent found (e.g. root svg in body)
                    if (hud.parentNode !== document.body) {
                        document.body.appendChild(hud);
                    }
                    hud.style.position = "fixed";
                    hud.style.top = "20px";
                    hud.style.right = "20px";
                }
            }
            catch (err) {
                // Fallback
                if (hud.parentNode !== document.body) {
                    document.body.appendChild(hud);
                }
                hud.style.position = "fixed";
                hud.style.top = "20px";
                hud.style.right = "20px";
            }
        }
        if (eventHandling) {
            let existingEventIndex = EventQueue.findIndex((e) => e.instrument === this && e.layer === layer && e.eventType === event);
            if (existingEventIndex >= 0) {
                EventQueue.splice(existingEventIndex, 1);
            }
            EventQueue.push({ instrument: this, layer, eventType: event, event: e });
            return;
        }
        eventHandling = true;
        const layers = EventDispatcher.get(layer.getContainerGraphic())
            .get(event)
            .filter(([_, layr]) => layr._order >= 0);
        if (!layers)
            return;
        // Sort by priority (descending) then by layer order (descending)
        layers.sort((a, b) => {
            const priorityA = a[3]._priority;
            const priorityB = b[3]._priority;
            if (priorityA !== priorityB) {
                return priorityB - priorityA;
            }
            return b[1]._order - a[1]._order;
        });
        let handled = false;
        for (let [inter, layr, layerOption, instrument] of layers) {
            let pickingResult = [];
            if (e instanceof MouseEvent) {
                if (layr._name?.toLowerCase().replaceAll("-", "").replaceAll("_", "") ===
                    "backgroundlayer" ||
                    layr._name?.toLowerCase().replaceAll("-", "").replaceAll("_", "") ===
                        "bglayer" ||
                    (layerOption && layerOption.pointerEvents === "all")) {
                    // Default is `all` for BGLayer
                }
                else if (!layerOption || layerOption.pointerEvents === "viewport") {
                    // Default is `viewport` for layers
                    pickingResult = [];
                    try {
                        const rect = layr.getGraphic().getBoundingClientRect?.();
                        if (rect) {
                            const cx = e.clientX;
                            const cy = e.clientY;
                            if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) {
                                continue;
                            }
                        }
                    }
                    catch { }
                    pickingResult = layr.picking({
                        baseOn: helpers.QueryType.Shape,
                        type: helpers.ShapeQueryType.Point,
                        x: e.clientX,
                        y: e.clientY,
                    });
                }
                else {
                    // Others is `visiblePainted`
                    const query = layr.picking({
                        baseOn: helpers.QueryType.Shape,
                        type: helpers.ShapeQueryType.Point,
                        x: e.clientX,
                        y: e.clientY,
                    });
                    if (query.length <= 0 && inter._state === "start")
                        continue;
                    pickingResult = query;
                    const maybeD3Layer = layr;
                    if (maybeD3Layer._offset &&
                        maybeD3Layer._width &&
                        maybeD3Layer._height) {
                        if (e.offsetX < maybeD3Layer._offset.x ||
                            e.offsetX > maybeD3Layer._offset.x + maybeD3Layer._width ||
                            e.offsetY < maybeD3Layer._offset.y ||
                            e.offsetY > maybeD3Layer._offset.y + maybeD3Layer._height) {
                            continue;
                        }
                    }
                }
            }
            const modifierKey = instrument.getSharedVar("modifierKey");
            if (e instanceof MouseEvent && !helpers.checkModifier(e, modifierKey)) {
                continue;
            }
            const gesture = instrument.getSharedVar("gesture");
            const gestureMoveDelay = instrument.getSharedVar("gestureMoveDelay") || 200;
            const isStayEvent = e.libraStayEvent;
            const features = e.libraFeatures;
            if (gesture === "stay") {
                // If it's a stay event, we allow it (features.dwellTime should be sufficient, but the flag is the key)
                if (!isStayEvent && (!features || features.dwellTime < 1000)) {
                    continue;
                }
            }
            else if (isStayEvent) {
                // Normal instruments should ignore the synthetic stay event to avoid double triggering
                continue;
            }
            else if (gesture === "move") {
                const elapsed = features && Number.isFinite(features.moveElapsed) ? features.moveElapsed : 0;
                if (elapsed < gestureMoveDelay) {
                    continue;
                }
            }
            else if (gesture === "start-horizontally") {
                const axis = features && features.startAxis ? features.startAxis : "none";
                if (axis !== "x") {
                    continue;
                }
            }
            else if (gesture === "start-vertically") {
                const axis = features && features.startAxis ? features.startAxis : "none";
                if (axis !== "y") {
                    continue;
                }
            }
            try {
                let flag = await inter.dispatch(e, layr, pickingResult);
                if (flag) {
                    if (helpers.globalConfig.debug) {
                        // console.log(`[Libra Debug] Instrument responded: ${instrument._name || instrument._baseName} (Priority: ${instrument._priority})(event: ${e})`);
                    }
                    // Check explicit stopPropagation
                    if (instrument._stopPropagation) {
                        if (helpers.globalConfig.debug) {
                            // console.warn(`[Libra Debug] Propagation stopped by high-priority instrument: ${instrument._name || instrument._baseName} (Priority: ${instrument._priority})(event: ${e})`);
                        }
                        handled = true;
                        break;
                    }
                    // Check visual occlusion (visiblePainted)
                    if (e instanceof MouseEvent &&
                        layerOption &&
                        layerOption.pointerEvents === "visiblePainted") {
                        handled = true;
                        break;
                    }
                }
            }
            catch (e) {
                console.error(e);
                break;
            }
        }
        // if (!handled && e instanceof MouseEvent) {
        //   // default fallback of BGLayer
        //   helpers.global.stopTransient = true;
        // } else {
        //   helpers.global.stopTransient = false;
        // }
        eventHandling = false;
        if (EventQueue.length) {
            const eventDescription = EventQueue.shift();
            eventDescription.instrument._dispatch(eventDescription.layer, eventDescription.eventType, eventDescription.event);
        }
    }
    postUse(layer) {
        const graphic = layer.getGraphic();
        graphic && graphic.style && (graphic.style.pointerEvents = "auto");
        this._postUse && this._postUse.call(this, this, layer);
    }
    isInstanceOf(name) {
        return this._baseName === name || this._name === name;
    }
    get services() {
        return helpers.makeFindableList(this._serviceInstances.slice(0), Service, this.useService.bind(this), () => {
            throw new Error("Do not support dynamic change service yet");
        }, this);
    }
    get transformers() {
        return helpers.makeFindableList(this._transformers.slice(0), GraphicalTransformer, (e) => this._transformers.push(e), (e) => this._transformers.splice(this._transformers.indexOf(e), 1), this);
    }
    static register(baseName, options) {
        registeredInstruments[baseName] = options;
    }
    static unregister(baseName) {
        delete registeredInstruments[baseName];
        return true;
    }
    static initialize(baseName, options) {
        const mergedOptions = Object.assign({ constructor: Instrument }, registeredInstruments[baseName] ?? {}, options ?? {}, {
            on: helpers.deepClone(Object.assign({}, (registeredInstruments[baseName] ?? {}).on ?? {}, options?.on ?? {})),
            sharedVar: Object.assign({}, (registeredInstruments[baseName] ?? {}).sharedVar ?? {}, options?.sharedVar ?? {}),
        });
        const instrument = new mergedOptions.constructor(baseName, mergedOptions);
        instanceInstruments.push(instrument);
        return instrument;
    }
    static findInstrument(baseNameOrRealName) {
        return instanceInstruments.filter((instrument) => instrument.isInstanceOf(baseNameOrRealName));
    }
}
_a = helpers.LibraSymbol;
export const register = Instrument.register;
export const unregister = Instrument.unregister;
export const initialize = Instrument.initialize;
export const findInstrument = Instrument.findInstrument;
