import * as d3 from "d3";
import Libra from "libra-vis";

// global constants
const START_YEAR = 1980;
const MARGIN = { top: 2.5, right: 168, bottom: 39.5, left: 36 };
const WIDTH = 800;
const HEIGHT = 600;

// global variables
let data = [];
let year = START_YEAR;
let interpolatedData = [];

// shared scales
let x = null;
let y = null;
let color = null;

async function loadData() {
  //Read the data
  data = await d3.json("/public/data/gapminder.json");
  interpolatedData = data.filter(
    (x) => x.year === year
  );
}

function renderStaticVisualization() {
  const container = document.getElementById("LibraPlayground");
  if (container) {
    container.innerHTML = "";
  }
  
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
    .append("g")
    .attr(
      "transform",
      "translate(" + MARGIN.left + "," + MARGIN.top + ")"
    );

  // Add X axis
  x = d3
    .scaleLinear()
    .domain(
      d3.extent(data, function (d) {
        return d.fertility;
      })
    )
    .range([0, WIDTH])
    .nice();
  svg
    .append("g")
    .attr("transform", "translate(0," + HEIGHT + ")")
    .call(d3.axisBottom(x).ticks(5))
    .call((g) => {
      g.selectAll("g.tick")
        .append("line")
        .attr("y1", 0)
        .attr("y2", -HEIGHT)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.1);
    })
    .call((g) =>
      g
        .append("text")
        .text("Fertility")
        .attr("font-family", "sans-serif")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .attr("transform", `translate(${WIDTH / 2}, 30)`)
    );

  // Add Y axis
  y = d3
    .scaleLinear()
    .domain(
      d3.extent(data, function (d) {
        return d.life_expect;
      })
    )
    .range([HEIGHT, 0])
    .nice();
  svg
    .append("g")
    .call(d3.axisLeft(y).ticks(5))
    .call((g) => {
      g.selectAll("g.tick")
        .append("line")
        .attr("x1", 0)
        .attr("x2", WIDTH)
        .attr("stroke", "currentColor")
        .attr("stroke-opacity", 0.1);
    })
    .call((g) =>
      g
        .append("text")
        .text("Life Expectancy")
        .attr("font-family", "sans-serif")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .attr("fill", "currentColor")
        .attr("text-anchor", "middle")
        .attr(
          "transform",
          `translate(-25, ${HEIGHT / 2}) rotate(-90)`
        )
    );

  // Color palette
  const clusterDomain = [0, 1, 2, 3, 4, 5];
  color = d3
    .scaleOrdinal()
    .domain(clusterDomain)
    .range(['#4c78a8', '#72b7b2', '#eeca3b', '#f58518', '#e45756', '#54a24b']);
  const colorName = d3
    .scaleOrdinal()
    .domain(clusterDomain)
    .range([
      "South Asia",
      "Europe & Central Asia",
      "Sub-saharan Africa",
      "America",
      "East Asia & Pacific",
      "Middle East & North Africa",
    ]);

  // Draw the year
  svg
    .append("g")
    .attr("class", "year")
    .append("text")
    .attr("x", 300)
    .attr("y", 300)
    .attr("font-family", "sans-serif")
    .attr("font-size", 100)
    .attr("fill", "grey")
    .attr("opacity", 0.25)
    .attr("text-align", "center")
    .text(year);

  // Draw the legend
  svg
    .append("g")
    .attr("class", "legend")
    .attr(
      "transform",
      `translate(${WIDTH + 10}, ${MARGIN.top + 10})`
    )
    .call((g) => {
      g.append("text")
        .attr("x", -5)
        .attr("y", 0)
        .attr("font-family", "sans-serif")
        .attr("font-size", 11)
        .attr("font-weight", "bold")
        .attr("alignment-baseline", "middle")
        .text("Region");
    })
    .selectAll("g")
    .data([0, 3, 4, 1, 5, 2])
    .enter()
    .append("g")
    .attr("transform", (d, i) => `translate(0, ${i * 13 + 16})`)
    .call((g) => {
      g.append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 5)
        .attr("fill", (d, i) => color(d))
        .attr("fill-opacity", 0.5);
    })
    .call((g) => {
      g.append("text")
        .attr("x", 10)
        .attr("y", 0)
        .attr("font-family", "sans-serif")
        .attr("font-size", 10)
        .attr("alignment-baseline", "middle")
        .text((d, i) => colorName(d));
    });
}

function interpolateNNPointFromPoly(point, polyline) {
  // Find the squared distance between two points
  function distanceSquared(p1, p2) {
    let dx = p1[0] - p2[0];
    let dy = p1[1] - p2[1];
    return dx * dx + dy * dy;
  }

  // Find the closest point on a polyline from a given point
  let minDistance = Number.MAX_VALUE;
  let interpolationFactor = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    let lineStart = polyline[i];
    let lineEnd = polyline[i + 1];
    let lineLengthSquared = distanceSquared(lineStart, lineEnd);
    let u =
      ((point[0] - lineStart[0]) * (lineEnd[0] - lineStart[0]) +
        (point[1] - lineStart[1]) * (lineEnd[1] - lineStart[1])) /
      lineLengthSquared;
    let closest = null;
    if (u < 0) {
      closest = lineStart;
    } else if (u > 1) {
      closest = lineEnd;
    } else {
      closest = [
        lineStart[0] + u * (lineEnd[0] - lineStart[0]),
        lineStart[1] + u * (lineEnd[1] - lineStart[1]),
      ];
    }
    let distance = distanceSquared(point, closest);
    if (distance < minDistance) {
      minDistance = distance;
      if (u < 0) {
        interpolationFactor = i;
      } else if (u > 1) {
        interpolationFactor = i + 1;
      } else {
        interpolationFactor = i + u;
      }
    }
  }
  return interpolationFactor;
}

