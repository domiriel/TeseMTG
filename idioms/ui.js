// ui.js — small UI helpers shared by every view (tooltip, info icon, colors).

const TOOLTIP_PAD = 10;

/** Show the shared #tooltip with some HTML (optionally positioned at an event). */
export function showTooltip(html, event) {
  const tooltip = d3.select("#tooltip").style("display", "block").html(html);
  if (event) moveTooltip(event);
  return tooltip;
}

/**
 * Place the tooltip next to the pointer, flipping to the other side of the
 * cursor when it would overflow the window, and never off-screen.
 */
export function moveTooltip(event) {
  const tooltip = d3.select("#tooltip");
  const node = tooltip.node();
  if (!node) return;
  const w = node.offsetWidth;
  const h = node.offsetHeight;

  let x = event.pageX + TOOLTIP_PAD;
  if (x + w > window.scrollX + window.innerWidth) x = event.pageX - w - TOOLTIP_PAD;
  let y = event.pageY + TOOLTIP_PAD;
  if (y + h > window.scrollY + window.innerHeight) y = event.pageY - h - TOOLTIP_PAD;

  tooltip.style("left", `${Math.max(x, TOOLTIP_PAD)}px`).style("top", `${Math.max(y, TOOLTIP_PAD)}px`);
}

/** Hide the tooltip and undo per-view styling (background, color, font size). */
export function hideTooltip() {
  d3.select("#tooltip")
    .style("display", "none")
    .style("background", null)
    .style("color", null)
    .style("font-size", null);
}

/** The round "?" help icon each chart shows in a corner. */
export function addInfoIcon(svg, { x, y, radius, fontSize, html }) {
  const g = svg.append("g").attr("class", "info-icon").attr("transform", `translate(${x}, ${y})`);
  g.append("circle").attr("r", radius).attr("fill", "#8A9CE4").attr("stroke", "#fff");
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("font-size", `${fontSize}px`)
    .attr("font-weight", "bold")
    .attr("fill", "#fff")
    .attr("pointer-events", "none")
    .text("?");
  g.on("mouseover", (event) => showTooltip(html, event))
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip);
  return g;
}

// --- Five-step palettes (by percentage 0–100) used by Alluvial and Timeline --

const BASE = ["#ffd394", "#d3ae7c", "#a98b66", "#806a4f", "#594a3a"];
const HIGHLIGHT = ["#ffca00", "#e7b006", "#ce970b", "#b5800d", "#9b690d"];
const SELECTED = ["#c7daff", "#a2b1d3", "#7d89a8", "#5b6380", "#3a4059"];

const step = (percentage) => (percentage < 20 ? 0 : percentage < 40 ? 1 : percentage < 60 ? 2 : percentage < 80 ? 3 : 4);

export const getDiscreteColor = (percentage) => BASE[step(percentage)];
export const getHighlightedColor = (percentage) => HIGHLIGHT[step(percentage)];
export const getSelectedColor = (percentage) => SELECTED[step(percentage)];

// --- Card color identity as a tooltip background ------------------------------

const IDENTITY_TINTS = { W: "#f6f1d5", U: "#b3d9ff", R: "#f8b3a0", B: "#c8b4c0", G: "#b6d7b3" };
const WUBRG = { W: 0, U: 1, B: 2, R: 3, G: 4 };

/** Solid tint for one color, a left-to-right gradient for several, grey for none. */
export function colorIdentityBackground(colorIdentity) {
  if (!Array.isArray(colorIdentity) || colorIdentity.length === 0) return "#888";
  const colors = [...colorIdentity]
    .sort((a, b) => WUBRG[a] - WUBRG[b])
    .map((c) => IDENTITY_TINTS[c])
    .filter(Boolean);
  if (colors.length === 1) return colors[0];
  const stepPct = 100 / (colors.length - 1);
  return `linear-gradient(to right, ${colors.map((c, i) => `${c} ${i * stepPct}%`).join(", ")})`;
}
