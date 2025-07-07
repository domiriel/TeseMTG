// events.js
const emitter = new EventTarget();



// Scatterplot events
export function emitHoverCard(card) {
  emitter.dispatchEvent(new CustomEvent("card-hover", { detail: card }));
}

export function emitClearHover() {
  emitter.dispatchEvent(new Event("card-hover-clear"));
}

export function onHoverCard(callback) {
  emitter.addEventListener("card-hover", e => callback(e.detail));
}

export function onClearHover(callback) {
  emitter.addEventListener("card-hover-clear", callback);
}


//TimelineEvents

export function emitSetHover(setInfo) {
  emitter.dispatchEvent(new CustomEvent("set-hover", { detail: setInfo }));
}
export function onSetHover(callback) {
  emitter.addEventListener("set-hover", e => callback(e.detail));
}
export function emitClearSetHover() {
  emitter.dispatchEvent(new Event("set-hover-clear"));
}
export function onClearSetHover(callback) {
  emitter.addEventListener("set-hover-clear", callback);
}



let yearClickHandlers = [];
export function onYearClick(handler) {
  yearClickHandlers.push(handler);
}
export function emitYearClick(payload) {
  yearClickHandlers.forEach(fn => fn(payload));
}


let setClickHandlers = [];
export function onTimelineSetClick(handler) {
  setClickHandlers.push(handler);
}
export function emitTimelineSetClick(payload) {
  setClickHandlers.forEach(fn => fn(payload));
}


let icicleClickHandlers = [];

export function onIcicleClick(handler) {
  icicleClickHandlers.push(handler);
}

export function emitIcicleClick(payload) {
  icicleClickHandlers.forEach(fn => fn(payload));
}

//Icicle Events

export function emitIcicleRectHover(rectInfo){
    emitter.dispatchEvent(new CustomEvent ("rect-hover", {detail: rectInfo}));
}

export function onRectHover(callback) {
    emitter.addEventListener("rect-hover", e => callback(e.detail));
}

export function emitClearRectHover() {
  emitter.dispatchEvent(new Event("rect-hover-clear"));
}

export function onClearRectHover(callback){
     emitter.addEventListener("rect-hover-clear", callback);
}


// Icicle Number of Colors Hover Events
export function emitNumColorsHover(payload) {
  emitter.dispatchEvent(new CustomEvent("num-colors-hover", { detail: payload }));
}
export function onNumColorsHover(callback) {
  emitter.addEventListener("num-colors-hover", e => callback(e.detail));
}
export function emitClearNumColorsHover() {
  emitter.dispatchEvent(new Event("num-colors-hover-clear"));
}
export function onClearNumColorsHover(callback) {
  emitter.addEventListener("num-colors-hover-clear", callback);
}

let icicleNumClickHandlers = [];

export function onIcicleNumClick(handler) {
  icicleNumClickHandlers.push(handler);
}

export function emitIcicleNumClick(payload) {
  icicleNumClickHandlers.forEach(fn => fn(payload));
}
//Line Events

export function emitLineYearHover(yearInfo) {
  emitter.dispatchEvent(new CustomEvent("line-year-hover", { detail: yearInfo }));
}
export function onLineYearHover(callback) {
  emitter.addEventListener("line-year-hover", e => callback(e.detail));
}
export function emitClearLineYearHover() {
  emitter.dispatchEvent(new Event("line-year-hover-clear"));
}
export function onClearLineYearHover(callback) {
  emitter.addEventListener("line-year-hover-clear", callback);
}

let lineChartClickHandlers = [];

export function onLineChartClick(handler) {
  lineChartClickHandlers.push(handler);
}

export function emitLineChartClick(payload) {
  lineChartClickHandlers.forEach(fn => fn(payload));
}

// Alluvial Events

export function emitAlluvialHover(category, value) {
  emitter.dispatchEvent(new CustomEvent("alluvial-hover", {
    detail: { category, value }
  }));
}

export function onAlluvialHover(callback) {
  emitter.addEventListener("alluvial-hover", e => callback(e.detail));
}

export function emitClearAlluvialHover() {
  emitter.dispatchEvent(new Event("alluvial-hover-clear"));
}

export function onClearAlluvialHover(callback) {
  emitter.addEventListener("alluvial-hover-clear", callback);
}

let alluvialClickHandlers = [];
export function onAlluvialClick(handler) {
  alluvialClickHandlers.push(handler);
}
export function emitAlluvialClick(payload) {
  alluvialClickHandlers.forEach(fn => fn(payload));
}

let alluvialLinkClickHandlers = [];
export function onAlluvialLinkClick(handler) {
  alluvialLinkClickHandlers.push(handler);
}
export function emitAlluvialLinkClick(payload) {
  alluvialLinkClickHandlers.forEach(fn => fn(payload));
}