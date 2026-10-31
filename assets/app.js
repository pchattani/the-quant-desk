/* The Quant Desk — client.
   Reads the JSON the builder wrote under data/, draws every panel with Plotly in the
   family's theme, offers a table view of every chart, and keeps the selected tab,
   style, strategy and book in the hash so a view can be linked. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;   // only ever static markup from this file
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined) n.append(c);
  return n;
};
const txt = (s) => document.createTextNode(s);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v, nd = 2, signed = false) => !isNum(v) ? "—" : (signed && v > 0 ? "+" : "") + v.toFixed(nd);
const pct = (v, nd = 1, signed = true) => !isNum(v) ? "—" : (signed && v > 0 ? "+" : "") + (v * 100).toFixed(nd) + "%";
const pctU = (v, nd = 1) => pct(v, nd, false);
const dateLabel = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Theme ────────────────────────────────────────────────────────────────────
const T = {
  surface: "#0d1526", page: "#070b16", elev: "#132038", ink1: "#f2f5fb", ink2: "#c0c9da", muted: "#8e9ab0", grid: "#1a2641", axis: "#3a4b70",
  border: "rgba(170,190,235,0.14)", up: "#7d93ff", down: "#ff6a4d", bench: "#8e9ab0", amber: "#ffb224", ink4: "#56617a",
  sans: "\"Barlow\", system-ui, sans-serif", mono: "\"IBM Plex Mono\", ui-monospace, Consolas, monospace", cond: "\"Barlow Condensed\", \"Barlow\", sans-serif",
};
const STYLE_C = { trend: "#7d93ff", carry: "#ffb224", relative: "#5ec8f0", multi: "#c39be8", premia: "#8fd16a", alt: "#f28fb5", digital: "#d9b38c" };
const CLS_C = { rates: "#7d93ff", equity_index: "#c39be8", commodity: "#ffb224", fx: "#5ec8f0", volatility: "#f28fb5", crypto: "#d9b38c" };
const CLS_LABEL = { rates: "Rates", equity_index: "Equity indices", commodity: "Commodities", fx: "FX", volatility: "Volatility", crypto: "Crypto" };
const DIV = [[0, T.down], [0.5, "#1b2740"], [1, T.up]];
const rgba = (hex, a) => { const h = hex.replace("#", ""); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
const PLOT_CONFIG = { displaylogo: false, responsive: true, displayModeBar: "hover", modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines", "zoomIn2d", "zoomOut2d"] };

function axis(extra = {}) {
  return { gridcolor: T.grid, zerolinecolor: T.axis, linecolor: T.axis, tickcolor: T.axis, tickfont: { color: T.muted, size: 11 }, automargin: true, ...extra };
}
function L(extra = {}) {
  const base = {
    paper_bgcolor: T.surface, plot_bgcolor: T.surface, font: { color: T.ink2, family: T.sans, size: 12 }, margin: { l: 48, r: 16, t: 12, b: 36 },
    xaxis: axis(), yaxis: axis(), hovermode: "x unified",
    hoverlabel: { bgcolor: T.elev, bordercolor: T.border, font: { color: T.ink1, family: T.mono, size: 11.5 } },
    legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, font: { size: 11, color: T.ink2 }, bgcolor: "rgba(0,0,0,0)" },
  };
  return merge(base, extra);
}
function merge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) a[k] = merge(a[k] || {}, b[k]);
    else a[k] = b[k];
  }
  return a;
}
const hline = (y, yref = "y", color = T.axis, dash = "dot") => ({ type: "line", xref: "paper", x0: 0, x1: 1, yref, y0: y, y1: y, line: { color, dash, width: 1 } });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  tab: "monitor",
  monitor: { window: "all", style: "all", period: "ytd" },
  styles: { key: "trend", window: "all" },
  strategy: { id: null, window: "all" },
  markets: { cls: "all", mkt: null },
  risk: { book: null },
};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("tab")) state.tab = p.get("tab");
  if (p.get("style")) state.styles.key = p.get("style");
  if (p.get("strategy")) state.strategy.id = p.get("strategy");
  if (p.get("book")) state.risk.book = p.get("book");
  if (p.get("mkt")) state.markets.mkt = p.get("mkt");
  return p.get("g");
}
function writeHash() {
  const p = new URLSearchParams({ tab: state.tab });
  if (state.tab === "styles") p.set("style", state.styles.key);
  if (state.tab === "strategy" && state.strategy.id) p.set("strategy", state.strategy.id);
  if (state.tab === "risk" && state.risk.book) p.set("book", state.risk.book);
  if (state.tab === "markets" && state.markets.mkt) p.set("mkt", state.markets.mkt);
  try { history.replaceState(null, "", "#" + p.toString()); } catch (_) { /* sandboxed */ }
}

// ── Data ─────────────────────────────────────────────────────────────────────
const cache = new Map();
async function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch("data/" + path).then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }).catch(err => { cache.delete(path); throw err; }));
  }
  return cache.get(path);
}
let META, S, STYLES, BENCH;
const byId = {};
const styleOf = (id) => byId[id]?.style || "trend";
const labelOf = (id) => byId[id]?.label || id;

// ── Figures and their table view ─────────────────────────────────────────────
function mount(id, fig, opts = {}) {
  const node = document.getElementById(id);
  if (!node) return;
  node._fig = fig; node._opts = opts;
  const card = node.closest(".card");
  const wrap = card ? $(".tablewrap", card) : null;
  if (wrap && !wrap.hidden) { wrap.replaceChildren(tableFromFig(fig)); return; }
  Plotly.react(node, fig.data, fig.layout, PLOT_CONFIG).then(() => { if (opts.after) opts.after(node); });
}
function tableFromFig(fig) {
  const traces = (fig.data || []).filter(t => t.visible !== false);
  if (!traces.length) return el("p", { class: "empty", text: "Nothing to show." });
  const first = traces[0];
  if (first.type === "heatmap") {
    const cols = [{ key: "_r", label: "" }, ...first.x.map((x, i) => ({ key: "c" + i, label: String(x), num: true, nd: 2 }))];
    const rows = first.y.map((y, j) => { const r = { _r: String(y) }; first.x.forEach((_, i) => r["c" + i] = first.z[j][i]); return r; });
    return buildTable(cols, rows);
  }
  const horizontal = traces.every(t => t.orientation === "h");
  const keyOf = horizontal ? (t, i) => t.y[i] : (t, i) => t.x[i];
  const valOf = horizontal ? (t, i) => t.x[i] : (t, i) => t.y[i];
  const keys = [];
  const seen = new Set();
  for (const t of traces) for (let i = 0; i < (t.x || []).length; i++) { const k = String(keyOf(t, i)); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  const cols = [{ key: "_k", label: horizontal ? "" : "Date" }, ...traces.map((t, i) => ({ key: "t" + i, label: t.name || `Series ${i + 1}`, num: true, nd: 2 }))];
  const rows = keys.map(k => ({ _k: k }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  traces.forEach((t, ti) => { for (let i = 0; i < (t.x || []).length; i++) { const r = rows[idx.get(String(keyOf(t, i)))]; const v = valOf(t, i); r["t" + ti] = isNum(v) ? v : null; } });
  if (!horizontal) rows.reverse();
  return buildTable(cols, rows.slice(0, 600));
}
function buildTable(columns, rows, { onRow = null } = {}) {
  const t = el("table", { class: "data" });
  t.append(el("thead", {}, el("tr", {}, columns.map(c => el("th", { class: c.num ? "n" : "", text: c.label })))));
  t.append(el("tbody", {}, rows.map(r => {
    const tr = el("tr", { class: onRow ? "clickable" : "" }, columns.map(c => {
      const td = el("td", { class: c.num ? "n" : "" });
      const v = r[c.key];
      if (c.render) td.append(c.render(v, r)); else td.textContent = c.num ? fmt(v, c.nd ?? 2) : (v ?? "—");
      return td;
    }));
    if (onRow) tr.addEventListener("click", () => onRow(r));
    return tr;
  })));
  return t;
}
function sortableTable(container, columns, rows, { sortKey = null, desc = false, onRow = null, current = null } = {}) {
  let key = sortKey, down = desc;
  const render = () => {
    const sorted = [...rows];
    if (key) sorted.sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va === null || va === undefined) return 1; if (vb === null || vb === undefined) return -1;
      const c = (isNum(va) && isNum(vb)) ? va - vb : String(va).localeCompare(String(vb));
      return down ? -c : c;
    });
    const t = el("table", { class: "data" });
    t.append(el("thead", {}, el("tr", {}, columns.map(c => el("th", {
      class: c.num ? "n" : "", text: c.label, title: c.title || null, role: "button", tabindex: "0",
      "aria-sort": key === c.key ? (down ? "descending" : "ascending") : null,
      onclick: () => { if (key === c.key) down = !down; else { key = c.key; down = !!c.num; } render(); },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); } },
    })))));
    t.append(el("tbody", {}, sorted.map(r => {
      const tr = el("tr", { class: onRow ? "clickable" : "", "aria-current": current && current(r) ? "true" : null }, columns.map(c => {
        const td = el("td", { class: c.cls || (c.num ? "n" : "") });
        const v = r[c.key];
        if (c.render) td.append(c.render(v, r)); else td.textContent = c.num ? fmt(v, c.nd ?? 2, c.signed ?? false) : (v ?? "—");
        return td;
      }));
      if (onRow) tr.addEventListener("click", () => onRow(r));
      return tr;
    })));
    container.replaceChildren(t);
  };
  render();
}
const signed = (v, nd = 2) => el("span", { class: "num " + (!isNum(v) ? "" : v < 0 ? "down" : v > 0 ? "up" : ""), text: fmt(v, nd, true) });
const signedPct = (v, nd = 1) => el("span", { class: "num " + (!isNum(v) ? "" : v < 0 ? "down" : v > 0 ? "up" : ""), text: pct(v, nd) });
const wash = (v, vmax) => !isNum(v) ? "" : `background:rgba(var(--${v < 0 ? "down" : "up"}-rgb), ${(Math.min(1, Math.abs(v) / vmax) * 0.55).toFixed(3)})`;
const washCell = (v, nd, vmax) => el("span", { class: "wash", text: fmt(v, nd, true), style: wash(v, vmax) });
const styleTag = (sk) => el("span", { class: `tag style st-${sk}`, text: META.styles[sk]?.short || sk });
const styleDot = (sk) => el("span", { class: `dot st-${sk}` });
function zbar(v, cap, cls = "") {
  if (!isNum(v)) return txt("—");
  const span = Math.min(Math.abs(v), cap) / cap * 50;
  const i = el("i", { class: v < 0 ? "down" : "up", style: v < 0 ? `right:50%;width:${span}%` : `left:50%;width:${span}%` });
  return el("span", { style: "display:inline-flex;align-items:center;gap:6px" }, [el("span", { class: "zbar " + cls, title: fmt(v, 2, true) }, i), el("span", { class: "num", text: fmt(v, 2, true) })]);
}
function seg(container, options, value, onChange) {
  const name = "seg-" + Math.random().toString(36).slice(2, 8);
  container.replaceChildren(...options.map(([v, label]) => {
    const input = el("input", { type: "radio", name, value: v });
    input.checked = v === value;
    input.addEventListener("change", () => onChange(v));
    return el("label", {}, [input, el("span", { text: label })]);
  }));
}
function segFilter(sel, options, get, set) {
  const paint = () => { for (const c of $$(`[data-filter="${sel}"]`)) seg(c, options, get(), v => { set(v); paint(); }); };
  paint();
}
const WINDOWS = [["all", "All"], ["2005", "2005"], ["2015", "2015"], ["5y", "5Y"]];
function windowRange(dates, w) {
  if (!dates || !dates.length) return null;
  const last = dates[dates.length - 1];
  if (w === "all") return null;
  if (w === "5y") { const d = new Date(last); d.setFullYear(d.getFullYear() - 5); return [d.toISOString().slice(0, 10), last]; }
  return [`${w}-01-01`, last];
}
function applyWindow(fig, dates, w) {
  const r = windowRange(dates, w);
  if (!r) return fig;
  fig.layout.xaxis = { ...(fig.layout.xaxis || {}), range: r, autorange: false };
  for (const k of Object.keys(fig.layout)) if (/^xaxis\d+$/.test(k)) fig.layout[k] = { ...fig.layout[k], range: r, autorange: false };
  // rebase a log NAV chart to the window start
  if (fig._rebase) for (const t of fig.data) {
    if (!t._nav) continue;
    const i0 = t.x.findIndex(d => d >= r[0]);
    if (i0 > 0) { const base = t._nav[i0]; t.y = t._nav.map(v => isNum(v) && isNum(base) ? v / base * 100 : null); }
  } else if (fig._rebase === false) { /* nothing */ }
  return fig;
}

