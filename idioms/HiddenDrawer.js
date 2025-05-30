let drawerContainer = null;
let drawerButton = null; 
import { updateState, getState } from "../state.js";
export function createHiddenDrawer(containerSelector = "body") {
  const container = d3.select(containerSelector);

  // Drawer first
  drawerContainer = container.append("div")
    .attr("id", "hiddenDrawer")
    .attr("class", "drawer")
    .html(`<div id="cardImages"></div>`);

  // Then button separately
  drawerButton = container.append("button")
    .attr("id", "toggleDrawerButton")
    .on("click", () => {
      const isVisible = drawerContainer.classed("visible");
      drawerContainer.classed("visible", !isVisible);
      updateButtonLabel(cardsInDrawer.length);
    });

  updateButtonLabel(0);
}




// Call this to update hovered card images
let cardsInDrawer = []; // store current list

export function updateDrawer(cards = []) {
  if (!drawerContainer) return;

  cardsInDrawer = cards;
  updateButtonLabel(cards.length);

  const cardArea = drawerContainer.select("#cardImages");

  // Clear and redraw all
  cardArea.selectAll("*").remove();

  cards.forEach((card, index) => {
    const cardWrapper = cardArea.append("div")
      .style("position", "relative")
      .style("margin-bottom", "12px");

    cardWrapper.append("img")
      .attr("src", card.image_normal)
      .attr("alt", card.name)
      .style("width", "100%")
      .style("border-radius", "8px")
      .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");

    // Add the ❌ button
    cardWrapper.append("button")
      .text("✕")
      .attr("title", "Remove this card")
      .style("position", "absolute")
      .style("top", "5px")
      .style("right", "5px")
      .style("background", "#ff4444")
      .style("color", "white")
      .style("border", "none")
      .style("border-radius", "50%")
      .style("width", "24px")
      .style("height", "24px")
      .style("cursor", "pointer")
      .style("font-weight", "bold")
      .on("click", () => {
         const newHoveredCards = cardsInDrawer.filter(c => c.name !== card.name);
         updateState({ hoveredCards: newHoveredCards });
      });
    cardWrapper.append("button")
  .text(`Show Sets (${card.all_sets?.length || 0})`)
  .style("margin-top", "6px")
  .style("padding", "4px 8px")
  .style("font-size", "13px")
  .style("background", "#007bff")
  .style("color", "white")
  .style("border", "none")
  .style("border-radius", "4px")
  .style("cursor", "pointer")
  .on("click", () => {
    if (!Array.isArray(card.all_sets)) return;

    const currentState = getState();
    const newSetFilter = new Set(currentState.selectedFilters["Set Names"] || []);

    card.all_sets.forEach(set => newSetFilter.add(set.name));
     updateState({
      selectedFilters: {
        ...currentState.selectedFilters,
        "Set Names": newSetFilter
      },
      updateContext: "TimelineFilter"
    });
     const selectedSetNames = newSetFilter;
    d3.selectAll(".set-rect")
      .attr("fill", d => selectedSetNames.has(d.name) ? "#007bff" : "#C3C3C3");
    });
  });


}


function updateButtonLabel(count) {
  if (drawerButton && drawerContainer) {
    const isVisible = drawerContainer.classed("visible");
    const arrow = isVisible ? "→" : "←"; // ← to open, → to close
    drawerButton.html(`${arrow} (${count})`);
  }
}

