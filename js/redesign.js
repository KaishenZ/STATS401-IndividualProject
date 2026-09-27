const REGIONS = [
  "China",
  "Asia (excl. China and India)",
  "United States",
  "India",
  "Europe (excl. EU-27)",
  "European Union (27)",
  "Africa",
  "North America (excl. USA)",
  "South America",
  "International shipping",
  "International aviation",
  "Oceania"
];

const SHORT = {
  "China": "China",
  "Asia (excl. China and India)": "Asia excl. China & India",
  "United States": "United States",
  "India": "India",
  "Europe (excl. EU-27)": "Europe excl. EU-27",
  "European Union (27)": "European Union",
  "Africa": "Africa",
  "North America (excl. USA)": "N. America excl. US",
  "South America": "South America",
  "International shipping": "Intl. shipping",
  "International aviation": "Intl. aviation",
  "Oceania": "Oceania"
};

const COLOR = {
  "China": "#c0392b",
  "Asia (excl. China and India)": "#0f766e",
  "United States": "#1e3a5f",
  "India": "#a16207",
  "Europe (excl. EU-27)": "#5b4b8a",
  "European Union (27)": "#d4692a",
  "Africa": "#2f6f4e",
  "North America (excl. USA)": "#32738f",
  "South America": "#7a5c3e",
  "International shipping": "#5c6b73",
  "International aviation": "#3f4c6b",
  "Oceania": "#5f7d32"
};

const state = {
  rangeStart: 1950,
  mode: "shared",
  year: 2024,
  hoverRegion: null,
  playing: false,
  playTimer: null
};

let model = null;
let lastWidth = -1;
let barScale = null;
const panelMeta = new Map();
let totalMeta = null;

const billions = (v) => v / 1e9;

function formatBillion(v) {
  const b = billions(v);
  return b >= 10 ? b.toFixed(1) : b.toFixed(2);
}

function signedPct(from, to) {
  const p = Math.round((to / from - 1) * 100);
  if (p > 0) return `+${p}%`;
  if (p < 0) return `−${Math.abs(p)}%`;
  return "0%";
}

function formatTonnesAxis(v) {
  const b = billions(v);
  if (Math.abs(b) < 0.005) return "0";
  if (b >= 10) return d3.format(".0f")(b);
  return d3.format(".2~f")(b);
}

function formatIndexAxis(v) {
  return d3.format("~g")(v);
}

function displayed(emissions, y1990) {
  if (state.mode === "index") return (100 * emissions) / y1990;
  return emissions;
}

function defaultLabel(region) {
  const latest = region.byYear.get(2024);
  if (state.mode === "index") {
    const idx = displayed(latest, region.y1990);
    return `${Math.round(idx)} in 2024 · 1990 = 100`;
  }
  return `${formatBillion(latest)} billion t in 2024 · ${signedPct(region.y1990, latest)} since 1990`;
}

function hoverLabel(emissions, y1990, year) {
  if (state.mode === "index") {
    return `${year} · ${Math.round(displayed(emissions, y1990))} (1990 = 100)`;
  }
  return `${year} · ${formatBillion(emissions)} billion t`;
}

function windowRows(region) {
  return region.rows.filter((d) => d.year >= state.rangeStart && d.year <= 2024);
}

function sharedY(regions, height) {
  let max = 0;
  regions.forEach((region) => {
    windowRows(region).forEach((d) => {
      max = Math.max(max, displayed(d.emissions, region.y1990));
    });
  });
  return d3.scaleLinear().domain([0, max * 1.06]).nice().range([height, 0]);
}

function setPressed(selector, attr, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset[attr] === String(value) ? "true" : "false");
  });
}