// ── SVG sparklines ───────────────────────────────────────────────────────────
function svgFrom(markup) { const host = el("div"); host.innerHTML = markup.trim(); return host.firstElementChild; }
function sparkPath(values, w, h, pad = 2, zeroAt = null) {
  const v = values.filter(isNum);
  if (v.length < 2) return { d: "", last: null, zero: null, area: "" };
  const lo = Math.min(...v, zeroAt ?? Infinity), hi = Math.max(...v, zeroAt ?? -Infinity), span = (hi - lo) || 1;
  const y = (val) => h - pad - (val - lo) / span * (h - 2 * pad);
  const pts = values.map((val, i) => isNum(val) ? [i / (values.length - 1) * w, y(val)] : null).filter(Boolean);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return { d, last: pts[pts.length - 1], zero: zeroAt === null ? null : y(zeroAt), area };
}
function sparkSvg(values, { w = 100, h = 22, cls = "spark", zeroAt = null } = {}) {
  const { d, last, zero } = sparkPath(values, w, h, 2, zeroAt);
  if (!d) return svgFrom(`<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`);
  return svgFrom(`<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${zero === null ? "" : `<line x1="0" x2="${w}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke="currentColor" stroke-opacity="0.18"/>`}
    <path d="${d}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2"/></svg>`);
}
function tile(label, value, sub, { cls = "", spark = null, zeroAt = null } = {}) {
  return el("div", { class: "tile" }, [
    el("span", { class: "label eyebrow", text: label }),
    el("span", { class: "value " + cls, text: value }),
    el("span", { class: "delta", text: sub || "" }),
    spark ? sparkSvg(spark, { zeroAt }) : null,
  ]);
}
const upDown = (v) => !isNum(v) ? "" : v < 0 ? "down" : v > 0 ? "up" : "";

// ── Shared figure builders ───────────────────────────────────────────────────
function navFig(dates, nav, dd, color, name, { extra = [], log = true, rebase = true } = {}) {
  const data = [
    { x: dates, y: nav, _nav: nav, mode: "lines", name, line: { color, width: 1.8 }, yaxis: "y", hovertemplate: "%{y:.1f}<extra>" + name + "</extra>" },
    ...extra,
    { x: dates, y: dd.map(v => isNum(v) ? v * 100 : null), mode: "lines", name: "Drawdown, %", line: { color: T.down, width: 1 }, fill: "tozeroy", fillcolor: rgba(T.down, 0.25), yaxis: "y2", hovertemplate: "%{y:.1f}%<extra>drawdown</extra>" },
  ];
  const fig = { data, layout: L({ height: 440, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { type: log ? "log" : "linear", domain: [0.34, 1] }, yaxis2: { domain: [0, 0.26] }, xaxis: { anchor: "y2" } }) };
  fig._rebase = rebase;
  return fig;
}
function calendarFig(cal, { height = null, zmax = 8 } = {}) {
  const z = cal.matrix.map(r => r.map(v => isNum(v) ? v * 100 : null));
  const yrs = cal.years.map(String);
  return { data: [
    { z, x: MONTHS, y: yrs, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -zmax, zmax, text: z.map(r => r.map(v => isNum(v) ? v.toFixed(1) : "")), texttemplate: "%{text}", textfont: { size: 9.5, family: T.mono }, showscale: false, hovertemplate: "%{y} %{x}: %{z:.2f}%<extra></extra>", xgap: 1, ygap: 1 },
    { z: cal.annual.map(v => [isNum(v) ? v * 100 : null]), x: ["Year"], y: yrs, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -zmax * 3, zmax: zmax * 3, text: cal.annual.map(v => [isNum(v) ? (v * 100).toFixed(1) : ""]), texttemplate: "%{text}", textfont: { size: 9.5, family: T.mono }, showscale: false, xaxis: "x2", hovertemplate: "%{y}: %{z:.2f}%<extra></extra>", xgap: 1, ygap: 1 },
  ], layout: L({ height: height || Math.max(360, 17 * yrs.length + 50), hovermode: "closest", xaxis: { domain: [0, 0.9], side: "top", showgrid: false }, xaxis2: { domain: [0.92, 1], side: "top", showgrid: false }, yaxis: { autorange: "reversed", tickfont: { size: 10 }, showgrid: false }, margin: { l: 44, r: 8, t: 26, b: 6 } }) };
}
function corrFig(ids, labels, matrix, { height = 420 } = {}) {
  return { data: [{ z: matrix, x: labels, y: labels, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -1, zmax: 1, text: matrix.map(r => r.map(v => isNum(v) ? v.toFixed(2) : "")), texttemplate: "%{text}", textfont: { size: 9, family: T.mono }, showscale: false, xgap: 1, ygap: 1, hovertemplate: "%{y} × %{x}: %{z:.2f}<extra></extra>" }],
    layout: L({ height, hovermode: "closest", xaxis: { tickangle: -40, tickfont: { size: 9.5 }, showgrid: false }, yaxis: { autorange: "reversed", tickfont: { size: 9.5 }, showgrid: false }, margin: { l: 8, r: 8, t: 6, b: 8 } }) };
}
function barsByYear(series, colors, names, { height = 320, years = null } = {}) {
  return { data: series.map((s, i) => ({ x: years || s.map(r => r.year), y: s.map(r => isNum(r.v) ? r.v * 100 : null), type: "bar", name: names[i], marker: { color: colors[i] }, hovertemplate: "%{y:.1f}%<extra>" + names[i] + "</extra>" })),
    layout: L({ height, barmode: "group", bargap: 0.25, hovermode: "x", xaxis: { type: "category", showgrid: false }, yaxis: { ticksuffix: "%" } }) };
}
function rollingSharpeFig(r1, r3, color) {
  return { data: [
    { x: r1.dates, y: r1.values, mode: "lines", name: "1-year Sharpe", line: { color: rgba(color, 0.6), width: 1 } },
    { x: r3.dates, y: r3.values, mode: "lines", name: "3-year Sharpe", line: { color, width: 1.8 } },
  ], layout: L({ height: 300, shapes: [hline(0)], yaxis: { zeroline: false } }) };
}
const sortedEntries = (obj, asc = false) => Object.entries(obj).filter(([, v]) => isNum(v)).sort((a, b) => asc ? a[1] - b[1] : b[1] - a[1]);

// ── Boot ─────────────────────────────────────────────────────────────────────
const inited = {};
const INIT = { monitor: initMonitor, styles: initStyles, strategy: initStrategy, benchmark: initBenchmark, markets: initMarkets, risk: initRisk, methodology: initMethodology };
async function showTab(tab, { push = true } = {}) {
  if (!INIT[tab]) tab = "monitor";
  state.tab = tab;
  for (const b of $$(".tab")) b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  for (const p of $$(".panel")) p.hidden = p.id !== "tab-" + tab;
  if (push) writeHash();
  if (!inited[tab]) { inited[tab] = true; try { await INIT[tab](); } catch (err) { console.error(err); $("#tab-" + tab).prepend(el("p", { class: "empty", text: "This section could not load: " + err.message })); } }
  else if (tab === "strategy") await renderStrategy();
  else if (tab === "styles") await renderStyle();
  else if (tab === "risk") await renderRisk();
  window.dispatchEvent(new Event("resize"));
}
function openStrategy(id) { state.strategy.id = id; showTab("strategy"); }
function openStyle(key) { state.styles.key = key; showTab("styles"); }

async function main() {
  const glossaryTarget = readHash();
  [META, S, STYLES, BENCH] = await Promise.all([load("meta.json"), load("strategies.json"), load("styles.json"), load("benchmark.json")]);
  for (const s of S.strategies) byId[s.id] = s;
  if (!state.strategy.id || !byId[state.strategy.id]) state.strategy.id = META.flagship;
  if (!STYLES.styles[state.styles.key]) state.styles.key = STYLES.order[0];
  $("#brand-n").textContent = META.n_strategies;
  $("#freshness").innerHTML = `Data to <b>${dateLabel(META.last_bar)}</b> · built ${META.built}`;
  renderTape();
  for (const b of $$(".tab")) b.addEventListener("click", () => showTab(b.dataset.tab));
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href^='#tab=']");
    if (a) { e.preventDefault(); const p = new URLSearchParams(a.getAttribute("href").slice(1)); showTab(p.get("tab")).then(() => { const g = p.get("g"); if (g) document.getElementById(g)?.scrollIntoView({ block: "center" }); }); }
    const goto = e.target.closest("[data-goto]");
    if (goto) showTab(goto.dataset.goto);
    const tog = e.target.closest(".table-toggle");
    if (tog) {
      const card = tog.closest(".card"); const plot = $(".plot", card); const wrap = $(".tablewrap", card);
      const on = tog.getAttribute("aria-pressed") !== "true";
      tog.setAttribute("aria-pressed", on ? "true" : "false"); tog.title = on ? "Chart view" : "Table view";
      if (on) { wrap.hidden = false; plot.hidden = true; wrap.replaceChildren(plot._fig ? tableFromFig(plot._fig) : el("p", { class: "empty", text: "No data." })); }
      else { wrap.hidden = true; plot.hidden = false; if (plot._fig) Plotly.react(plot, plot._fig.data, plot._fig.layout, PLOT_CONFIG); }
    }
  });
  window.addEventListener("hashchange", () => { const g = readHash(); showTab(state.tab, { push: false }).then(() => { if (g) document.getElementById(g)?.scrollIntoView({ block: "center" }); }); });
  await showTab(state.tab, { push: false });
  if (glossaryTarget) document.getElementById(glossaryTarget)?.scrollIntoView({ block: "center" });
}

// ── The tape ─────────────────────────────────────────────────────────────────
function renderTape() {
  const yr = META.last_bar.slice(0, 4);
  const items = [el("div", { class: "tick-head", text: yr + " so far" })];
  for (const k of STYLES.order) {
    const st = STYLES.styles[k];
    items.push(el("button", { class: `tick st-${k}`, type: "button", onclick: () => openStyle(k), title: st.label + ": open the style" }, [
      el("span", { class: "code", style: `color:${STYLE_C[k]}`, text: st.short }),
      el("span", { class: "when " + upDown(st.ytd), text: pct(st.ytd) }),
      el("span", { class: "bank", text: `${st.n} ${st.n === 1 ? "strategy" : "strategies"} · 3m ${pct(st.m3)}` }),
    ]));
  }
  const f = byId[META.flagship];
  if (f) items.push(el("button", { class: "tick", type: "button", onclick: () => openStrategy(f.id) }, [el("span", { class: "code", text: "Flagship" }), el("span", { class: "when " + upDown(f.ytd), text: pct(f.ytd) }), el("span", { class: "bank", text: f.label })]));
  const b = BENCH.flagship?.bench_ytd;
  if (b) items.push(el("button", { class: "tick", type: "button", onclick: () => showTab("benchmark") }, [el("span", { class: "code", style: `color:${T.bench}`, text: "DBMF" }), el("span", { class: "when " + upDown(b.total), text: pct(b.total) }), el("span", { class: "bank", text: `SG CTA proxy · ${pctU(b.vol)} vol · to ${b.end.slice(5)}` })]));
  $("#tape").replaceChildren(...items);
}

// ── Monitor ──────────────────────────────────────────────────────────────────
async function initMonitor() {
  const f = byId[META.flagship];
  const flag = BENCH.flagship;
  const styles = STYLES.order.map(k => STYLES.styles[k]);
  const best = [...styles].sort((a, b) => (b.ytd ?? -9) - (a.ytd ?? -9))[0];
  const worst = [...styles].sort((a, b) => (a.ytd ?? 9) - (b.ytd ?? 9))[0];
  const up = S.strategies.filter(s => isNum(s.ytd) && s.ytd > 0).length;
  const bestS = [...S.strategies].sort((a, b) => (b.ytd ?? -9) - (a.ytd ?? -9))[0];
  const worstS = [...S.strategies].sort((a, b) => (a.ytd ?? 9) - (b.ytd ?? 9))[0];
  const yr = META.last_bar.slice(0, 4);
  $("#hero-sub").textContent = `${META.n_strategies} systematic strategies in ${META.n_styles} styles, run the same way on ${META.n_markets} futures markets${META.n_crypto ? ` and ${META.n_crypto} crypto perpetuals` : ""}: every one at a 10% volatility target, net of ${META.cost_bps} bps, daily since 1990, with nothing re-fitted as new data arrives. Data to ${dateLabel(META.last_bar)}.`;
  $("#hero-side").replaceChildren(
    el("button", { class: "sh-link", type: "button", "data-goto": "styles" }, [el("b", { text: "Styles →" }), el("span", { text: "Trend, carry, relative value and the rest" })]),
    el("button", { class: "sh-link", type: "button", "data-goto": "markets" }, [el("b", { text: "Markets →" }), el("span", { text: "What every style says today" })]),
    el("button", { class: "sh-link", type: "button", "data-goto": "benchmark" }, [el("b", { text: "Benchmark →" }), el("span", { text: "Against the SG CTA index" })]),
  );
  const blend = STYLES.equal_blend_m;
  $("#kpis").replaceChildren(
    tile("Flagship trend · this year", pct(f?.ytd), flag ? `DBMF ${pct(flag.bench_ytd.total)} as traded · ≈ ${pct(flag.bench_ytd.total * flag.scale_to_10)} at 10% vol` : "", { cls: upDown(f?.ytd), spark: f?.spark }),
    tile(`Best style · ${yr}`, pct(best.ytd), `${best.label} · ${best.n} strategies`, { cls: upDown(best.ytd), spark: best.spark }),
    tile(`Weakest style · ${yr}`, pct(worst.ytd), `${worst.label} · ${worst.n} ${worst.n === 1 ? "strategy" : "strategies"}`, { cls: upDown(worst.ytd), spark: worst.spark }),
    tile("Strategies up this year", `${up} of ${S.strategies.length}`, `best ${bestS.label} ${pct(bestS.ytd)} · worst ${worstS.label} ${pct(worstS.ytd)}`),
    tile("Every style at equal risk", fmt(blend.sharpe_m), "Sharpe of the equal-weight blend of style composites, monthly since 1990", { spark: cumFromMonthly(blend.values).slice(-60) }),
    tile("Correlation to the index proxy", fmt(flag?.corr_w), flag ? `flagship vs DBMF, weekly, ${flag.start.slice(0, 4)}–${flag.end.slice(0, 4)} · beta ${fmt(flag.beta_w)}` : ""),
  );
  // the year in five lines
  const trendSt = STYLES.styles.trend, carrySt = STYLES.styles.carry, relSt = STYLES.styles.relative;
  const lines = [
    ["Flagship against the index", pct(f?.ytd), `Index-matched trend ${pct(f?.ytd)} at ${pctU(f?.ytd_vol)} vol this year; DBMF ${pct(flag?.bench_ytd.total)} at ${pctU(flag?.bench_ytd.vol)}. Same direction, ${flag && f ? (Math.abs((f.ytd ?? 0) - (flag.bench_ytd.total ?? 0)) < 0.03 ? "same magnitude" : "different magnitude") : ""}.`, () => openStrategy(META.flagship)],
    [`${best.label} led`, pct(best.ytd), `${best.n} strategies in the style, composite at 10% vol. ${best.key === "trend" ? "A trend year." : "Not a trend year: " + (trendSt ? `trend ${pct(trendSt.ytd)}.` : "")}`, () => openStyle(best.key)],
    [`${worst.label} lagged`, pct(worst.ytd), worst.key === "alt" ? "The alternative factors are shown as evidence, not conviction; this is what the evidence looks like." : `The weakest of the ${META.n_styles} composites this year.`, () => openStyle(worst.key)],
    ["Breadth across strategies", `${up} / ${S.strategies.length}`, `${up} strategies are up on the year; ${bestS.label} (${META.styles[bestS.style].short}) ${pct(bestS.ytd)} leads, ${worstS.label} ${pct(worstS.ytd)} trails.`, () => openStrategy(bestS.id)],
    ["Trend and carry", carrySt && trendSt ? fmt(STYLES.corr.matrix[STYLES.corr.ids.indexOf("trend")]?.[STYLES.corr.ids.indexOf("carry")]) : "—", carrySt && trendSt ? `Correlation of the two composites since 1990. Carry ${pct(carrySt.ytd)}, trend ${pct(trendSt.ytd)} this year${relSt ? `; relative value ${pct(relSt.ytd)}` : ""}.` : "", () => showTab("styles")],
  ];
  $("#year-lede").textContent = `Five facts from the data to ${dateLabel(META.last_bar)}. Select a line to open it.`;
  $("#year-lines").replaceChildren(...lines.map(([k, v, p, go]) => el("button", { class: "week-tile link", type: "button", onclick: go }, [el("span", { class: "k", text: k }), el("span", { class: "v " + (v.startsWith("-") || v.startsWith("−") ? "down" : v.startsWith("+") ? "up" : ""), text: v }), el("p", { text: p })])));

  renderStyleBoard();
  segFilter("monitor.window", WINDOWS, () => state.monitor.window, v => { state.monitor.window = v; renderStyleNav(); });
  renderStyleNav();
  mount("chart-style-corr", corrFig(STYLES.corr.ids, STYLES.corr.ids.map(k => META.styles[k].short), STYLES.corr.matrix, { height: 360 }));
  segFilter("monitor.style", [["all", "All"], ...STYLES.order.map(k => [k, META.styles[k].short])], () => state.monitor.style, v => { state.monitor.style = v; renderStrategyBoard(); });
  renderStrategyBoard();
  renderMultiples();
  segFilter("monitor.period", [["ytd", "This year"], ["m3", "3 months"], ["m12", "12 months"], ["y_prev", "Last year"]], () => state.monitor.period, v => { state.monitor.period = v; renderYtdBars(); });
  renderYtdBars();
  renderStyleYears();
}
function cumFromMonthly(vals) { let a = 100; return vals.map(v => a = a * (1 + (v || 0))); }
function renderStyleBoard() {
  const head = el("div", { class: "board-row head" }, ["Style", "Sharpe · all", "Sharpe · 2019+", "This year", "3 months", "Max drawdown", "Corr · DBMF", "Corr · trend", "12 months"].map((t, i) => el("span", { class: i ? "n" : "", text: t })));
  const rows = STYLES.order.map(k => {
    const st = STYLES.styles[k], ts = st.tearsheet;
    const n = (v, f, sub) => el("span", { class: "n " + (f === pct ? upDown(v) : "") }, [txt(f(v)), sub ? el("small", { text: sub }) : null]);
    return el("button", { class: `board-row st-${k}`, type: "button", onclick: () => openStyle(k) }, [
      el("span", { class: "who" }, [el("b", { text: st.label }), el("small", { text: `${st.n} ${st.n === 1 ? "strategy" : "strategies"} · ${st.members.slice(0, 3).map(labelOf).join(", ")}${st.members.length > 3 ? "…" : ""}` })]),
      n(ts.all?.sharpe, fmt, `${pctU(ts.all?.ann_ret)} / ${pctU(ts.all?.vol)} · from ${ts.all?.start.slice(0, 4)}`),
      n(ts.since_2019?.sharpe, fmt, `${pctU(ts.since_2019?.ann_ret)} a year`),
      n(st.ytd, pct), n(st.m3, pct),
      n(ts.all?.max_dd, pct, `worst year ${ts.all?.worst_year?.[0]} ${pct(ts.all?.worst_year?.[1], 0)}`),
      n(st.corr_dbmf_w, fmt, "weekly, ETF life"), n(st.corr_flag_m, fmt, "monthly, 1990+"),
      el("span", { class: "sparkcell" }, sparkSvg(st.spark, { w: 120, h: 26 })),
    ]);
  });
  $("#style-board").replaceChildren(head, ...rows);
}
function renderStyleNav() {
  const w = state.monitor.window;
  const data = STYLES.order.map(k => { const st = STYLES.styles[k]; return { x: st.nav.dates, y: st.nav.nav, _nav: st.nav.nav, mode: "lines", name: st.label, line: { color: STYLE_C[k], width: k === "trend" ? 2.2 : 1.4 }, hovertemplate: "%{y:.0f}<extra>" + st.label + "</extra>" }; });
  const fl = BENCH.flagship;
  if (fl) data.push({ x: fl.nav.dates, y: fl.nav.bench_10, _nav: fl.nav.bench_10, mode: "lines", name: "DBMF at 10% vol", line: { color: T.bench, width: 1.2, dash: "dot" }, hovertemplate: "%{y:.0f}<extra>DBMF at 10% vol</extra>" });
  const fig = { data, layout: L({ height: 420, yaxis: { type: "log" }, legend: { font: { size: 11 } } }) };
  fig._rebase = true;
  mount("chart-style-nav", applyWindow(fig, STYLES.styles[STYLES.order[0]].nav.dates, w));
}
function renderStrategyBoard() {
  const rows = S.strategies.filter(s => state.monitor.style === "all" || s.style === state.monitor.style);
  $("#sboard-ctx").textContent = `${rows.length} strategies · Sharpe by window · select a row to open it`;
  sortableTable($("#strategy-board"), [
    { key: "label", label: "Strategy", render: (v, r) => el("span", {}, [styleDot(r.style), el("b", { text: v }), el("small", { style: "display:block;color:var(--ink-3);font-size:11.5px", text: r.rule })]) },
    { key: "style", label: "Style", render: v => styleTag(v) },
    { key: "sr_all", label: "Sharpe · all", num: true, title: "Annualised Sharpe over the whole sample, net of 2 bps" },
    { key: "sr05", label: "2005+", num: true }, { key: "sr19", label: "2019+", num: true }, { key: "sr3y", label: "3y", num: true },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v) }, { key: "m3", label: "3 months", num: true, render: v => signedPct(v) },
    { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v)) },
    { key: "max_dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) },
    { key: "dd_now", label: "DD now", num: true, render: v => el("span", { class: "num " + (v < -0.001 ? "down" : ""), text: pct(v, 1, false) }) },
    { key: "corr_dbmf_w", label: "Corr DBMF", num: true }, { key: "corr_flag_m", label: "Corr trend", num: true },
    { key: "turnover", label: "Turnover", num: true, nd: 0, render: v => txt(isNum(v) ? fmt(v, 0) + "×" : "—") },
    { key: "spark", label: "12 months", render: v => el("span", { class: "sparkcell" }, sparkSvg(v, { w: 90, h: 18 })) },
  ], rows, { sortKey: null, onRow: r => openStrategy(r.id), current: r => r.id === state.strategy.id });
}
function renderMultiples() {
  const host = $("#multiples");
  host.replaceChildren(...S.strategies.map(s => {
    const vals = s.nav_m.values.map(v => Math.log(v));
    const { d, area } = sparkPath(vals, 100, 44, 2);
    const svg = svgFrom(`<svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="nav" d="${d}"/></svg>`);
    return el("button", { class: `mini st-${s.style}`, type: "button", onclick: () => openStrategy(s.id), title: `${s.label}: open`, "aria-current": s.id === state.strategy.id ? "true" : null }, [
      el("span", { class: "t", text: s.label }), el("span", { class: "vals" }, [el("span", { class: "v " + upDown(s.ytd), text: pct(s.ytd) }), el("span", { class: "vm", text: "SR " + fmt(s.sr_all) })]),
      svg, el("span", { class: "name", text: `${META.styles[s.style].label} · ${s.rule}` }),
    ]);
  }));
}
function renderYtdBars() {
  const key = state.monitor.period;
  const label = { ytd: "This year", m3: "Last 3 months", m12: "Last 12 months", y_prev: "Last year" }[key];
  $("#ytd-title").replaceChildren(txt(label + " by strategy "), el("span", { class: "ctx", text: "% of capital at the 10% target · coloured by style" }));
  const rows = S.strategies.filter(s => isNum(s[key])).sort((a, b) => a[key] - b[key]);
  mount("chart-ytd-bars", { data: [{ y: rows.map(r => r.label), x: rows.map(r => r[key] * 100), type: "bar", orientation: "h", name: label, marker: { color: rows.map(r => STYLE_C[r.style]) }, text: rows.map(r => META.styles[r.style].label), textposition: "none", hovertemplate: "%{y} (%{text}): %{x:.1f}%<extra></extra>" }],
    layout: L({ height: Math.max(380, 18 * rows.length + 40), hovermode: "closest", showlegend: false, xaxis: { ticksuffix: "%", zeroline: true }, yaxis: { tickfont: { size: 10 }, showgrid: false }, margin: { l: 10, t: 6 } }) }, { after: n => n.on("plotly_click", e => { const r = rows[e.points[0].pointIndex]; if (r) openStrategy(r.id); }) });
}
function renderStyleYears() {
  const years = BENCH.dbmf_by_year.map(r => r.year);
  const series = STYLES.order.map(k => BENCH.styles_by_year[k] ? years.map(y => ({ year: y, v: BENCH.styles_by_year[k].find(r => r.year === y)?.ret ?? null })) : null).filter(Boolean);
  const names = STYLES.order.filter(k => BENCH.styles_by_year[k]).map(k => META.styles[k].label);
  const colors = STYLES.order.filter(k => BENCH.styles_by_year[k]).map(k => STYLE_C[k]);
  series.push(years.map(y => ({ year: y, v: BENCH.dbmf_by_year.find(r => r.year === y)?.ret ?? null }))); names.push("DBMF as traded"); colors.push(T.bench);
  mount("chart-style-years", barsByYear(series, colors, names, { height: 380, years }));
}

// ── Styles ───────────────────────────────────────────────────────────────────
async function initStyles() {
  segFilter("styles.key", STYLES.order.map(k => [k, META.styles[k].label]), () => state.styles.key, v => { state.styles.key = v; writeHash(); renderStyle(); });
  segFilter("styles.window", WINDOWS, () => state.styles.window, v => { state.styles.window = v; renderStyle(); });
  await renderStyle();
}
async function renderStyle() {
  const k = state.styles.key, st = STYLES.styles[k], c = STYLE_C[k], ts = st.tearsheet;
  for (const s of $$('[data-filter="styles.key"] input')) s.checked = s.value === k;
  $("#style-title").textContent = st.label;
  $("#style-blurb").textContent = st.blurb;
  $("#style-members-note").textContent = `${st.n} ${st.n === 1 ? "strategy" : "strategies"} · composite = equal weight of the members, scaled ×${fmt(st.scale, 2)} to 10% vol over the sample`;
  $("#style-tiles").replaceChildren(
    tile("Sharpe · whole sample", fmt(ts.all?.sharpe), `${pctU(ts.all?.ann_ret)} a year at ${pctU(ts.all?.vol)} · from ${ts.all?.start.slice(0, 4)}`),
    tile("Sharpe · since 2019", fmt(ts.since_2019?.sharpe), `${pctU(ts.since_2019?.ann_ret)} a year · Sortino ${fmt(ts.since_2019?.sortino)}`),
    tile("This year", pct(st.ytd), `3 months ${pct(st.m3)} · 12 months ${pct(st.m12)}`, { cls: upDown(st.ytd), spark: st.spark }),
    tile("Max drawdown", pct(ts.all?.max_dd, 1, false), `Calmar ${fmt(ts.all?.calmar)} · worst year ${ts.all?.worst_year?.[0]} ${pct(ts.all?.worst_year?.[1])}`, { cls: "down" }),
    tile("Correlation to DBMF", fmt(st.corr_dbmf_w), "weekly returns over the ETF's life"),
    tile("Correlation to trend", fmt(st.corr_flag_m), k === "trend" ? "the flagship is a member of this style" : "monthly, to the index-matched trend book, 1990+"),
  );
  const w = state.styles.window;
  mount("chart-style-detail-nav", applyWindow(navFig(st.nav.dates, st.nav.nav, st.nav.dd, c, st.label + " composite"), st.nav.dates, w));
  const members = st.members.map(id => byId[id]).filter(Boolean);
  sortableTable($("#style-members"), [
    { key: "label", label: "Strategy", render: (v, r) => el("span", {}, [el("b", { text: v }), el("small", { style: "display:block;color:var(--ink-3);font-size:11.5px", text: r.rule })]) },
    { key: "sr_all", label: "Sharpe", num: true }, { key: "sr19", label: "2019+", num: true },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v) },
    { key: "max_dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) },
  ], members, { onRow: r => openStrategy(r.id) });
  const shades = members.map((_, i) => members.length === 1 ? c : rgba(c, 0.35 + 0.65 * (1 - i / Math.max(1, members.length - 1))));
  const mfig = { data: members.map((m, i) => ({ x: m.nav_m.dates, y: m.nav_m.values, _nav: m.nav_m.values, mode: "lines", name: m.label, line: { color: shades[i], width: m.id === META.flagship ? 2.4 : 1.3 }, hovertemplate: "%{y:.0f}<extra>" + m.label + "</extra>" })),
    layout: L({ height: 380, yaxis: { type: "log" }, hovermode: "closest", legend: { font: { size: 10.5 } } }) };
  mfig._rebase = true;
  mount("chart-style-members-nav", applyWindow(mfig, members[0]?.nav_m.dates, w), { after: n => highlightOnHover(n) });
  mount("chart-style-rolling", rollingSharpeFig(st.rolling.sharpe_1y, st.rolling.sharpe_3y, c));
  mount("chart-style-calendar", calendarFig(st.calendar, { height: 560 }));
  mount("chart-style-member-corr", st.member_corr.ids.length > 1 ? corrFig(st.member_corr.ids, st.member_corr.ids.map(labelOf), st.member_corr.matrix, { height: 360 })
    : { data: [], layout: L({ height: 200, annotations: [{ text: "One strategy in this style", showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5, font: { color: T.muted } }], xaxis: { visible: false }, yaxis: { visible: false } }) });
  const years = BENCH.dbmf_by_year.map(r => r.year);
  mount("chart-style-years-bars", barsByYear([years.map(y => ({ year: y, v: st.by_year.find(r => r.year === y)?.ret ?? null })), years.map(y => ({ year: y, v: BENCH.dbmf_by_year.find(r => r.year === y)?.ret ?? null }))], [c, T.bench], [st.label + " composite", "DBMF as traded"], { height: 300, years }));
  ddTable($("#style-dd"), st.drawdowns);
}
function ddTable(container, dds) {
  container.replaceChildren(buildTable([
    { key: "peak", label: "Peak", render: v => txt(dateLabel(v)) }, { key: "trough", label: "Trough", render: v => txt(dateLabel(v)) },
    { key: "recovery", label: "Recovery", render: v => txt(v ? dateLabel(v) : "not yet") },
    { key: "depth", label: "Depth", num: true, render: v => el("span", { class: "num down", text: pct(v, 1, false) }) }, { key: "days", label: "Days", num: true, nd: 0 },
  ], dds));
}
function highlightOnHover(node) {
  const base = node.data.map(t => t.line.width);
  node.on("plotly_hover", e => { const i = e.points[0].curveNumber; Plotly.restyle(node, { "line.width": node.data.map((_, j) => j === i ? 3 : base[j]), opacity: node.data.map((_, j) => j === i ? 1 : 0.35) }); });
  node.on("plotly_unhover", () => Plotly.restyle(node, { "line.width": base, opacity: 1 }));
}

// ── Strategy ─────────────────────────────────────────────────────────────────
async function initStrategy() {
  const sel = $("#strategy-select");
  sel.replaceChildren(...STYLES.order.map(k => el("optgroup", { label: META.styles[k].label }, S.strategies.filter(s => s.style === k).map(s => el("option", { value: s.id, text: s.label })))));
  sel.value = state.strategy.id;
  sel.addEventListener("change", () => { state.strategy.id = sel.value; writeHash(); renderStrategy(); });
  segFilter("strategy.window", WINDOWS, () => state.strategy.window, v => { state.strategy.window = v; renderStrategy(); });
  await renderStrategy();
}
async function renderStrategy() {
  const id = state.strategy.id, sum = byId[id];
  $("#strategy-select").value = id;
  const D = await load(`strategy/${id}.json`);
  const c = STYLE_C[sum.style], ts = D.tearsheet, w = state.strategy.window;
  const tag = $("#strategy-style-tag"); tag.className = `tag style st-${sum.style}`; tag.textContent = META.styles[sum.style].label;
  $("#strategy-kind").textContent = D.kind === "portfolio" ? "a portfolio-level book: vol-targeted, leverage-capped, in the Risk tab" : "a model-level strategy at its own 10% target";
  $("#strategy-name").textContent = sum.label;
  $("#strategy-meta").textContent = `${dateLabel(sum.start)} → ${dateLabel(sum.end)} · ${fmt(ts.all.n_years, 1)} years · ${D.ann === 365 ? "trades every day" : "futures, daily"}`;
  $("#strategy-desc").textContent = sum.desc;
  $("#strategy-rule").replaceChildren(el("b", { text: "The rule" }), txt(sum.rule));
  $("#strategy-tiles").replaceChildren(
    tile("Sharpe · whole sample", fmt(ts.all.sharpe), `${pctU(ts.all.ann_ret)} a year at ${pctU(ts.all.vol)} · Sortino ${fmt(ts.all.sortino)}`),
    tile("Sharpe · since 2019", fmt(ts.since_2019?.sharpe), `${pctU(ts.since_2019?.ann_ret)} a year · 3y ${fmt(ts.last_3y?.sharpe)}`),
    tile("This year", pct(sum.ytd), `3 months ${pct(sum.m3)} · 12 months ${pct(sum.m12)} · last year ${pct(sum.y_prev)}`, { cls: upDown(sum.ytd), spark: sum.spark }),
    tile("Max drawdown", pct(ts.all.max_dd, 1, false), `now ${pct(sum.dd_now, 1, false)} from the peak · Calmar ${fmt(ts.all.calmar)}`, { cls: "down" }),
    tile("Correlation to DBMF", fmt(D.bench.corr_w), `weekly, over the ETF's life · beta ${fmt(D.bench.beta_w)}`),
    tile("Turnover", isNum(D.activity.turnover_mean) ? fmt(D.activity.turnover_mean, 0) + "×" : "—", `gross notional a year ÷ capital · ${fmt(D.activity.cost_bps_mean, 0)} bps a year · ${fmt(sum.names_held, 0)} names held`),
  );
  mount("chart-s-nav", applyWindow(navFig(D.nav.dates, D.nav.nav, D.nav.dd, c, sum.label), D.nav.dates, w));
  const keys = ["all", "since_2005", "since_2019", "last_3y", "ytd"].filter(k => ts[k]);
  const lab = { all: "All", since_2005: "2005+", since_2019: "2019+", last_3y: "3 years", ytd: "This year" };
  const rows = [["Return, annualised", k => pctU(ts[k].ann_ret)], ["Volatility", k => pctU(ts[k].vol)], ["Sharpe", k => fmt(ts[k].sharpe)], ["Sortino", k => fmt(ts[k].sortino)], ["Max drawdown", k => pct(ts[k].max_dd, 1, false)], ["Calmar", k => fmt(ts[k].calmar)],
    ["Best year", k => `${ts[k].best_year[0]} ${pct(ts[k].best_year[1])}`], ["Worst year", k => `${ts[k].worst_year[0]} ${pct(ts[k].worst_year[1])}`], ["Years positive", k => pctU(ts[k].pct_years_pos, 0)], ["Months positive", k => pctU(ts[k].pct_months_pos, 0)],
    ["Best month", k => `${ts[k].best_month[0]} ${pct(ts[k].best_month[1])}`], ["Worst month", k => `${ts[k].worst_month[0]} ${pct(ts[k].worst_month[1])}`], ["Skew, daily / monthly", k => `${fmt(ts[k].skew_d)} / ${fmt(ts[k].skew_m)}`], ["Excess kurtosis, daily", k => fmt(ts[k].kurt_d, 1)]];
  $("#s-tear").replaceChildren(buildTable([{ key: "_m", label: "" }, ...keys.map(k => ({ key: k, label: lab[k], num: true, render: v => txt(v) }))], rows.map(([m, f]) => Object.fromEntries([["_m", m], ...keys.map(k => [k, f(k)])]))));
  mount("chart-s-calendar", calendarFig(D.calendar));
  const yrs = D.by_year;
  mount("chart-s-annual", { data: [{ x: yrs.map(r => r.year), y: yrs.map(r => r.ret * 100), type: "bar", name: "Return", marker: { color: yrs.map(r => r.ret >= 0 ? T.up : T.down) }, customdata: yrs.map(r => [r.sharpe, r.max_dd * 100]), hovertemplate: "%{x}: %{y:.1f}% · Sharpe %{customdata[0]:.2f} · max DD %{customdata[1]:.1f}%<extra></extra>" }],
    layout: L({ height: Math.max(360, 15 * yrs.length + 40), showlegend: false, hovermode: "closest", xaxis: { type: "category", showgrid: false }, yaxis: { ticksuffix: "%" } }) });
  mount("chart-s-rolling", rollingSharpeFig(D.rolling.sharpe_1y, D.rolling.sharpe_3y, c));
  const rc = D.bench.rolling_corr_w52;
  mount("chart-s-bench", rc ? { data: [{ x: rc.dates, y: rc.values, mode: "lines", name: "52-week correlation to DBMF", line: { color: c, width: 1.6 } }], layout: L({ height: 300, yaxis: { range: [-1, 1] }, shapes: [hline(0)] }) }
    : { data: [], layout: L({ height: 300, annotations: [{ text: "Too short a history against the ETF", showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5, font: { color: T.muted } }], xaxis: { visible: false }, yaxis: { visible: false } }) });
  const K = D.classes, ck = Object.keys(K.pnl_by_year);
  mount("chart-s-class-year", { data: [{ z: ck.map(k => K.pnl_by_year[k].map(v => isNum(v) ? v * 100 : null)), x: K.years.map(String), y: ck.map(k => CLS_LABEL[k] || k), type: "heatmap", colorscale: DIV, zmid: 0, zmin: -12, zmax: 12, showscale: false, xgap: 1, ygap: 1, hovertemplate: "%{y} %{x}: %{z:.2f}%<extra></extra>" }],
    layout: L({ height: Math.max(220, 34 * ck.length + 70), hovermode: "closest", xaxis: { tickfont: { size: 9 }, showgrid: false }, yaxis: { showgrid: false }, margin: { l: 8, t: 6 } }) });
  const yc = sortedEntries(K.ytd), ys = sortedEntries(K.ytd_sector);
  $("#s-ytd-title").replaceChildren(txt(`${META.last_bar.slice(0, 4)} by class and sector `), el("span", { class: "ctx", text: "% of capital · classes above, sectors beneath" }));
  mount("chart-s-ytd-class", { data: [
    { x: yc.map(r => CLS_LABEL[r[0]] || r[0]), y: yc.map(r => r[1] * 100), type: "bar", name: "By class", marker: { color: yc.map(r => CLS_C[r[0]] || T.muted) }, hovertemplate: "%{x}: %{y:.2f}%<extra></extra>", xaxis: "x", yaxis: "y" },
    { x: ys.map(r => r[0]), y: ys.map(r => r[1] * 100), type: "bar", name: "By sector", marker: { color: ys.map(r => r[1] >= 0 ? T.up : T.down) }, hovertemplate: "%{x}: %{y:.2f}%<extra></extra>", xaxis: "x2", yaxis: "y2" },
  ], layout: L({ height: 520, showlegend: false, hovermode: "closest", grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.64, 1], ticksuffix: "%" }, yaxis2: { domain: [0, 0.5], ticksuffix: "%" }, xaxis: { showgrid: false }, xaxis2: { showgrid: false, tickangle: -35, tickfont: { size: 9 }, automargin: true } }) });
  const gk = Object.keys(K.gross_q);
  mount("chart-s-exposure", { data: [
    ...gk.map(k => ({ x: K.gross_q[k].dates, y: K.gross_q[k].values, stackgroup: "g", mode: "lines", name: CLS_LABEL[k] || k, line: { width: 0.5, color: CLS_C[k] || T.muted }, fillcolor: rgba(CLS_C[k] || T.muted, 0.55), legendgroup: k, hovertemplate: "%{y:.2f}×<extra>" + (CLS_LABEL[k] || k) + " gross</extra>" })),
    ...gk.map(k => ({ x: K.net_q[k].dates, y: K.net_q[k].values, mode: "lines", name: CLS_LABEL[k] || k, line: { width: 1.2, color: CLS_C[k] || T.muted }, legendgroup: k, showlegend: false, xaxis: "x2", yaxis: "y2", hovertemplate: "%{y:.2f}×<extra>" + (CLS_LABEL[k] || k) + " net</extra>" })),
  ], layout: L({ height: 460, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×" }, yaxis2: { domain: [0, 0.44], ticksuffix: "×", zeroline: true }, xaxis: { anchor: "y" }, xaxis2: { anchor: "y2", matches: "x" } }) });
  const ty = Object.keys(D.activity.turnover_by_year);
  mount("chart-s-activity", { data: [
    { x: ty, y: ty.map(k => D.activity.turnover_by_year[k]), type: "bar", name: "Turnover, × capital", marker: { color: c }, hovertemplate: "%{x}: %{y:.0f}×<extra>turnover</extra>" },
    { x: ty, y: ty.map(k => D.activity.cost_bps_by_year[k]), type: "bar", name: "Cost, bps of capital", marker: { color: T.amber }, xaxis: "x2", yaxis: "y2", hovertemplate: "%{x}: %{y:.0f} bps<extra>cost</extra>" },
  ], layout: L({ height: 460, hovermode: "x", grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×" }, yaxis2: { domain: [0, 0.44] }, xaxis: { type: "category", showgrid: false }, xaxis2: { type: "category", showgrid: false, matches: "x" } }) });
  $("#s-pos-ctx").textContent = `${D.positions.length} positions at ${dateLabel(sum.end)} · weight in % of capital · vol · the signal · risk = |weight| × vol · this year's P&L from the market`;
  sortableTable($("#s-positions"), [
    { key: "symbol", label: "Market", cls: "sym" }, { key: "name", label: "", cls: "nm" }, { key: "class", label: "Class", render: v => txt(CLS_LABEL[v] || v) }, { key: "sector", label: "Sector" },
    { key: "weight", label: "Weight", num: true, render: v => signedPct(v, 1) }, { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v, 0)) },
    { key: "signal", label: "Signal", num: true, render: v => isNum(v) ? zbar(v, 2) : txt("—") }, { key: "risk", label: "Risk", num: true, render: v => txt(pctU(v, 2)) },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v, 2) },
  ], D.positions, { sortKey: "weight", desc: true });
  ddTable($("#s-dd"), D.drawdowns);
  const mid = D.dist_m.edges.slice(0, -1).map((v, i) => (v + D.dist_m.edges[i + 1]) / 2 * 100);
  mount("chart-s-dist", { data: [{ x: mid, y: D.dist_m.counts, type: "bar", name: "Months", marker: { color: mid.map(v => v >= 0 ? T.up : T.down) }, hovertemplate: "%{x:.1f}%: %{y} months<extra></extra>" }], layout: L({ height: 220, showlegend: false, hovermode: "x", bargap: 0.05, xaxis: { ticksuffix: "%" }, margin: { l: 36, b: 30 } }) });
  $("#s-config").textContent = D.config;
  for (const m of $$("#multiples .mini")) m.setAttribute("aria-current", m.title.startsWith(sum.label + ":") ? "true" : "false");
}

// ── Benchmark ────────────────────────────────────────────────────────────────
async function initBenchmark() {
  const B = BENCH.flagship;
  if (!B) { $("#tab-benchmark .grid").prepend(el("p", { class: "empty", text: "The flagship did not run." })); return; }
  $("#bench-tiles").replaceChildren(
    tile("Correlation, weekly", fmt(B.corr_w), `daily ${fmt(B.corr_d)} · monthly ${fmt(B.corr_m)} · ${B.start.slice(0, 4)}–${B.end.slice(0, 4)}`),
    tile("Beta to DBMF", fmt(B.beta_w), `weekly · tracking error ${pctU(B.te_w)} a year against DBMF at 10% vol`),
    tile("Flagship over the window", fmt(B.ours.sharpe), `${pctU(B.ours.ann_ret)} a year at ${pctU(B.ours.vol)} vol`),
    tile("DBMF over the window", fmt(B.bench.sharpe), `${pctU(B.bench.ann_ret)} a year at ${pctU(B.bench.vol)} vol · as traded`),
    tile("Flagship this year", pct(B.by_year[B.by_year.length - 1].ours), `at the 10% target`, { cls: upDown(B.by_year[B.by_year.length - 1].ours) }),
    tile("DBMF this year", pct(B.bench_ytd.total), `as traded, ${pctU(B.bench_ytd.vol)} vol · ≈ ${pct(B.bench_ytd.total * B.scale_to_10)} at 10% · to ${dateLabel(B.bench_ytd.end)}`, { cls: upDown(B.bench_ytd.total) }),
  );
  mount("chart-b-nav", { data: [
    { x: B.nav.dates, y: B.nav.ours, mode: "lines", name: "Index-matched trend, 10% target", line: { color: STYLE_C.trend, width: 2 } },
    { x: B.nav.dates, y: B.nav.bench, mode: "lines", name: "DBMF as traded", line: { color: T.bench, width: 1.4 } },
    { x: B.nav.dates, y: B.nav.bench_10, mode: "lines", name: "DBMF scaled to 10% vol", line: { color: T.bench, width: 1.2, dash: "dot" } },
  ], layout: L({ height: 400 }) });
  mount("chart-b-corr", { data: [
    { x: B.rolling_corr_w26.dates, y: B.rolling_corr_w26.values, mode: "lines", name: "26 weeks", line: { color: rgba(STYLE_C.trend, 0.55), width: 1 } },
    { x: B.rolling_corr_w52.dates, y: B.rolling_corr_w52.values, mode: "lines", name: "52 weeks", line: { color: STYLE_C.trend, width: 1.8 } },
  ], layout: L({ height: 400, yaxis: { range: [-0.2, 1] }, shapes: [hline(0)] }) });
  mount("chart-b-year", barsByYear([B.by_year.map(r => ({ year: r.year, v: r.ours })), B.by_year.map(r => ({ year: r.year, v: r.bench })), B.by_year.map(r => ({ year: r.year, v: r.bench_10 }))], [STYLE_C.trend, T.bench, rgba(T.bench, 0.45)], ["Index-matched trend", "DBMF as traded", "DBMF at 10% vol"], { height: 320 }));
  mount("chart-b-month", { data: [
    { x: B.by_month_ytd.map(r => r.month), y: B.by_month_ytd.map(r => r.ours * 100), type: "bar", name: "Index-matched trend", marker: { color: STYLE_C.trend }, hovertemplate: "%{y:.1f}%<extra>trend</extra>" },
    { x: B.by_month_ytd.map(r => r.month), y: B.by_month_ytd.map(r => isNum(r.bench) ? r.bench * 100 : null), type: "bar", name: "DBMF", marker: { color: T.bench }, hovertemplate: "%{y:.1f}%<extra>DBMF</extra>" },
  ], layout: L({ height: 320, barmode: "group", hovermode: "x", xaxis: { type: "category", showgrid: false }, yaxis: { ticksuffix: "%" } }) });
  const lad = [...BENCH.ladder].sort((a, b) => a.corr_w - b.corr_w);
  mount("chart-b-ladder", { data: [{ y: lad.map(r => r.label), x: lad.map(r => r.corr_w), type: "bar", orientation: "h", name: "Correlation", marker: { color: lad.map(r => STYLE_C[r.style]) }, text: lad.map(r => META.styles[r.style].label), textposition: "none", customdata: lad.map(r => r.beta_w), hovertemplate: "%{y} (%{text}): r %{x:.2f} · beta %{customdata:.2f}<extra></extra>" }],
    layout: L({ height: Math.max(380, 18 * lad.length + 40), hovermode: "closest", showlegend: false, xaxis: { range: [-0.5, 1], zeroline: true }, yaxis: { tickfont: { size: 10 }, showgrid: false }, margin: { l: 10, t: 6 } }) }, { after: n => n.on("plotly_click", e => { const r = lad[e.points[0].pointIndex]; if (r) openStrategy(r.id); }) });
  sortableTable($("#b-table"), [
    { key: "label", label: "Strategy", render: (v, r) => el("span", {}, [styleDot(r.style), txt(v)]) }, { key: "style", label: "Style", render: v => styleTag(v) },
    { key: "sr_window", label: "Sharpe, window", num: true }, { key: "ret_window", label: "Return a year", num: true, render: v => signedPct(v) },
    { key: "corr_w", label: "Corr DBMF", num: true }, { key: "beta_w", label: "Beta", num: true },
  ], BENCH.ladder, { sortKey: "corr_w", desc: true, onRow: r => openStrategy(r.id) });
  $("#b-note").innerHTML = `<b>Reading the ladder.</b> DBMF's own Sharpe over the window is ${fmt(BENCH.ladder[0]?.bench_sr)}. Trend strategies sit at the top of the ladder because the index is a trend index; carry, relative value and the alternative factors sit low because they answer different questions about the same markets, which is what makes them worth combining. DBMF prices at the New York close while most futures here settle earlier, which biases every daily correlation down; the weekly figure is the one to read. DBMF data to ${dateLabel(BENCH.dbmf_last)}.`;
}

// ── Markets ──────────────────────────────────────────────────────────────────
let SIG;
async function initMarkets() {
  SIG = await load("signals.json");
  if (!SIG.board) { $("#tab-markets .grid").prepend(el("p", { class: "empty", text: "No signals were built." })); return; }
  $("#markets-sub").textContent = `Every market in the universe at ${dateLabel(SIG.asof)}: the trend filter's score and position, the carry on the curve, and each rule's forecast on Carver's scale (average absolute 10, capped at ±20, positive for long). ${SIG.board.filter(r => r.in_book).length} of ${SIG.board.length} markets are in the flagship book today.`;
  const classes = [...new Set(SIG.board.map(r => r.class))].sort();
  segFilter("markets.cls", [["all", "All"], ...classes.map(c => [c, CLS_LABEL[c] || c])], () => state.markets.cls, v => { state.markets.cls = v; renderBoard(); });
  renderBoard();
  const U = [...SIG.board].filter(r => isNum(r.combined)).sort((a, b) => a.combined - b.combined);
  $("#m-universe-ctx").textContent = `every rule at the book's weights · FDM ${fmt(SIG.combined_fdm)} · coloured by class`;
  mount("chart-m-universe", { data: [{ y: U.map(r => r.symbol), x: U.map(r => r.combined), type: "bar", orientation: "h", name: "Combined forecast", marker: { color: U.map(r => CLS_C[r.class] || T.muted) }, text: U.map(r => `${r.name} · ${r.sector}`), textposition: "none", hovertemplate: "%{y} %{text}: %{x:.1f}<extra></extra>" }],
    layout: L({ height: Math.max(500, 11 * U.length + 30), showlegend: false, hovermode: "closest", xaxis: { range: [-21, 21], zeroline: true }, yaxis: { tickfont: { size: 8 }, showgrid: false }, margin: { l: 6, t: 6 } }) });
  const Tr = [...SIG.board].filter(r => isNum(r.trend)).sort((a, b) => a.trend - b.trend);
  mount("chart-m-trend-universe", { data: [{ y: Tr.map(r => r.symbol), x: Tr.map(r => r.trend), type: "bar", orientation: "h", name: "Trend score", marker: { color: Tr.map(r => r.in_book ? (CLS_C[r.class] || T.muted) : rgba(CLS_C[r.class] || T.muted, 0.3)) }, text: Tr.map(r => `${r.name} · ${r.in_book ? "held" : "not in the book"}`), textposition: "none", hovertemplate: "%{y} %{text}: %{x:.2f}<extra></extra>" }],
    layout: L({ height: Math.max(500, 11 * Tr.length + 30), showlegend: false, hovermode: "closest", xaxis: { range: [-2.1, 2.1], zeroline: true }, yaxis: { tickfont: { size: 8 }, showgrid: false }, margin: { l: 6, t: 6 } }) });
  // anatomy
  const A = SIG.anatomy;
  const steps = [
    ["1 · Universe", "Every market in the store that is listed today and trades more than $50m a day on average; one contract per underlying."],
    ["2 · Volatility", "A two-speed exponential estimate of each market's annualised vol (half-lives 5 and 10 days), floored at 5%, so a quiet market is never sized as if it were riskless."],
    ["3 · Vol-scaled returns", "Each day's return divided by that vol: a 1% move in a 10%-vol bond and a 3% move in a 30%-vol index both read as one unit."],
    ["4 · The filter", `One two-stage EWMA of the vol-scaled returns at group delay ${A.gd} days, normalised to a standard score. Positive is an uptrend; magnitude is conviction.`],
    ["5 · Cap and position", "The score is capped at ±2 and mapped linearly to a position: score × (10% ÷ vol) × the market's share of the budget."],
    ["6 · Budget, gearing, cap", "Class budgets rates 36 / equities 22 / commodities 22 / FX 19 / VIX 1, equal within class; the model gears to 10% on a 504-day correlation matrix; the portfolio re-targets 10% on 63-day realised vol; gross leverage is capped at 4×."],
  ];
  $("#steps").replaceChildren(...steps.map(([k, p]) => el("div", { class: "step" }, [el("span", { class: "k", text: k.split(" · ")[0] }), el("h4", { text: k.split(" · ")[1] }), el("p", { text: p })])));
  const sel = $("#market-select");
  const mk = Object.keys(A.markets);
  sel.replaceChildren(...mk.map(k => el("option", { value: k, text: `${k} · ${A.markets[k].name}` })));
  if (!state.markets.mkt || !A.markets[state.markets.mkt]) state.markets.mkt = mk[0];
  sel.value = state.markets.mkt;
  sel.addEventListener("change", () => { state.markets.mkt = sel.value; writeHash(); renderMarket(); });
  renderMarket();
  const ir = A.impulse; const tot = ir.reduce((a, b) => a + b, 0); let acc = 0; const cum = ir.map(v => (acc += v) / tot);
  $("#impulse-ctx").textContent = `impulse response at group delay ${A.gd} days · weight above, cumulative share beneath`;
  mount("chart-m-impulse", { data: [
    { x: ir.map((_, i) => i), y: ir, mode: "lines", name: "Weight on a return N days old (peak = 1)", line: { color: STYLE_C.trend, width: 1.8 }, fill: "tozeroy", fillcolor: rgba(STYLE_C.trend, 0.2) },
    { x: ir.map((_, i) => i), y: cum, mode: "lines", name: "Cumulative share of weight", line: { color: T.muted, width: 1.2 }, xaxis: "x2", yaxis: "y2" },
  ], layout: L({ height: 380, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1] }, yaxis2: { domain: [0, 0.44], range: [0, 1.05] }, xaxis: { showgrid: false }, xaxis2: { matches: "x", title: { text: "days ago", font: { size: 11, color: T.muted } } }, hovermode: "x", legend: { font: { size: 10.5 } } }) });
  if (SIG.carry) {
    const H = SIG.carry.history, ks = Object.keys(H);
    mount("chart-m-carry", { data: ks.map((k, i) => ({ x: H[k].dates, y: H[k].values.map(v => isNum(v) ? Math.max(-60, Math.min(60, v * 100)) : null), mode: "lines", name: k, line: { width: 1.1, color: Object.values(CLS_C)[i % 6] } })),
      layout: L({ height: 380, yaxis: { range: [-60, 60], ticksuffix: "%" }, shapes: [hline(0, "y", T.axis, "solid")], hovermode: "closest", legend: { font: { size: 10.5 } } }) });
  }
}
function renderBoard() {
  const rows = SIG.board.filter(r => state.markets.cls === "all" || r.class === state.markets.cls);
  $("#markets-count").textContent = `${rows.length} markets · ${rows.filter(r => r.in_book).length} held by the flagship`;
  const fc = (key) => ({ key, num: true, render: v => isNum(v) ? washCell(v, 1, 20) : txt("—") });
  sortableTable($("#market-board"), [
    { key: "symbol", label: "Market", cls: "sym" }, { key: "name", label: "", cls: "nm" }, { key: "class", label: "Class", render: v => txt(CLS_LABEL[v] || v) },
    { key: "trend", label: "Trend", num: true, title: "The flagship's filter score, capped at ±2", render: v => isNum(v) ? zbar(v, 2, "wide") : txt("—") },
    { key: "weight", label: "Position", num: true, title: "Weight in the flagship book, % of capital", render: (v, r) => isNum(v) && r.in_book ? signedPct(v, 1) : el("span", { class: "num", style: "color:var(--ink-4)", text: r.in_book ? "0.0%" : "—" }) },
    { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v, 0)) },
    { key: "carry_yield", label: "Carry", num: true, title: "Annualised carry as % of price: positive is backwardation", render: v => isNum(v) ? el("span", { class: "num " + upDown(v), text: pct(v, 1) }) : txt("—") },
    { ...fc("combined"), label: "Combined", title: "Every Carver rule at the book's weights, ±20" },
    { ...fc("ewmac16"), label: "EWMAC 16" }, { ...fc("ewmac64"), label: "EWMAC 64" }, { ...fc("carry"), label: "Carry rule" }, { ...fc("relcarry"), label: "Rel. carry" },
    { ...fc("relmom"), label: "Rel. mom." }, { ...fc("breakout"), label: "Breakout" }, { ...fc("skew"), label: "Skew" }, { ...fc("value"), label: "Value" }, { ...fc("accel"), label: "Accel." },
    { key: "xs_weight", label: "XS cmdty", num: true, title: "Weight in the commodity relative-momentum book", render: v => isNum(v) ? signedPct(v, 1) : txt("—") },
    { key: "ret_1m", label: "1m", num: true, render: v => signedPct(v, 1) }, { key: "ret_3m", label: "3m", num: true, render: v => signedPct(v, 1) }, { key: "ret_12m", label: "12m", num: true, render: v => signedPct(v, 1) },
  ], rows, { sortKey: "trend", desc: true, current: r => r.symbol === state.markets.mkt, onRow: r => { if (SIG.anatomy.markets[r.symbol]) { state.markets.mkt = r.symbol; $("#market-select").value = r.symbol; writeHash(); renderMarket(); document.getElementById("steps").scrollIntoView({ block: "start" }); } } });
}
function renderMarket() {
  const A = SIG.anatomy, m = A.markets[state.markets.mkt], R = SIG.rules, rm = R.markets[state.markets.mkt];
  if (!m) return;
  $("#market-desc").textContent = `${m.name} · ${CLS_LABEL[m.class] || m.class}`;
  mount("chart-m-anatomy", { data: [
    { x: m.dates, y: m.price, mode: "lines", name: "Price, rebased to 1", line: { color: T.ink2, width: 1.3 }, yaxis: "y" },
    { x: m.dates, y: m.vol.map(v => isNum(v) ? v * 100 : null), mode: "lines", name: "Annualised vol, %", line: { color: T.amber, width: 1.2 }, yaxis: "y2" },
    { x: m.dates, y: m.indicator, mode: "lines", name: "Filter score", line: { color: STYLE_C.trend, width: 1.4 }, yaxis: "y3" },
    { x: m.dates, y: m.position.map(v => isNum(v) ? v * 100 : null), mode: "lines", name: "Position, % of capital", line: { color: STYLE_C.relative, width: 1.3 }, fill: "tozeroy", fillcolor: rgba(STYLE_C.relative, 0.15), yaxis: "y4" },
    { x: m.dates, y: m.pnl_cum.map(v => isNum(v) ? v * 100 : null), mode: "lines", name: "Cumulative P&L from this market, % of capital", line: { color: STYLE_C.multi, width: 1.4 }, yaxis: "y5" },
  ], layout: L({ height: 760, grid: { rows: 5, columns: 1, roworder: "top to bottom" }, legend: { font: { size: 10.5 } },
    yaxis: { domain: [0.82, 1] }, yaxis2: { domain: [0.62, 0.79] }, yaxis3: { domain: [0.42, 0.59], range: [-2.6, 2.6] }, yaxis4: { domain: [0.22, 0.39] }, yaxis5: { domain: [0, 0.17] }, xaxis: { anchor: "y5" },
    shapes: [2, -2].map(v => hline(v, "y3"))}) });
  const SHOW = new Set(["EWMAC 16", "EWMAC 64", "Carry, 20-day", "Relative carry", "Breakout 80", "Skew 120"]);
  const pal = ["#7d93ff", "#ff6a4d", "#5ec8f0", "#ffb224", "#c39be8", "#8fd16a", "#f28fb5", "#d9b38c"];
  mount("chart-m-rules", { data: R.names.map((n, i) => ({ x: R.dates, y: rm.forecasts[n], mode: "lines", name: n, visible: SHOW.has(n) ? true : "legendonly", line: { width: 1.2, color: pal[i % pal.length], dash: i >= pal.length ? "dot" : "solid" } })),
    layout: L({ height: 760, yaxis: { range: [-21, 21] }, legend: { orientation: "v", x: 1.01, y: 1, font: { size: 10 } }, margin: { r: 170 }, shapes: [hline(20), hline(-20), hline(0, "y", T.axis, "solid")] }) });
  const today = R.names.map(n => { const a = rm.forecasts[n]; for (let i = a.length - 1; i >= 0; i--) if (isNum(a[i])) return a[i]; return null; });
  mount("chart-m-rules-today", { data: [{ y: R.names, x: today, type: "bar", orientation: "h", name: "Forecast today", marker: { color: today.map(v => v >= 0 ? T.up : T.down) }, hovertemplate: "%{y}: %{x:.1f}<extra></extra>" }],
    layout: L({ height: 380, showlegend: false, hovermode: "closest", xaxis: { range: [-21, 21], zeroline: true }, yaxis: { autorange: "reversed", tickfont: { size: 10 }, showgrid: false }, margin: { l: 6, t: 6 } }) });
}

