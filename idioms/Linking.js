// Linking.js
//
// Browser glue for the shared selection model (core/linking.js).
//
// Every view talks to the others only through this module:
//   • clicks/brushes  → toggleSelected(source, field, values) / setSelected / clearSelection
//   • hovers          → setHover(source, predicate) / clearHover()
//   • painting        → onSelectionChange(cb) / onHoverChange(cb), where cb gets a
//                       summary: summary.has("sets", "Dominaria"), summary.get("years")…
//
// Sources in use: "alluvial" (pairs), "icicle" (identities), "timeline"
// (sets, setTypes), "years" (years — shared by the Line chart and the Timeline
// year ticks), "scatter" (names, added on top of the others).
//
// Summaries are computed on the printings of the current filtered set, so a
// selection survives filter changes and is re-evaluated against the new data.

import { updateState } from "../state.js";
import { createLinker, isEmptyPredicate } from "../core/index.js";

let linker = null;
let filteredMask = null;
let selection = new Map(); // source → predicate
let hover = null; // { source, predicate } | null

let selectionSummary = null;
let hoverSummary = null;
const selectionListeners = new Set();
const hoverListeners = new Set();

function emptySummary() {
  return linker ? linker.summarize(null) : { count: 0, active: false, get: () => new Map(), has: () => false };
}

/** Called once the data and filter engine exist. */
export function initLinking(cards, engine) {
  linker = createLinker(cards, engine);
}

function recomputeSelection() {
  selectionSummary = linker.summarize(linker.selectionMask(selection, filteredMask));
  updateState({ selection });
  selectionListeners.forEach((cb) => cb(selectionSummary, selection));
}

function recomputeHover() {
  hoverSummary =
    hover && !isEmptyPredicate(hover.predicate)
      ? linker.summarize(linker.predicateMask(hover.predicate, filteredMask))
      : emptySummary();
  hoverListeners.forEach((cb) => cb(hoverSummary, hover));
}

/** Re-evaluate selection and hover after the filtered set changed. */
export function setFilteredMask(mask) {
  filteredMask = mask;
  if (!linker) return;
  recomputeSelection();
  recomputeHover();
}

// --- Subscriptions ----------------------------------------------------------

export function onSelectionChange(cb) {
  selectionListeners.add(cb);
}
export function onHoverChange(cb) {
  hoverListeners.add(cb);
}
export function getSelectionSummary() {
  return selectionSummary || emptySummary();
}
export function getHoverSummary() {
  return hoverSummary || emptySummary();
}
/** The predicate a source currently contributes (or undefined). */
export function getSourcePredicate(source) {
  return selection.get(source);
}

// --- Selection ----------------------------------------------------------------

/** Replace a source's predicate (null/empty removes it). */
export function setSelected(source, predicate) {
  const next = new Map(selection);
  if (isEmptyPredicate(predicate)) next.delete(source);
  else next.set(source, predicate);
  selection = next;
  recomputeSelection();
}

/**
 * Toggle values of one field of a source. With several values (e.g. all
 * identities of an Icicle color group) they are removed if all are already
 * selected, otherwise added.
 */
export function toggleSelected(source, field, values) {
  const pred = { ...(selection.get(source) || {}) };
  const set = new Set(pred[field] || []);
  const allIn = values.length > 0 && values.every((v) => set.has(v));
  for (const v of values) allIn ? set.delete(v) : set.add(v);
  pred[field] = set;
  setSelected(source, pred);
}

/** Clear one source, or everything when called without arguments. */
export function clearSelection(source) {
  if (source === undefined) {
    if (selection.size === 0) return;
    selection = new Map();
    recomputeSelection();
  } else if (selection.has(source)) {
    setSelected(source, null);
  }
}

// --- Hover --------------------------------------------------------------------

export function setHover(source, predicate) {
  hover = { source, predicate };
  recomputeHover();
}

export function clearHover() {
  if (hover === null) return;
  hover = null;
  recomputeHover();
}

// Test/debug hook.
if (typeof window !== "undefined") {
  window.__linking = {
    selection: () => selection,
    selectionCount: () => getSelectionSummary().count,
    hoverCount: () => getHoverSummary().count,
  };
}
