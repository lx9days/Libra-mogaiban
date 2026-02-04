import * as d3 from "d3";
import Libra from "libra-vis";
import LibraManager from "../../core/LibraManager";
import excentricLabeling from "excentric-labeling";

// Module-scoped constants
const MARGIN = { top: 30, right: 70, bottom: 40, left: 60 };
const WIDTH = 500 - MARGIN.left - MARGIN.right;
const HEIGHT = 380 - MARGIN.top - MARGIN.bottom;
const FIELD_X = "Horsepower";
const FIELD_Y = "Miles_per_Gallon";
const FIELD_COLOR = "Origin";

// Module-scoped variables
let data = [];
let x = null;
let y = null;
let color = null;

async function loadData() {
    // Ensure the path is correct. Assuming 'public' folder is served at '/public' or root.
    // Based on webpack config, it is likely copied to '/public'.
    try {
        data = (await d3.json("/public/data/cars.json")).filter(
            (d) => !!(d["Horsepower"] && d["Miles_per_Gallon"])
        );
    } catch (e) {
        console.error("Failed to load data from /public/data/cars.json. Trying /data/cars.json...", e);
        try {
            data = (await d3.json("/data/cars.json")).filter(
                (d) => !!(d["Horsepower"] && d["Miles_per_Gallon"])
            );
        } catch (e2) {
            console.error("Failed to load data.", e2);
        }
    }
}

function renderStaticVisualization() {
    // append the svg object to the body of the page
    const svg = d3
        .select("#LibraPlayground")
        .append("svg")
        .attr(
            "width",
            WIDTH + MARGIN.left + MARGIN.right
        )
        .attr(
            "height",
            HEIGHT + MARGIN.top + MARGIN.bottom
        )
        .attr("viewbox", `0 0 ${WIDTH} ${HEIGHT}`)
        .append("g")
        .attr(
            "transform",
            "translate(" + MARGIN.left + "," + MARGIN.top + ")"
        );

    const extentX = [0, d3.max(data, (d) => d[FIELD_X])];
    const extentY = [0, d3.max(data, (d) => d[FIELD_Y])];

    // Add X axis
    x = d3
        .scaleLinear()
        .domain(extentX)
        .range([0, WIDTH])
        .nice()
        .clamp(true);
    svg
        .append("g")
        .attr("transform", "translate(0," + HEIGHT + ")")
        .call(d3.axisBottom(x))
        .append("text")
        .text(FIELD_X)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("x", WIDTH / 2)
        .attr("y", 30);

    // Add Y axis
    y = d3
        .scaleLinear()
        .domain(extentY)
        .nice()
        .range([HEIGHT, 0])
        .clamp(true);
    svg
        .append("g")
        .call(d3.axisLeft(y))
        .append("text")
        .text(FIELD_Y)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("writing-mode", "tb")
        .style(
            "transform",
            `translate(${-MARGIN.left / 2}px,${HEIGHT / 2
            }px) rotate(180deg)`
        );

    // Add Legend
    color = d3
        .scaleOrdinal()
        .domain(
            new Set(data.map((d) => d[FIELD_COLOR])).values()
        )
        .range(d3.schemeTableau10);
    svg
        .append("g")
        .call((g) =>
            g
                .append("text")
                .text(FIELD_COLOR)
                .attr("fill", "black")
                .attr("text-anchor", "middle")
                .attr("font-size", "12px")
                .attr("font-weight", "bold")
                .attr("x", WIDTH + MARGIN.right / 2)
                .attr("y", -MARGIN.top / 2)
        )
        .call((g) =>
            g
                .append("g")
                .selectAll("g")
                .data(
                    new Set(
                        data.map((d) => d[FIELD_COLOR])
                    ).values()
                )
                .join("g")
                .call((g) => {
                    g.append("circle")
                        .attr("fill-opacity", "0")
                        .attr("stroke-width", 2)
                        .attr("stroke", (d) => color(d))
                        .attr("cx", WIDTH + 10)
                        .attr("cy", (_, i) => i * 20)
                        .attr("r", 5);
                })
                .call((g) => {
                    g.append("text")
                        .text((d) => d)
                        .attr("font-size", "12px")
                        .attr("x", WIDTH + 20)
                        .attr("y", (_, i) => i * 20 + 5);
                })
        );
}

