import Service from "./service";
export default class LayoutService extends Service {
    constructor(baseName, options) {
        super(baseName, {
            ...options,
            resultAlias: options.resultAlias ?? "result",
        });
    }
    isInstanceOf(name) {
        return ("LayoutService" === name || this._baseName === name || this._name === name);
    }
}
Service.LayoutService = LayoutService;
Service.register("LayoutService", {
    constructor: LayoutService,
});
Service.register("ScaleService", {
    constructor: LayoutService,
    evaluate({ offsetx, width, offsety, height, scaleX, scaleY, scaleX_Overview, scaleY_Overview, layer, self }) {
        // if (width && height)
        // debugger
        let layerInstance = layer;
        if (!layerInstance &&
            self._layerInstances &&
            self._layerInstances.length == 1) {
            layerInstance = self._layerInstances[0];
        }
        // if (scaleX && scaleX.invert && !scaleY) {
        //     if (width <= 0 || isNaN(width))
        //         return scaleX;
        //     const scaleXCopy = scaleX.copy();
        //     const startX = scaleX_Overview.invert(offsetx - (layerInstance?._offset?.x ?? 0));
        //     const endX = scaleX_Overview.invert(offsetx + width - (layerInstance?._offset?.x ?? 0));
        //     scaleXCopy.domain([startX, endX]);
        //     scaleXCopy.clamp(true);
        //     return scaleXCopy;
        // }
        // if (!scaleX && scaleY && scaleY.invert) {
        //     if (height <= 0 || isNaN(height))
        //         return scaleY;
            // const scaleYCopy = scaleY.copy();
            // const startY = scaleY_Overview.invert(offsety - (layerInstance?._offset?.y ?? 0));
            // const endY = scaleY_Overview.invert(offsety + height - (layerInstance?._offset?.y ?? 0));
            // if (scaleY.domain()[0] < scaleY.domain()[1]) {
            //     scaleYCopy.domain([endY, startY]);
            // } else {
            //     scaleYCopy.domain([startY, endY]);
            // }
            // scaleYCopy.clamp(true);
            // return {scaleY: scaleYCopy};
        // }
        if (scaleX && scaleY && scaleX.invert && scaleY.invert) {


            if ((width <= 0 || isNaN(width)) && (height <= 0 || isNaN(height)))
                return { scaleX, scaleY };
            else if (height <= 0 || isNaN(height)) {
                const scaleXCopy = scaleX.copy();
                const startX = scaleX_Overview.invert(offsetx - (layerInstance?._offset?.x ?? 0));
                const endX = scaleX_Overview.invert(offsetx + width - (layerInstance?._offset?.x ?? 0));
                scaleXCopy.domain([startX, endX]);
                scaleXCopy.clamp(true);
                return { scaleX: scaleXCopy };
            } else if (width <= 0 || isNaN(width)) {
                const scaleYCopy = scaleY.copy();
                const startY = scaleY_Overview.invert(offsety - (layerInstance?._offset?.y ?? 0));
                const endY = scaleY_Overview.invert(offsety + height - (layerInstance?._offset?.y ?? 0));
                if (scaleY.domain()[0] < scaleY.domain()[1]) {
                    scaleYCopy.domain([endY, startY]);
                } else {
                    scaleYCopy.domain([startY, endY]);
                }
                scaleYCopy.clamp(true);
                return { scaleY: scaleYCopy };
            } else {
                const scaleXCopy = scaleX.copy();
                const scaleYCopy = scaleY.copy();
                const startX = scaleX_Overview.invert(offsetx - (layerInstance?._offset?.x ?? 0));
                const endX = scaleX_Overview.invert(offsetx + width - (layerInstance?._offset?.x ?? 0));
                const startY = scaleY_Overview.invert(offsety - (layerInstance?._offset?.y ?? 0));
                const endY = scaleY_Overview.invert(offsety + height - (layerInstance?._offset?.y ?? 0));
                scaleXCopy.domain([startX, endX]);
                if (scaleY.domain()[0] < scaleY.domain()[1]) {
                    scaleYCopy.domain([endY, startY]);
                } else {
                    scaleYCopy.domain([startY, endY]);
                }
                scaleXCopy.clamp(true);
                scaleYCopy.clamp(true);
                console.log("ScaleService evaluate", offsetx, offsety, width, height);
                return { scaleX: scaleXCopy, scaleY: scaleYCopy };
            }

        }
        return { scaleX, scaleY };
    },
});