function updateCopy() {
  const china = model.byName.get("China");
  const us = model.byName.get("United States");
  const eu = model.byName.get("European Union (27)");
  const india = model.byName.get("India");
  const c = china.byYear.get(2024);
  const u = us.byYear.get(2024);
  const e = eu.byYear.get(2024);
  const i = india.byYear.get(2024);
  document.getElementById("insight").textContent =
    `In 2024 China emitted ${formatBillion(c)} billion tonnes, more than the United States (${formatBillion(u)}) and the European Union (${formatBillion(e)}) combined. Since 1990, China is ${signedPct(china.y1990, c)} and India is ${signedPct(india.y1990, i)}, while the EU-27 is ${signedPct(eu.y1990, e)}.`;

  const axis = document.getElementById("axis-note");
  const scale = document.getElementById("scale-note");
  const banner = document.getElementById("mode-banner");
  if (state.mode === "index") {
    axis.textContent = "Tick marks are an index with 1990 set to 100. The dashed line is the 1990 level. These small charts changed; the world-total line above stays in billion tonnes.";
    scale.textContent = "This view compares change, not tonnes. India climbs past 500 while the United States stays near 100. That index hides the U.S. peak in 2005, which Compare levels still shows.";
    banner.textContent = "Compare change since 1990: every small chart is rescaled so 1990 = 100. Look at India (about 550) against the European Union (about 60). The vertical numbers are an index, not billion tonnes.";
  } else if (state.mode === "own") {
    axis.textContent = "Each panel has its own vertical scale, in billion tonnes. An “own scale” tag is on every panel. Do not compare heights from one panel to another.";
    scale.textContent = "Own scales make a small series such as Oceania fill its frame. They will mislead a comparison of levels, which is why Compare levels is the default.";
    banner.textContent = "Inspect each shape: each small chart now has its own vertical scale. Oceania’s axis tops out near 0.5 billion tonnes, while China’s still reaches about 14. The world-total chart above does not change.";
  } else if (state.rangeStart === 1750) {
    axis.textContent = "Tick marks are billion tonnes of CO₂, on one shared scale starting at zero.";
    scale.textContent = "The top of the scale is set by the largest recent value, so the years before 1950 sit near zero. That compression is why 1950–2024 is the default.";
    banner.textContent = "Compare levels, 1750–2024: every small chart shares one scale in billion tonnes. The long axis squeezes the modern rise to the right.";
  } else {
    axis.textContent = "Tick marks are billion tonnes of CO₂. Every panel shares one vertical scale starting at zero, marked “shared scale.” Panels are ordered by 2024 emissions.";
    scale.textContent = "A shared zero baseline is what makes the EU decline and the U.S. peak readable. Use Play or the year slider to move through time. Switch to Inspect each shape when a small series looks flat.";
    banner.textContent = "Compare levels: the small charts share one vertical scale in billion tonnes. China fills the frame; Oceania is a line near zero. That difference is the comparison.";
  }
}

function clampYear(year) {
  return Math.max(state.rangeStart, Math.min(2024, Math.round(year)));
}

function rowsUntil(rows, year) {
  return rows.filter((d) => d.year <= year);
}

function stopPlay() {
  state.playing = false;
  if (state.playTimer) {
    clearInterval(state.playTimer);
    state.playTimer = null;
  }
  const button = document.getElementById("play-btn");
  if (button) {
    button.textContent = "Play";
    button.setAttribute("aria-pressed", "false");
  }
}

function syncYearControls() {
  const year = state.year;
  ["year-slider", "year-slider-bars"].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.min = String(state.rangeStart);
    input.max = "2024";
    input.value = String(year);
    input.setAttribute("aria-valuemin", String(state.rangeStart));
    input.setAttribute("aria-valuemax", "2024");
    input.setAttribute("aria-valuenow", String(year));
  });
  const readout = document.getElementById("year-readout");
  const barsReadout = document.getElementById("year-readout-bars");
  if (readout) readout.textContent = String(year);
  if (barsReadout) barsReadout.textContent = String(year);
}

