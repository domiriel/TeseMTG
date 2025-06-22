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