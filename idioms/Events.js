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