function paintYear() {
  const year = state.year;
  const region = state.hoverRegion;
  const readout = document.getElementById("readout");
  const world = model.worldByYear.get(year);

  panelMeta.forEach((meta, entity) => {
    const hot = region && entity === region;
    const dim = region && entity !== region;
    meta.root.classList.toggle("is-hot", !!hot);
    meta.root.classList.toggle("is-dim", !!dim);
    const shown = rowsUntil(meta.rows, year);
    meta.path.attr("d", meta.line(shown));
    const emissions = meta.byYear.get(year);
    const x = meta.x(year);
    meta.rule.attr("x1", x).attr("x2", x).attr("opacity", 1);
    meta.yearTag.attr("x", x > meta.x.range()[1] - 28 ? x - 4 : x + 4)
      .attr("text-anchor", x > meta.x.range()[1] - 28 ? "end" : "start")
      .text(year);
    if (emissions == null) {
      meta.dot.attr("opacity", 0);
      meta.endDot.attr("opacity", 0);
      meta.value.textContent = `${year} · no data yet`;
      meta.value.classList.add("is-live");
      return;
    }
    const yVal = displayed(emissions, meta.y1990);
    meta.dot.attr("cx", x).attr("cy", meta.y(yVal)).attr("opacity", 1);
    meta.endDot.attr("cx", x).attr("cy", meta.y(yVal)).attr("opacity", 1);
    meta.value.textContent = hoverLabel(emissions, meta.y1990, year);
    meta.value.classList.add("is-live");
  });

  if (totalMeta) {
    const shown = rowsUntil(totalMeta.rows, year);
    totalMeta.areaPath.attr("d", shown.length ? totalMeta.area(shown) : "");
    totalMeta.linePath.attr("d", shown.length ? totalMeta.line(shown) : "");
    const x = totalMeta.x(year);
    totalMeta.rule.attr("x1", x).attr("x2", x).attr("opacity", 1);
    const nearEnd = x > totalMeta.x.range()[1] - 36;
    totalMeta.yearTag
      .attr("x", nearEnd ? x - 6 : x + 6)
      .attr("y", totalMeta.ih - 4)
      .attr("text-anchor", nearEnd ? "end" : "start")
      .text(String(year));
    if (world == null) {
      totalMeta.dot.attr("opacity", 0);
      totalMeta.endLabel.text("");
    } else {
      totalMeta.dot.attr("cx", x).attr("cy", totalMeta.y(world)).attr("opacity", 1);
      totalMeta.endLabel
        .attr("x", nearEnd ? x - 6 : x + 6)
        .attr("y", totalMeta.y(world) - 8)
        .attr("text-anchor", nearEnd ? "end" : "start")
        .text(formatBillion(world));
    }
  }

  updateBarMarks();
  d3.selectAll("#bars .bar-row")
    .classed("is-hot", (d) => region && d.entity === region)
    .classed("is-dim", (d) => region && d.entity !== region);

  readout.classList.add("is-active");
  if (region) {
    const emissions = model.byName.get(region).byYear.get(year);
    readout.textContent = emissions == null
      ? `${year} · ${SHORT[region]} · no data yet`
      : `${year} · ${SHORT[region]} · ${hoverLabel(emissions, model.byName.get(region).y1990, year).replace(`${year} · `, "")}`;
  } else if (world != null) {
    readout.textContent = `${year} · world total · ${formatBillion(world)} billion tonnes`;
  } else {
    readout.textContent = String(year);
  }
}

function setYear(year, region) {
  state.year = clampYear(year);
  if (region !== undefined) state.hoverRegion = region;
  syncYearControls();
  paintYear();
}

function updateBarMarks() {
  if (!barScale) return;
  const year = state.year;
  const world = model.worldByYear.get(year) || 1;
  const title = document.getElementById("bar-title");
  if (title) title.textContent = `Where the ${year} total comes from`;
  d3.selectAll("#bars .bar-row").each(function (d) {
    const v = d.byYear.get(year);
    const shown = v == null ? 0 : v;
    const width = Math.max(0, barScale(shown));
    d3.select(this).select("rect").attr("width", width);
    d3.select(this).select(".bar-value")
      .attr("x", width + 6)
      .text(v == null ? "no data" : `${formatBillion(v)} · ${((100 * v) / world).toFixed(1)}%`);
  });
}

function togglePlay() {
  if (state.playing) {
    stopPlay();
    return;
  }
  state.playing = true;
  const button = document.getElementById("play-btn");
  button.textContent = "Pause";
  button.setAttribute("aria-pressed", "true");
  if (state.year >= 2024) state.year = state.rangeStart;
  const step = (2024 - state.rangeStart) > 160 ? 2 : 1;
  state.playTimer = setInterval(() => {
    const next = state.year + step;
    if (next >= 2024) {
      setYear(2024, null);
      stopPlay();
      return;
    }
    setYear(next, null);
  }, 70);
}

function yearFromPointer(event, xScale) {
  return clampYear(xScale.invert(d3.pointer(event)[0]));
}

function scrub(event, xScale, region) {
  if (state.playing) return;
  setYear(yearFromPointer(event, xScale), region);
}