function renderMainVisualization() {
    // Find the SVG element on page
    const svg = d3.select("#LibraPlayground svg");

    // Create the main layer
    const mainLayer = Libra.Layer.initialize("D3Layer", {
        name: "mainLayer",
        width: WIDTH,
        height: HEIGHT,
        offset: { x: MARGIN.left, y: MARGIN.top },
        container: svg.node(),
    });
    const g = d3.select(mainLayer.getGraphic());

    // Draw points code from the input static visualization
    g.selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "mark")
        .attr("fill", "none")
        .attr("stroke-width", 1)
        .attr("stroke", (d) => color(d[FIELD_COLOR]))
        .attr("cx", (d) => x(d[FIELD_X]))
        .attr("cy", (d) => y(d[FIELD_Y]))
        .attr("r", 5);

    return mainLayer;
}

async function mountInteraction(layer) {
    // Define Instrument
    Libra.Interaction.build({
        inherit: "HoverInstrument",
        name: "ExcentricLabelingInstrument",
        sharedVar: {
            renderSelection: false,
            r: 20,
            stroke: "green",
            strokeWidth: 2,
            countLabelDistance: 20,
            fontSize: 12,
            countLabelWidth: 40,
            maxLabelsNum: 10,
            labelAccessor: (circleElem) => d3.select(circleElem).datum()["Name"],
            colorAccessor: (circleElem) =>
                color(d3.select(circleElem).datum()[FIELD_COLOR]),
            modifierKey: "Shift",
        },
        override: [
            {
                find: "SelectionService",
                comp: "CircleSelectionService",
            },
        ],
        insert: [
            {
                find: "CircleSelectionService",
                flow: [
                    {
                        comp: "ExcentricLabelingLayoutService",
                        resultAlias: "result",
                        evaluate({
                            labelAccessor,
                            colorAccessor,
                            r,
                            maxLabelsNum,
                            event,
                            layer,
                            result: circles,
                        }) {
                            if (!event) return [];

                            const [layerX, layerY] = d3.pointer(event, layer.getGraphic());
                            const rootBBox = layer
                                .getContainerGraphic()
                                .getBoundingClientRect();
                            const layerBBox = layer.getGraphic().transform.baseVal.consolidate()
                                ?.matrix ?? { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };

                            function getRawInfos(objs, labelAccessor, colorAccessor) {
                                const rawInfos = objs.map((obj) => {
                                    const bbox = obj.__libra__screenElement.getBoundingClientRect();
                                    const x = bbox.x + (bbox.width >> 1) - rootBBox.x - layerBBox.e;
                                    const y =
                                        bbox.y + (bbox.height >> 1) - rootBBox.y - layerBBox.f;
                                    const labelName = labelAccessor(obj);
                                    const color = colorAccessor(obj);
                                    return {
                                        x,
                                        y,
                                        labelWidth: 0,
                                        labelHeight: 0,
                                        color,
                                        labelName,
                                    };
                                });
                                return rawInfos;
                            }

                            function computeSizeOfLabels(rawInfos, root) {
                                const tempInfoAttr = "labelText";
                                const tempClass = "temp" + String(new Date().getMilliseconds());
                                const tempMountPoint = root
                                    .append("svg:g")
                                    .attr("class", tempClass);
                                rawInfos.forEach(
                                    (rawInfo) =>
                                    (rawInfo[tempInfoAttr] = tempMountPoint
                                        .append("text")
                                        .attr("opacity", "0")
                                        .attr("x", -Number.MAX_SAFE_INTEGER)
                                        .attr("y", -Number.MAX_SAFE_INTEGER)
                                        .text(rawInfo.labelName)
                                        .node())
                                );
                                root.node().appendChild(tempMountPoint.node());
                                rawInfos.forEach((rawInfo) => {
                                    const labelBBox = rawInfo[tempInfoAttr].getBBox();
                                    rawInfo.labelWidth = labelBBox.width;
                                    rawInfo.labelHeight = 21;
                                });
                                root.select("." + tempClass).remove();
                                rawInfos.forEach((rawInfo) => delete rawInfo[tempInfoAttr]);
                            }

                            const rawInfos = getRawInfos(circles, labelAccessor, colorAccessor);
                            computeSizeOfLabels(rawInfos, d3.select(layer.getGraphic()));

                            const compute = excentricLabeling()
                                .radius(r)
                                .horizontallyCoherent(true)
                                .maxLabelsNum(maxLabelsNum);
                            const result = compute(rawInfos, layerX, layerY);
                            return result;
                        },
                    },
                    (layer) => ({
                        comp: "DrawLabelTransformer",
                        layer: layer.getLayerFromQueue("LabelLayer"),
                        sharedVar: {
                            result: [],
                        },
                        redraw({ layer, transformer }) {
                            function renderLines(root, result) {
                                const lineGroup = root
                                    .append("g")
                                    .attr("class", "exentric-labeling-line");
                                const lineGenerator = d3
                                    .line()
                                    .x((d) => d.x)
                                    .y((d) => d.y);
                                lineGroup
                                    .selectAll("path")
                                    .data(result)
                                    .join("path")
                                    .attr("fill", "none")
                                    .attr("stroke", (layoutInfo) => layoutInfo.rawInfo.color)
                                    .attr("d", (layoutInfo) =>
                                        lineGenerator(layoutInfo.controlPoints)
                                    );
                            }

                            function renderBBoxs(root, result) {
                                const bboxGroup = root
                                    .append("g")
                                    .attr("class", "exentric-labeling-bbox");
                                bboxGroup
                                    .selectAll("rect")
                                    .data(result)
                                    .join("rect")
                                    .attr("class", "labelBBox")
                                    .attr("fill", "none")
                                    .attr("stroke", (layoutInfo) => layoutInfo.rawInfo.color)
                                    .attr("x", (layoutInfo) => layoutInfo.labelBBox.x)
                                    .attr("y", (layoutInfo) => layoutInfo.labelBBox.y)
                                    .attr("width", (layoutInfo) => layoutInfo.labelBBox.width)
                                    .attr("height", (layoutInfo) => layoutInfo.labelBBox.height);
                            }

                            function renderTexts(root, result) {
                                const textGroup = root.append("g").attr("class", "exentric-labeling-text");
                                textGroup.selectAll("text")
                                    .data(result)
                                    .join("text")
                                    .attr("x", d => d.labelBBox.x + d.labelBBox.width / 2)
                                    .attr("y", d => d.labelBBox.y + d.labelBBox.height / 2 + 4) // +4 for vertical alignment
                                    .attr("text-anchor", "middle")
                                    .text(d => d.rawInfo.labelName)
                                    .attr("fill", "black")
                                    .attr("font-size", "12px");
                            }

                            // layer.setLayersOrder({ selectionLayer: 1 });

                            const result = transformer.getSharedVar("result");
                            console.log("[DrawLabelTransformer] redraw called, result length:", result ? result.length : "null");
                            const root = d3.select(layer.getGraphic());
                            console.log("[DrawLabelTransformer] Drawing on layer:", layer.constructor.name, "Graphic class:", layer.getGraphic().getAttribute("class"));
                            
                            root.selectAll("*").remove();
                            if (result && result.length > 0) {
                                renderLines(root, result);
                                renderBBoxs(root, result);
                                renderTexts(root, result);
                            }
                            layer.postUpdate();
                        },
                    }),
                ],
            },
            {
                find: "CircleSelectionService",
                flow: [
                    {
                        comp: "AggregateService",
                        resultAlias: "count",
                        sharedVar: {
                            ops: ["count"],
                        },
                    },
                    (layer) => ({
                        comp: "DrawTextTransformer",
                        layer: layer.getLayerFromQueue("LensLayer"),
                        sharedVar: {
                            x: 0,
                            y: 0,
                            count: 0,
                        },
                        redraw({ layer, transformer }) {
                            const cx =
                                transformer.getSharedVar("x") -
                                layer
                                    .getLayerFromQueue("mainLayer")
                                    .getGraphic()
                                    .getBoundingClientRect().left;
                            const cy =
                                transformer.getSharedVar("y") -
                                layer
                                    .getLayerFromQueue("mainLayer")
                                    .getGraphic()
                                    .getBoundingClientRect().top;
                            const opacity = 1;
                            const lensRadius = transformer.getSharedVar("r");
                            const stroke = transformer.getSharedVar("stroke");
                            const strokeWidth = transformer.getSharedVar("strokeWidth");
                            const count = transformer.getSharedVar("count");
                            const countLabelDistance =
                                transformer.getSharedVar("countLabelDistance");
                            const fontSize = transformer.getSharedVar("fontSize");
                            const countLabelWidth = transformer.getSharedVar("countLabelWidth");

                            const root = d3.select(layer.getGraphic());
                            root.selectAll("*").remove();

                            const group = root
                                .append("g")
                                .attr("opacity", opacity)
                                .attr("transform", `translate(${cx}, ${cy})`);

                            group
                                .append("circle")
                                .attr("class", "lensCircle")
                                .attr("cx", 0)
                                .attr("r", lensRadius)
                                .attr("fill", "none")
                                .attr("stroke", stroke)
                                .attr("stroke-width", strokeWidth);
                            const countLabel = group
                                .append("text")
                                .attr("y", -(countLabelDistance + lensRadius))
                                .attr("font-size", fontSize)
                                .attr("text-anchor", "middle")
                                .attr("fill", stroke)
                                .text(count);
                            const countLabelBBox = countLabel.node().getBBox();
                            group
                                .append("rect")
                                .attr("class", "lensLabelBorder")
                                .attr("stroke", stroke)
                                .attr("stroke-width", strokeWidth)
                                .attr("fill", "none")
                                .attr("x", -countLabelWidth >> 1)
                                .attr("y", countLabelBBox.y)
                                .attr("width", countLabelWidth)
                                .attr("height", countLabelBBox.height);
                            group
                                .append("line")
                                .attr("stroke", stroke)
                                .attr("stroke-width", strokeWidth)
                                .attr("y1", -lensRadius)
                                .attr("y2", countLabelBBox.y + countLabelBBox.height);
                        },
                    }),
                ],
            },
        ],
    });

    Libra.Interaction.build({
        inherit: "ExcentricLabelingInstrument",
        layers: [layer],
        sharedVar: {
            labelAccessor: (circleElem) => d3.select(circleElem).datum()["Name"],
            colorAccessor: (circleElem) =>
                color(d3.select(circleElem).datum()[FIELD_COLOR]),
        },
    });
let lables = layer.getLayerFromQueue("LabelLayer");
console.log(lables);

      Libra.Interaction.build({
    inherit: "HoverInstrument",
    layers: [{ layer: lables, options: { pointerEvents: "viewPort" } }],
    sharedVar: {
      highlightAttrValues: {
      stroke: "#ff0000",    // 只改描边颜色
      "stroke-width": 2,    // 可选：顺便改线宽
    },
    },
  });
    // Check if createHistoryTrack exists in Libra
    if (typeof Libra.createHistoryTrack === 'function') {
        await Libra.createHistoryTrack();
    }
}

export default async function init() {
    await loadData();
    renderStaticVisualization();
    const mainLayer = renderMainVisualization();
    await mountInteraction(mainLayer);
}