// ── Risk ─────────────────────────────────────────────────────────────────────
async function initRisk() {
  const books = S.strategies.filter(s => s.kind === "portfolio");
  if (!books.length) return;
  if (!state.risk.book || !books.find(b => b.id === state.risk.book)) state.risk.book = META.flagship;
  segFilter("risk.book", books.map(b => [b.id, b.label]), () => state.risk.book, v => { state.risk.book = v; writeHash(); renderRisk(); });
  await renderRisk();
}
async function renderRisk() {
  const id = state.risk.book, sum = byId[id];
  if (!sum) return;
  const D = await load(`strategy/${id}.json`);
  const G = D.gearing, c = STYLE_C[sum.style];
  if (!G) return;
  const gross = G.gross.values.filter(isNum);
  $("#risk-tiles").replaceChildren(
    tile("Vol target", pctU(G.target, 0), `realised ${pctU(D.tearsheet.all.vol)} over the sample · ${pctU(D.tearsheet.since_2019?.vol)} since 2019`),
    tile("Gross exposure", fmt(sum.gross_mean, 1) + "×", `mean · now ${fmt(gross[gross.length - 1], 1)}× · cap ${G.cap ? G.cap + "×" : "none"}`),
    tile("Days at the cap", pctU(G.days_at_cap, 0), `since the start · ${pctU(G.days_at_cap_2019, 0)} since 2019`, { cls: G.days_at_cap > 0.25 ? "down" : "" }),
    tile("Markets held", fmt(sum.names_held, 0), `average · ${D.positions.length} today`),
    tile("Turnover", fmt(D.activity.turnover_mean, 0) + "×", `a year · ${fmt(D.activity.cost_bps_mean, 0)} bps of capital at ${META.cost_bps} bps`),
    tile("Drawdown now", pct(sum.dd_now, 1, false), `max ${pct(D.tearsheet.all.max_dd, 1, false)} · Calmar ${fmt(D.tearsheet.all.calmar)}`, { cls: sum.dd_now < -0.001 ? "down" : "" }),
  );
  const mk = Object.keys(G.model_factor);
  const pal = [c, T.amber, STYLE_C.relative, STYLE_C.multi];
  mount("chart-r-gearing", { data: [
    ...mk.map((k, i) => ({ x: G.model_factor[k].dates, y: G.model_factor[k].values, mode: "lines", name: `${labelOf(k)} scalar`, line: { color: pal[i % pal.length], width: 1.4 } })),
    ...mk.map((k, i) => ({ x: G.model_vol[k].dates, y: G.model_vol[k].values.map(v => v * 100), mode: "lines", name: `${labelOf(k)} pre-gearing vol, %`, line: { color: pal[i % pal.length], width: 1.2, dash: "dot" }, xaxis: "x2", yaxis: "y2" })),
  ], layout: L({ height: 440, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×" }, yaxis2: { domain: [0, 0.44], ticksuffix: "%" }, xaxis2: { matches: "x" }, legend: { font: { size: 10.5 } } }) });
  mount("chart-r-leverage", { data: [
    { x: G.portfolio_scalar.dates, y: G.portfolio_scalar.values, mode: "lines", name: "Portfolio scalar (vol target over 63 days)", line: { color: c, width: 1.4 } },
    { x: G.gross.dates, y: G.gross.values, mode: "lines", name: "Gross leverage, × capital", line: { color: T.amber, width: 1.3 }, xaxis: "x2", yaxis: "y2" },
  ], layout: L({ height: 440, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×" }, yaxis2: { domain: [0, 0.44], ticksuffix: "×", range: [0, (G.cap || Math.max(...gross)) + 0.5] }, xaxis2: { matches: "x" },
    shapes: G.cap ? [hline(G.cap, "y2", T.down)] : [], annotations: G.cap ? [{ xref: "paper", yref: "y2", x: 0.01, y: G.cap, text: `cap ${G.cap}×`, showarrow: false, font: { color: T.down, size: 10 }, yanchor: "bottom" }] : [], legend: { font: { size: 10.5 } } }) });
  mount("chart-r-vol", { data: [{ x: G.realised_vol_63.dates, y: G.realised_vol_63.values.map(v => v * 100), mode: "lines", name: "63-day realised vol, %", line: { color: c, width: 1.2 } }],
    layout: L({ height: 300, showlegend: false, shapes: [hline(G.target * 100, "y", T.amber, "dash")], yaxis: { ticksuffix: "%", rangemode: "tozero" } }) });
  mount("chart-r-names", { data: [{ x: D.activity.names_held.dates, y: D.activity.names_held.values, mode: "lines", name: "Markets held", line: { color: c, width: 1.3 }, fill: "tozeroy", fillcolor: rgba(c, 0.12) }], layout: L({ height: 300, showlegend: false }) });
  const K = D.classes, ck = Object.keys(K.names);
  const bud = D.budgets || {};
  mount("chart-r-alloc", { data: [
    ...(D.budgets ? [{ x: ck.map(k => CLS_LABEL[k] || k), y: ck.map(k => (bud[k] || 0) * 100), type: "bar", name: "Budget, frozen", marker: { color: ck.map(k => CLS_C[k] || T.muted) }, hovertemplate: "%{x}: %{y:.0f}%<extra>budget</extra>" }] : []),
    { x: ck.map(k => CLS_LABEL[k] || k), y: ck.map(k => (K.risk_share_2019[k] || 0) * 100), type: "bar", name: "Realised share of variance, 2019+", marker: { color: "rgba(242,245,251,0.6)" }, hovertemplate: "%{x}: %{y:.0f}%<extra>2019+</extra>" },
    { x: ck.map(k => CLS_LABEL[k] || k), y: ck.map(k => (K.risk_share_all[k] || 0) * 100), type: "bar", name: "Realised share of variance, whole sample", marker: { color: "rgba(242,245,251,0.28)" }, hovertemplate: "%{x}: %{y:.0f}%<extra>all</extra>" },
    { x: ck.map(k => CLS_LABEL[k] || k), y: ck.map(k => K.names[k]), type: "bar", name: "Markets in the class", marker: { color: ck.map(k => rgba(CLS_C[k] || T.muted, 0.7)) }, xaxis: "x2", yaxis: "y2", showlegend: false, hovertemplate: "%{x}: %{y} markets<extra></extra>" },
  ], layout: L({ height: 440, barmode: "group", hovermode: "x", grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.5, 1], ticksuffix: "%" }, yaxis2: { domain: [0, 0.36] }, xaxis: { showgrid: false }, xaxis2: { showgrid: false, matches: "x" }, legend: { font: { size: 10.5 } } }) });
  if (D.betas) {
    const b = D.betas;
    mount("chart-r-betas", { data: [
      { x: b.beta_ES.dates, y: b.beta_ES.values, mode: "lines", name: "Beta to the S&P 500", line: { color: STYLE_C.multi, width: 1.3 } },
      { x: b.beta_TY.dates, y: b.beta_TY.values, mode: "lines", name: "Beta to the 10-year note", line: { color: STYLE_C.trend, width: 1.3 } },
      { x: b.corr_ES.dates, y: b.corr_ES.values, mode: "lines", name: "Correlation to the S&P 500", line: { color: STYLE_C.multi, width: 1.1, dash: "dot" }, xaxis: "x2", yaxis: "y2" },
      { x: b.corr_TY.dates, y: b.corr_TY.values, mode: "lines", name: "Correlation to the 10-year", line: { color: STYLE_C.trend, width: 1.1, dash: "dot" }, xaxis: "x2", yaxis: "y2" },
    ], layout: L({ height: 440, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1] }, yaxis2: { domain: [0, 0.44], range: [-1, 1] }, xaxis2: { matches: "x" }, shapes: [hline(0, "y"), hline(0, "y2")], legend: { font: { size: 10.5 } } }) });
  } else {
    mount("chart-r-betas", { data: [], layout: L({ height: 300, annotations: [{ text: "No equity or bond future in this book's store", showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5, font: { color: T.muted } }], xaxis: { visible: false }, yaxis: { visible: false } }) });
  }
  const ty = Object.keys(D.activity.turnover_by_year);
  mount("chart-r-activity", { data: [
    { x: ty, y: ty.map(k => D.activity.turnover_by_year[k]), type: "bar", name: "Turnover, × capital", marker: { color: c } },
    { x: ty, y: ty.map(k => D.activity.cost_bps_by_year[k]), type: "bar", name: "Cost, bps of capital", marker: { color: T.amber }, xaxis: "x2", yaxis: "y2" },
  ], layout: L({ height: 440, hovermode: "x", grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×" }, yaxis2: { domain: [0, 0.44] }, xaxis: { type: "category", showgrid: false }, xaxis2: { type: "category", showgrid: false, matches: "x" } }) });
  $("#r-sleeves").replaceChildren(buildTable([
    { key: "id", label: "Model", render: v => el("span", {}, [byId[v] ? styleDot(byId[v].style) : null, txt(labelOf(v))]) },
    { key: "weight", label: "Risk weight", num: true, render: v => txt(pctU(v, 0)) }, { key: "timing", label: "Timing overlay" },
    { key: "id", label: "Sharpe 2019+", num: true, render: v => txt(fmt(byId[v]?.sr19)) }, { key: "id", label: "This year", num: true, render: v => signedPct(byId[v]?.ytd) },
  ], D.sleeves, { onRow: r => byId[r.id] && openStrategy(r.id) }));
  $("#r-note").innerHTML = `<b>How the book is scaled.</b> Each model gears itself to its own 10% on a long-window correlation matrix; the portfolio then re-targets ${pctU(G.target, 0)} on 63-day realised vol${G.cap ? `, under a hard ${G.cap}× gross-leverage cap that binds on ${pctU(G.days_at_cap, 0)} of days` : ""}. ${D.budgets ? "The class budget was set once and frozen; the realised share of variance differs from it because thirty equity indices move together and forty commodities do not." : "No class budget: equal weight by name inside each model, so the realised split follows the universe's breadth."} Mean gross ${fmt(sum.gross_mean, 1)}× capital; turnover ${fmt(D.activity.turnover_mean, 0)}× a year at ${fmt(D.activity.cost_bps_mean, 0)} bps.`;
  sortableTable($("#r-positions"), [
    { key: "symbol", label: "Market", cls: "sym" }, { key: "name", label: "", cls: "nm" }, { key: "class", label: "Class", render: v => txt(CLS_LABEL[v] || v) }, { key: "sector", label: "Sector" }, { key: "ccy", label: "Ccy" },
    { key: "weight", label: "Weight", num: true, render: v => signedPct(v, 1) }, { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v, 0)) },
    { key: "signal", label: "Signal", num: true, render: v => isNum(v) ? zbar(v, 2) : txt("—") }, { key: "risk", label: "Risk", num: true, render: v => txt(pctU(v, 2)) },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v, 2) },
  ], D.positions, { sortKey: "risk", desc: true });
}