function drawTotal(width) {
  const host = d3.select("#total");
  host.selectAll("*").remove();
  const height = 210;
  const margin = { top: 12, right: 64, bottom: 28, left: 48 };
  const iw = width - margin.left - margin.right;
  const ih = height - margin.top - margin.bottom;
  const rows = model.world.filter((d) => d.year >= state.rangeStart && d.year <= 2024);
  const x = d3.scaleLinear().domain([state.rangeStart, 2024]).range([0, iw]);
  const y = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.emissions) * 1.08]).nice().range([ih, 0]);
  const svg = host.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("class", "y-axis")
    .call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickPadding(6).tickFormat(formatTonnesAxis))
    .call((axis) => axis.select(".domain").remove())
    .call((axis) => axis.selectAll("line").attr("stroke", "#eadfd2"))
    .call((axis) => axis.selectAll("text").attr("fill", "#5e564c").attr("font-size", 12));

  const ticks = state.rangeStart === 1750 ? [1750, 1850, 1950, 2024] : [1950, 1980, 2010, 2024];
  g.append("g")
    .attr("transform", `translate(0,${ih})`)
    .call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("d")).tickSize(0).tickPadding(8))
    .call((axis) => axis.select(".domain").attr("stroke", "#cfc4b6"))
    .call((axis) => axis.selectAll("text").attr("fill", "#5e564c").attr("font-size", 12));

  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.emissions));
  const area = d3.area().x((d) => x(d.year)).y0(ih).y1((d) => y(d.emissions));
  const areaPath = g.append("path").attr("fill", "#8f2d2d").attr("opacity", 0.12);
  const linePath = g.append("path").attr("fill", "none").attr("stroke", "#8f2d2d").attr("stroke-width", 2.5);
  const endLabel = g.append("text")
    .attr("fill", "#8f2d2d")
    .attr("font-size", 14)
    .attr("font-weight", 700);
  const yearTag = g.append("text")
    .attr("y", 14)
    .attr("fill", "#1c1714")
    .attr("font-size", 14)
    .attr("font-weight", 700);

  const rule = g.append("line")
    .attr("y1", 0)
    .attr("y2", ih)
    .attr("stroke", "#1c1714")
    .attr("stroke-width", 2)
    .attr("opacity", 0);
  const dot = g.append("circle").attr("r", 6).attr("fill", "#8f2d2d").attr("stroke", "white").attr("stroke-width", 2).attr("opacity", 0);
  g.append("rect")
    .attr("width", iw)
    .attr("height", ih)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("mousemove", (event) => scrub(event, x, null))
    .on("click", (event) => {
      stopPlay();
      setYear(yearFromPointer(event, x), null);
    });

  totalMeta = { x, y, ih, rows, area, line, areaPath, linePath, rule, dot, endLabel, yearTag };
}

