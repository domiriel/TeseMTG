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

  const t0 = performance.now();

  cardsInDrawer = cards;
  updateButtonLabel(cards.length);

  const cardArea = drawerContainer.select("#cardImages");

  const t1 = performance.now();

  // Data join
  const cardSel = cardArea.selectAll(".card-wrapper").data(cards, d => d.name);
  cardSel.exit().remove();
  const cardEnter = cardSel.enter()
    .append("div")
    .attr("class", "card-wrapper")
    .style("position", "relative")
    .style("margin-bottom", "12px");

  cardEnter.append("img")
    .attr("alt", d => d.name)
    .style("width", "100%")
    .style("border-radius", "8px")
    .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");

  cardEnter.append("div")
    .attr("class", "nav-wrapper")
    .style("margin-top", "4px")
    .style("display", "flex")
    .style("gap", "6px")
    .style("justify-content", "center");

  cardEnter.append("button").attr("class", "remove-card");
  cardEnter.append("button").attr("class", "show-sets-btn");

  const t2 = performance.now();

  const cardMerge = cardEnter.merge(cardSel);

  cardMerge.each((card, i, nodes) => {
    const wrapper = d3.select(nodes[i]);
    if (typeof card.selectedPrintIndex !== "number") card.selectedPrintIndex = 0;

    const idx = card.selectedPrintIndex;
    card.image_normal = card.all_print_images[idx];
    card.tooltip_image = card.image_normal;

    wrapper.select("img").attr("src", card.image_normal);

    const navWrapper = wrapper.select(".nav-wrapper").html("");

    navWrapper.append("button")
      .text("◀")
      .attr("title", "Previous print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx = (card.selectedPrintIndex - 1 + card.all_print_images.length) % card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.tooltip_image = card.all_print_images[newIdx];

        const dot = d3.selectAll(".dots circle").filter(d => d.name === card.name).datum();
        if (dot) {
          dot.tooltip_image = card.tooltip_image;
          const tooltip = d3.select("#tooltip");
          if (!tooltip.empty() && tooltip.style("display") !== "none") {
            mouseoverFn(null, dot);
          }
        }

        wrapper.select("img").attr("src", card.tooltip_image);
      });

    navWrapper.append("button")
      .text("▶")
      .attr("title", "Next print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx = (card.selectedPrintIndex + 1) % card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.tooltip_image = card.all_print_images[newIdx];
        wrapper.select("img").attr("src", card.tooltip_image);
      });

    wrapper.select(".remove-card")
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
        const newHovered = cardsInDrawer.filter(c => c.name !== card.name);
        updateState({ hoveredCards: newHovered, isHoverUpdate: true });

        d3.selectAll(".dots circle")
          .filter(d => d.name === card.name)
          .classed("selected-hover", false);
      });

    wrapper.select(".show-sets-btn")
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
        const curr = getState();
        const newFilter = new Set(curr.selectedFilters["Set Names"] || []);
        card.all_sets.forEach(set => newFilter.add(set.name));
        updateState({
          selectedFilters: {
            ...curr.selectedFilters,
            "Set Names": newFilter
          },
          updateContext: "TimelineFilter"
        });
        d3.selectAll(".set-rect")
          .attr("fill", d => newFilter.has(d.name) ? "#007bff" : "#C3C3C3");
      });
  });

  const t3 = performance.now();

  console.log(`[Perf] updateDrawer:
  Setup & DOM Select: ${(t1 - t0).toFixed(2)} ms
  Data Join & Enter:  ${(t2 - t1).toFixed(2)} ms
  Per-card Update:    ${(t3 - t2).toFixed(2)} ms
  TOTAL:              ${(t3 - t0).toFixed(2)} ms`);
}




function updateButtonLabel(count) {
  if (drawerButton && drawerContainer) {
    const isVisible = drawerContainer.classed("visible");
    const arrow = isVisible ? "→" : "←"; // ← to open, → to close
    drawerButton.html(`${arrow} (${count})`);
  }
}