// ── Methodology ──────────────────────────────────────────────────────────────
async function initMethodology() {
  const M = await load("method.json");
  const f = byId[META.flagship];
  const prose = $("#method-prose");
  prose.innerHTML = `
<h3>What this is</h3>
<p>One research platform, written to run any systematic macro strategy through the same stages: a universe filter, a volatility estimate, vol-normalised returns, a signal, a cross-sectional allocation, a gearing layer that targets risk, a cost model. Every strategy on this site is a configuration of those stages, run on the same data with the same cost assumption, so the numbers are comparable across styles. Nothing is re-fitted as new data arrives: the configurations were frozen on ${dateLabel(META.frozen_since)}, and anything after that date is a paper record rather than a backtest.</p>
<h3>The styles</h3>
<p>Strategies are grouped by what they ask of a market, not by who wrote them. <strong>Trend following</strong> asks whether each market is going up or down against its own past (time-series momentum). <strong>Carry</strong> asks what the futures curve pays for holding the position. <strong>Relative value</strong> asks which markets are strongest against their peers, and is market-neutral by construction. <strong>Multi-strategy</strong> books combine those at the forecast level or as sleeves. <strong>Risk premia</strong> holds everything long at equal risk and takes no view. <strong>Alternative factors</strong> are the rules from the literature (value, acceleration, skew) that are weak or wrong-signed on this universe, shown because the evidence is the point. <strong>Digital assets</strong> runs relative momentum on crypto perpetuals, on a separate store and venue.</p>
<p>A style's <strong>composite</strong> is the equal-weight average of its members' daily returns, scaled by one constant so that its volatility over the whole sample is 10%. The scaling is for comparability across styles with different member counts; it changes the level of every composite's return and nothing about its Sharpe or its correlations.</p>
<h3>Where the strategies come from</h3>
<p>Twenty-four of the strategies are Robert Carver's, from <em>Advanced Futures Trading Strategies</em>, built from the book's own code chapter by chapter with the book's scalars, caps and diversification multipliers; the remaining six and what each needs are listed beside this text. The trend ensemble, the shop replica and the cross-sectional momentum books are this platform's own. The flagship, <strong>${f?.label || "the index-matched trend book"}</strong>, is a single slow filter whose speed and class budget were calibrated to the SG CTA index once and frozen (below).</p>
<h3>Data and costs</h3>
<ul>
<li><strong>Prices:</strong> Norgate continuous futures, back-adjusted for rolls, with the contract's delivery month recorded daily; ${META.n_markets} markets in the store, a strategy holds those that pass a listing check and a $50m average-daily-value screen, one contract per underlying. Crypto: ${META.n_crypto} Kraken perpetuals, daily.</li>
<li><strong>Carry:</strong> built from every individual contract: the held contract's price minus the next one's, annualised by the months between them, in price units. Positive is backwardation.</li>
<li><strong>Missing data:</strong> a market that did not trade has no return; every stage holds its last estimate through a gap rather than inventing a zero.</li>
<li><strong>Costs:</strong> a flat ${META.cost_bps} bps on traded notional, no slippage beyond that, no financing, no fee. An institutional programme would pay about this; a small account would pay more, and the high-turnover rules (adjusted trend, breakout) suffer most.</li>
<li><strong>Units:</strong> returns are in % of capital at each book's 10% vol target. The SG CTA index runs near 13%; "DBMF at 10% vol" divides the ETF's returns by that ratio.</li>
<li><strong>No live track record.</strong> Everything is simulated on end-of-day data; the configurations are shown verbatim on every strategy's page.</li>
</ul>
<h3>The benchmark and the calibration</h3>
<p>The <strong>SG CTA Index</strong> tracks the largest trend-following managers, equally weighted and reconstituted yearly. It is licensed, so the public proxy here is <strong>DBMF</strong> (iMGP DBi Managed Futures Strategy ETF), whose objective is to replicate the index before fees; adjusted closes come from Yahoo Finance. Two things in the flagship were calibrated against it, once, and frozen.</p>
<h4>1. The class split</h4>
<p>The model's per-class P&amp;L was regressed on DBMF's weekly returns with a non-negative ridge penalty toward an industry prior, the shrinkage chosen by leave-one-year-out cross-validation. The data moved the prior toward more rates and no crypto:</p>
<div class="tablewrap" id="fit-table"></div>
<p>Equal weight by name scores ${fmt(M.equal_weight_cv, 3)} on the same cross-validation.</p>
<h4>2. The speed</h4>
<p>Single filters from 70 to 120 days of group delay, on the frozen budgets, over 2026 to mid-September against DBMF:</p>
<div class="tablewrap" id="gd-table"></div>
<p>Slower raised the year's level monotonically and the 2019+ Sharpe with it; the correlation fell monotonically. 110 was chosen as the point where the book at the index's vol landed on the index's level.</p>`;
  $("#fit-table").replaceChildren(buildTable([{ key: "lam", label: "Shrinkage λ" }, { key: "ins", label: "In-sample r", num: true, nd: 3 }, { key: "cv", label: "Cross-validated r", num: true, nd: 3 }, { key: "rates", label: "Rates", num: true }, { key: "equity_index", label: "Equities", num: true }, { key: "commodity", label: "Commodities", num: true }, { key: "fx", label: "FX", num: true }, { key: "crypto", label: "Crypto", num: true }, { key: "volatility", label: "VIX", num: true }], M.budget_fit));
  $("#gd-table").replaceChildren(buildTable([{ key: "gd", label: "Group delay" }, { key: "ytd", label: "YTD %", num: true, nd: 1 }, { key: "ytd10", label: "At DBMF's vol %", num: true, nd: 1 }, { key: "mar", label: "March", num: true, nd: 1 }, { key: "apr", label: "April", num: true, nd: 1 }, { key: "corr26", label: "Corr 2026", num: true }, { key: "te", label: "Tracking error %", num: true, nd: 1 }, { key: "sr19", label: "Sharpe 2019+", num: true }], M.gd_sweep));
  const G = [
    ["g-sharpe", "Sharpe ratio", "Annualised mean daily return divided by annualised daily volatility, net of costs, with no risk-free rate subtracted (futures are unfunded). Windows: the whole sample from 1990 or the strategy's start, 2005+, 2019+, the last three years, this year."],
    ["g-sortino", "Sortino", "As the Sharpe, with the volatility of negative days in the denominator."],
    ["g-dd", "Drawdown", "The fall from the running peak of the growth of 100, in %. Max drawdown is the deepest; 'now' is today's distance from the peak. Calmar is annualised return over max drawdown."],
    ["g-composite", "Style composite", "The equal-weight average of a style's members' daily returns, multiplied by one constant so its whole-sample volatility is 10%. The constant is shown on the style's page."],
    ["g-nav", "Growth of 100", "100 compounded by the daily returns, drawn weekly; the log scale makes equal percentage moves equal distances. Windows other than 'All' rebase to 100 at the window's start."],
    ["g-corr", "Correlation", "To DBMF: weekly returns over the ETF's life. Between strategies and styles: monthly returns from 1990. The daily correlation to DBMF is biased down because the ETF prices at the New York close and most futures settle earlier."],
    ["g-beta", "Beta", "The slope of a strategy's weekly return on DBMF's. Tracking error is the annualised volatility of the weekly difference to DBMF scaled to 10% vol."],
    ["g-turnover", "Turnover", "Gross notional traded in a year divided by capital. Cost is turnover × 2 bps, in bps of capital."],
    ["g-gross", "Gross and net exposure", "Gross: the sum of absolute position weights, × capital. Net: longs minus shorts within a class. The leverage cap applies to gross."],
    ["g-forecast", "Forecast (Carver's scale)", "Every Carver rule emits a number with average absolute value 10, capped at ±20, positive for long. The combined forecast weights every rule and multiplies by the forecast diversification multiplier (FDM)."],
    ["g-trend", "Trend score", "The flagship's filter output: a two-stage EWMA of vol-scaled returns at group delay 110, normalised to a standard score and capped at ±2."],
    ["g-carry", "Carry", "Held contract price minus the next contract's, annualised by the months between them, as % of price. Positive is backwardation."],
    ["g-gearing", "Gearing", "Two layers. The model's scalar prices today's book on a 504-day correlation matrix and scales to 10%; the portfolio's scalar re-targets on 63-day realised vol. A hard gross-leverage cap sits above both."],
    ["g-budget", "Budget against realised risk", "The class budget is the share of vol-normalised risk assigned in advance. The realised share is each class's covariance with the book divided by the book's variance; they differ because classes differ in internal correlation."],
    ["g-window", "Over the ETF's life", "DBMF's inception in 2019 to the last bar; the common window on which every strategy is compared with the benchmark proxy."],
  ];
  $("#glossary").replaceChildren(...G.map(([id, t, d]) => el("dl", { id }, [el("dt", { text: t }), el("dd", { text: d })])));
  $("#not-built").replaceChildren(buildTable([{ key: "n", label: "#" }, { key: "name", label: "Strategy" }, { key: "why", label: "Why not, and what it needs", render: v => el("span", { style: "white-space:normal", text: v }) }], M.not_built));
  const U = M.universe;
  const cls = [...new Set(U.map(r => r.class))];
  mount("chart-universe", { data: [
    { x: cls.map(k => CLS_LABEL[k] || k), y: cls.map(k => U.filter(r => r.class === k && r.held).length), type: "bar", name: "Held by the flagship today", marker: { color: cls.map(k => CLS_C[k] || T.muted) } },
    { x: cls.map(k => CLS_LABEL[k] || k), y: cls.map(k => U.filter(r => r.class === k && !r.held).length), type: "bar", name: "In the store, not held", marker: { color: cls.map(k => rgba(CLS_C[k] || T.muted, 0.3)) } },
  ], layout: L({ height: 320, barmode: "stack", hovermode: "x", xaxis: { showgrid: false } }) });
  $("#universe-ctx").textContent = `${U.length} futures markets${M.crypto_universe.length ? ` · ${M.crypto_universe.length} crypto perpetuals in the separate store` : ""} · data from the first date shown`;
  sortableTable($("#universe-table"), [
    { key: "symbol", label: "Market", cls: "sym" }, { key: "name", label: "" }, { key: "class", label: "Class", render: v => txt(CLS_LABEL[v] || v) }, { key: "sector", label: "Sector" }, { key: "ccy", label: "Ccy" },
    { key: "start", label: "From" }, { key: "held", label: "In the flagship", render: v => el("span", { class: "status " + (v ? "current" : "none") }, [el("span", { class: "dot", style: v ? "background:var(--good)" : "background:var(--axis)" }), txt(v ? "held" : "—")]) },
  ], U, { sortKey: "class" });
}

main().catch(err => { console.error(err); $("#main").prepend(el("p", { class: "empty", text: "The Quant Desk could not load its data: " + err.message })); });