function drawMultiples(width) {
  const host = d3.select("#multiples");
  host.selectAll("*").remove();
  host.attr("class", `mode-${state.mode}`);
  panelMeta.clear();
  const cols = width < 720 ? 1 : width < 1040 ? 2 : 3;
  const gap = 10;
  const panelW = Math.floor((width - gap * (cols - 1)) / cols);
  const svgH = 152;
  const margin = { top: 8, right: 22, bottom: 26, left: 36 };
  const svgW = panelW - 18;
  const iw = svgW - margin.left - margin.right;
  const ih = svgH - margin.top - margin.bottom;
  const yShared = state.mode === "own" ? null : sharedY(model.regions, ih);
  const xTicks = state.rangeStart === 1750 ? [1750, 1900, 2024] : [1950, 1990, 2024];
  const scaleLabel = state.mode === "index" ? "1990 = 100" : state.mode === "own" ? "Own scale" : "Shared scale";

  model.regions.forEach((region) => {
    const rows = windowRows(region);
    const x = d3.scaleLinear().domain([state.rangeStart, 2024]).range([0, iw]);
    let y = yShared;
    if (state.mode === "own") {
      const max = d3.max(rows, (d) => d.emissions) || 1;
      y = d3.scaleLinear().domain([0, max * 1.12]).nice().range([ih, 0]);
    }
    const root = host.append("div").attr("class", "panel").style("width", `${panelW}px`).node();
    root.title = region.entity;
    const head = d3.select(root).append("div").attr("class", "panel-head");
    head.append("h3").text(SHORT[region.entity]);
    const value = head.append("p").attr("class", "panel-now").text(defaultLabel(region)).node();
    head.append("p").attr("class", "scale-tag").text(scaleLabel);

    const svg = d3.select(root).append("svg").attr("width", svgW).attr("height", svgH);
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    g.append("g")
      .call(d3.axisLeft(y).ticks(3).tickSize(-iw).tickPadding(4).tickFormat(state.mode === "index" ? formatIndexAxis : formatTonnesAxis))
      .call((axis) => axis.select(".domain").remove())
      .call((axis) => axis.selectAll("line").attr("stroke", "#eadfd2"))
      .call((axis) => axis.selectAll("text").attr("fill", "#5e564c").attr("font-size", 11));

    const xAxis = g.append("g")
      .attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(d3.format("d")).tickSize(0).tickPadding(6));
    xAxis.select(".domain").attr("stroke", "#cfc4b6");
    const tickLabels = xAxis.selectAll(".tick text").nodes();
    tickLabels.forEach((node, i) => {
      const label = d3.select(node).attr("fill", "#5e564c").attr("font-size", 11);
      if (i === 0) label.attr("text-anchor", "start");
      else if (i === tickLabels.length - 1) label.attr("text-anchor", "end");
    });

    if (state.mode === "index") {
      g.append("line")
        .attr("x1", 0)
        .attr("x2", iw)
        .attr("y1", y(100))
        .attr("y2", y(100))
        .attr("stroke", "#8a8175")
        .attr("stroke-dasharray", "4 3");
    }

    const line = d3.line()
      .defined((d) => d.emissions != null)
      .x((d) => x(d.year))
      .y((d) => y(displayed(d.emissions, region.y1990)));
    const path = g.append("path")
      .attr("fill", "none")
      .attr("stroke", COLOR[region.entity])
      .attr("stroke-width", 2.5)
      .attr("stroke-linejoin", "round")
      .attr("stroke-linecap", "round");

    const endDot = g.append("circle")
      .attr("r", 3)
      .attr("fill", COLOR[region.entity]);
    const yearTag = g.append("text")
      .attr("y", 12)
      .attr("fill", "#1c1714")
      .attr("font-size", 11)
      .attr("font-weight", 700);
    const rule = g.append("line")
      .attr("y1", 0)
      .attr("y2", ih)
      .attr("stroke", "#1c1714")
      .attr("stroke-width", 1.75)
      .attr("opacity", 0);
    const dot = g.append("circle").attr("r", 6).attr("fill", COLOR[region.entity]).attr("stroke", "white").attr("stroke-width", 2).attr("opacity", 0);

    g.append("rect")
      .attr("width", iw)
      .attr("height", ih)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (event) => scrub(event, x, region.entity))
      .on("click", (event) => {
        stopPlay();
        setYear(yearFromPointer(event, x), region.entity);
      });

    panelMeta.set(region.entity, {
      root,
      value,
      rows,
      line,
      path,
      x,
      y,
      y1990: region.y1990,
      byYear: region.byYear,
      rule,
      dot,
      endDot,
      yearTag
    });
  });
}