function renderMainVisualization(
  currentInterpolatedData = interpolatedData
) {
  // append the svg object to the body of the page
  const svg = d3.select("#LibraPlayground svg");

  let g = svg.select(".mark");
  let returnVal = null;
  if (g.empty()) {
    // create layer if not exists
    const mainLayer = Libra.Layer.initialize("D3Layer", {
      name: "mainLayer",
      width: WIDTH,
      height: HEIGHT,
      offset: { x: MARGIN.left, y: MARGIN.top },
      container: svg.node(),
    });
    g = d3.select(mainLayer.getGraphic());
    g.attr("class", "mark");

    returnVal = mainLayer;
  }

  // Draw the scatters
  g.selectAll("circle")
    .data(currentInterpolatedData)
    .join("circle")
    .attr("fill", (d) => color(d.cluster))
    .attr("cx", (d) => x(d.fertility))
    .attr("cy", (d) => y(d.life_expect))
    .attr("fill-opacity", 0.5)
    .attr("r", 6);

  // Update the year
  svg.select(".year text").text(currentInterpolatedData[0].year);

  return returnVal;
}

async function mountInteraction(layer) {
  // Register TraceTransformer
  Libra.GraphicalTransformer.register("TraceTransformer", {
    redraw: function ({ layer }) {
      const data = this.getSharedVar("result");
      if (data) {
        // Draw the trace
        const transientLayer = layer.getLayerFromQueue("transientLayer");
        d3.select(transientLayer.getGraphic()).selectAll("*").remove();
        d3.select(transientLayer.getGraphic())
          .append("g")
          .attr("class", "trace")
          .call((g) => {
            g.append("path")
              .attr(
                "d",
                d3.line(
                  (d) => x(d.fertility),
                  (d) => y(d.life_expect)
                )(data)
              )
              .attr("fill", "none")
              .attr("stroke", "#bbb")
              .attr("stroke-width", 3)
              .attr("stroke-opacity", 0.5);
          })
          .call((g) => {
            g.selectAll("text")
              .data(data)
              .enter()
              .append("text")
              .attr("fill", "#555")
              .attr("fill-opacity", 0.6)
              .attr("font-size", 12)
              .attr("x", (d) => x(d.fertility))
              .attr("y", (d) => y(d.life_expect))
              .text((d) => d.year);
          });
      }
    },
  });

  Libra.GraphicalTransformer.register("MainTransformer", {
    redraw({ transformer }) {
      const result = transformer.getSharedVar("result");
      if (result) {
        interpolatedData = result;
        renderMainVisualization(result);
      }
    },
  });

  const useTraceTransformerFlow = {
    find: "SelectionService",
    flow: [
      {
        comp: "FilterService",
        sharedVar: {
          data: data,
          fields: ["country"],
        },
      },
      {
        comp: "TraceTransformer",
      },
    ],
  };

  const useCountryFlow = {
    find: "SelectionService",
    flow: [
      {
        comp: "TextTransformer",
        layer: layer.getLayerFromQueue("countryLayer"),
        sharedVar: {
          field: "country",
          position: (d) =>
            interpolatedData
              .filter((dd) => dd.country == d.country)
              .map((d) => ({
                x: x(d.fertility),
                y: y(d.life_expect),
              }))[0],
        },
      },
    ],
  };

  Libra.Interaction.build({
    inherit: "HoverInstrument",
    layers: [layer],
    remove: [{ find: "SelectionTransformer" }],
    insert: [useTraceTransformerFlow, useCountryFlow],
  }).on(
    "click",
    Libra.Command.initialize("RecordInterpolatedYear", {
      async execute() {},
    })
  );

  Libra.Interaction.build({
    inherit: "DragInstrument",
    layers: [layer],
    remove: [{ find: "SelectionTransformer" }],
    insert: [
      useTraceTransformerFlow,
      useCountryFlow,
      {
        find: "SelectionService",
        flow: [
          {
            comp: "NearestPointService",
            sharedVar: { layer: layer.getLayerFromQueue("transientLayer") },
            evaluate(options) {
              const { layer, offsetx, offsety } = options;
              const point = [offsetx, offsety];
              if (layer && offsetx && offsety) {
                const year = d3
                  .select(layer.getGraphic())
                  .select(".trace")
                  .selectAll("text")
                  .data();
                const trace = d3
                  .select(layer.getGraphic())
                  .select("path")
                  .attr("d");
                const poly = trace
                  .slice(1)
                  .split("L")
                  .map((pStr) => pStr.split(",").map((num) => parseFloat(num)));
                return {
                  data: year,
                  interpolatedNum: interpolateNNPointFromPoly(
                    [point[0] - layer._offset.x, point[1] - layer._offset.y],
                    poly
                  ),
                };
              }
              return null;
            },
          },
          {
            comp: "InterpolationService",
            sharedVar: {
              data: data,
              field: "year",
              formula: {
                year: (d) => Math.floor(d.year / 5) * 5, // Year divisible by 5
              },
            },
          },
          {
            comp: "MainTransformer",
          },
        ],
      },
    ],
  });
  if (Libra.createHistoryTrack) {
    await Libra.createHistoryTrack();
  }
}

export default async function init() {
  await loadData();
  renderStaticVisualization();
  const mainLayer = await renderMainVisualization();
  await mountInteraction(mainLayer);
}