function drawBars(width) {
  const host = d3.select("#bars");
  host.selectAll("*").remove();
  const narrow = width < 720;
  const margin = { top: 4, right: 16, bottom: 24, left: narrow ? 132 : 188 };
  const rowH = 28;
  const height = margin.top + margin.bottom + model.regions.length * rowH;
  const iw = width - margin.left - margin.right;
  const max = d3.max(model.regions, (region) => d3.max(windowRows(region), (d) => d.emissions));
  const x = d3.scaleLinear().domain([0, max * (narrow ? 1.62 : 1.38)]).range([0, iw]);
  barScale = x;
  const svg = host.append("svg").attr("width", width).attr("height", height);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.append("g")
    .attr("transform", `translate(0,${model.regions.length * rowH})`)
    .call(d3.axisBottom(x).ticks(narrow ? 4 : 5).tickFormat(formatTonnesAxis).tickSize(0).tickPadding(8))
    .call((axis) => axis.select(".domain").attr("stroke", "#cfc4b6"))
    .call((axis) => axis.selectAll("text").attr("fill", "#5e564c").attr("font-size", 12));

  const rows = g.selectAll("g.bar-row")
    .data(model.regions)
    .join("g")
    .attr("class", "bar-row")
    .attr("transform", (_, i) => `translate(0,${i * rowH})`)
    .style("cursor", "pointer")
    .on("mouseenter", (_, d) => {
      if (state.playing) return;
      setYear(state.year, d.entity);
    });

  rows.append("rect")
    .attr("y", 4)
    .attr("height", rowH - 8)
    .attr("width", (d) => x(d.byYear.get(2024)))
    .attr("fill", (d) => COLOR[d.entity])
    .attr("rx", 2);

  rows.append("text")
    .attr("x", -8)
    .attr("y", rowH / 2 + 1)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#1c1714")
    .attr("font-size", narrow ? 11 : 13)
    .text((d) => SHORT[d.entity]);

  rows.append("text")
    .attr("class", "bar-value")
    .attr("x", (d) => x(d.byYear.get(2024)) + 6)
    .attr("y", rowH / 2 + 1)
    .attr("dominant-baseline", "middle")
    .attr("fill", "#1c1714")
    .attr("font-size", 12)
    .text((d) => {
      const v = d.byYear.get(2024);
      const share = (100 * v) / model.worldByYear.get(2024);
      return `${formatBillion(v)} · ${share.toFixed(1)}%`;
    });
}

function render(force) {
  const width = document.getElementById("viz-charts").clientWidth;
  if (!width) return;
  if (!force && width === lastWidth) return;
  lastWidth = width;
  if (state.year < state.rangeStart) state.year = state.rangeStart;
  drawTotal(width);
  drawMultiples(width);
  drawBars(width);
  updateCopy();
  syncYearControls();
  paintYear();
}

function prepare(rows) {
  const keep = new Set(REGIONS);
  const grouped = new Map(REGIONS.map((name) => [name, []]));
  const world = [];
  rows.forEach((row) => {
    const year = +row.year;
    const emissions = +row.emissions_total;
    if (!Number.isFinite(year) || !Number.isFinite(emissions)) return;
    if (row.entity === "World") world.push({ year, emissions });
    if (keep.has(row.entity)) grouped.get(row.entity).push({ year, emissions });
  });

  const regions = REGIONS.map((entity) => {
    const series = grouped.get(entity).sort((a, b) => a.year - b.year);
    const byYear = new Map(series.map((d) => [d.year, d.emissions]));
    return { entity, rows: series, byYear, y1990: byYear.get(1990) };
  });
  regions.sort((a, b) => b.byYear.get(2024) - a.byYear.get(2024));
  const worldByYear = new Map(world.map((d) => [d.year, d.emissions]));
  const sum2024 = d3.sum(regions, (d) => d.byYear.get(2024));
  const world2024 = worldByYear.get(2024);
  if (!world2024 || Math.abs(sum2024 - world2024) / world2024 > 0.01) {
    throw new Error("The twelve regions do not match the world total in 2024.");
  }
  model = { regions, world: world.sort((a, b) => a.year - b.year), worldByYear, byName: new Map(regions.map((d) => [d.entity, d])) };
}

function bindControls() {
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => {
      stopPlay();
      state.rangeStart = +button.dataset.range;
      if (state.year < state.rangeStart) state.year = state.rangeStart;
      setPressed("[data-range]", "range", state.rangeStart);
      render(true);
    });
  });
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      setPressed("[data-mode]", "mode", state.mode);
      render(true);
    });
  });
  document.getElementById("play-btn").addEventListener("click", togglePlay);
  ["year-slider", "year-slider-bars"].forEach((id) => {
    document.getElementById(id).addEventListener("input", (event) => {
      stopPlay();
      setYear(+event.target.value, null);
    });
  });
  document.getElementById("viz-charts").addEventListener("mouseleave", () => {
    state.hoverRegion = null;
    if (panelMeta.size) paintYear();
  });
  const observer = new ResizeObserver(() => render(false));
  observer.observe(document.getElementById("viz-charts"));
}

d3.csv("data/annual-co-emissions-by-region.csv")
  .then((rows) => {
    prepare(rows);
    bindControls();
    render(true);
  })
  .catch((error) => {
    document.getElementById("readout").textContent = `The chart data did not load. ${error.message}`;
  });
