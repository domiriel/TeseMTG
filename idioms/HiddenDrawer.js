let drawerContainer = null;
let drawerButton = null; 
let currentPage = 0;
const pageSize = 25;


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
    .style("background", "#8A9CE4")
    .style("color", "white")
    .on("click", () => {
      const isVisible = drawerContainer.classed("visible");
      drawerContainer.classed("visible", !isVisible);
      updateButtonLabel(cardsInDrawer.length);
    });

    drawerContainer.insert("button", "#cardImages")
  .attr("id", "clearAllButton")
  .text("Clear All")
  .style("margin", "10px")
  .style("padding", "6px 12px")
  .style("background", "#dc3545")
  .style("color", "white")
  .style("border", "none")
  .style("border-radius", "4px")
  .style("cursor", "pointer")
  .on("click", () => {
    updateState({ hoveredCards: [], isHoverUpdate: true });

    // Optional: also unhighlight all dots
    d3.selectAll(".dots circle").classed("selected-hover", false);
  });

  drawerContainer.insert("button", "#cardImages")
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
  const totalPages = Math.ceil(cards.length / pageSize);
const visibleCards = cards.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const cardSel = cardArea.selectAll(".card-wrapper").data(visibleCards, d => d.name);

  cardSel.exit().remove();
  const cardEnter = cardSel.enter()
    .append("div")
    .attr("class", "card-wrapper")
    .style("position", "relative")
    .style("margin-bottom", "12px");

  cardEnter.append("img")
    .attr("alt", d => d.name)
    .style("width", "80%")
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


  const nav = drawerContainer.select("#pagination-nav");
if (!nav.empty()) nav.remove();

drawerContainer.insert("div", "#cardImages")
  .attr("id", "pagination-nav")
  .style("text-align", "center")
  .style("margin-top", "10px")
  .html(`
    <button id="prevPage" ${currentPage === 0 ? "disabled" : ""}>Prev</button>
    <span> Page ${currentPage + 1} of ${totalPages} </span>
    <button id="nextPage" ${currentPage === totalPages - 1 ? "disabled" : ""}>Next</button>
  `);

drawerContainer.select("#prevPage").on("click", () => {
  if (currentPage > 0) {
    currentPage--;
    updateDrawer(cardsInDrawer);
  }
});
drawerContainer.select("#nextPage").on("click", () => {
  if (currentPage < totalPages - 1) {
    currentPage++;
    updateDrawer(cardsInDrawer);
  }
});
  const t3 = performance.now();
}




function updateButtonLabel(count) {
  if (drawerButton && drawerContainer) {
    const isVisible = drawerContainer.classed("visible");
    const arrow = isVisible ? "→" : "←"; // ← to open, → to close
    drawerButton.html(`${arrow} (${count})`);
  }
}

export function createIllegalDrawer(cards, containerSelector = "body") {
  const container = d3.select(containerSelector);

const illegalDrawer = container.append("div")
  .attr("id", "illegalDrawer")
  .attr("class", "drawer")
  .html(`
  <div class="drawer-title">Illegal Cards</div>
  <div id="illegalCardImages"></div>
`);


// Append button after the drawer
const illegalButton = container.append("button")
  .attr("id", "toggleIllegalDrawerButton")
  .style("background", "#D9534F")
  .style("color", "white")
  .text(`← (${cards.length})`)
  .on("click", () => {
    const isVisible = illegalDrawer.classed("visible");
    illegalDrawer.classed("visible", !isVisible);
    const arrow = isVisible ? "→" : "←";
    illegalButton.text(`${arrow} (${cards.length})`);
  });

  updateIllegalDrawer(cards);
}

export function updateIllegalDrawer(cards) {
  const cardArea = d3.select("#illegalCardImages");
  const pageSize = 25;
  const totalPages = Math.ceil(cards.length / pageSize);
  let currentPage = 0;

  const renderPage = () => {
    const visibleCards = cards.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const cardSel = cardArea.selectAll(".card-wrapper").data(visibleCards, d => d.name);

    cardSel.exit().remove();

    const cardEnter = cardSel.enter()
      .append("div")
      .attr("class", "card-wrapper")
      .style("margin-bottom", "12px");

    cardEnter.append("img")
      .style("width", "80%")
      .style("border-radius", "8px")
      .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");

    const cardMerge = cardEnter.merge(cardSel);

    cardMerge.each((card, i, nodes) => {
      const wrapper = d3.select(nodes[i]);
      if (typeof card.selectedPrintIndex !== "number") card.selectedPrintIndex = 0;
      const idx = card.selectedPrintIndex;
      card.image_normal = card.all_print_images[idx];
      wrapper.select("img").attr("src", card.image_normal);

// Add navigation buttons
let navWrapper = wrapper.select(".nav-wrapper");
if (navWrapper.empty()) {
  navWrapper = wrapper.append("div")
    .attr("class", "nav-wrapper")
    .style("margin-top", "4px")
    .style("display", "flex")
    .style("gap", "6px")
    .style("justify-content", "center");
} else {
  navWrapper.html("");
}

navWrapper.append("button")
  .text("◀")
  .attr("title", "Previous print")
  .style("padding", "2px 6px")
  .on("click", () => {
    const newIdx = (card.selectedPrintIndex - 1 + card.all_print_images.length) % card.all_print_images.length;
    card.selectedPrintIndex = newIdx;
    card.image_normal = card.all_print_images[newIdx];
    wrapper.select("img").attr("src", card.image_normal);
  });

navWrapper.append("button")
  .text("▶")
  .attr("title", "Next print")
  .style("padding", "2px 6px")
  .on("click", () => {
    const newIdx = (card.selectedPrintIndex + 1) % card.all_print_images.length;
    card.selectedPrintIndex = newIdx;
    card.image_normal = card.all_print_images[newIdx];
    wrapper.select("img").attr("src", card.image_normal);
  });



    });

    // Pagination
    const nav = d3.select("#illegalDrawer #pagination-nav");
    if (!nav.empty()) nav.remove();

    d3.select("#illegalDrawer").insert("div", "#illegalCardImages")
      .attr("id", "pagination-nav")
      .style("text-align", "center")
      .style("margin-top", "10px")
      .html(`
        <button id="prevPage" ${currentPage === 0 ? "disabled" : ""}>Prev</button>
        <span> Page ${currentPage + 1} of ${totalPages} </span>
        <button id="nextPage" ${currentPage === totalPages - 1 ? "disabled" : ""}>Next</button>
      `);

    d3.select("#prevPage").on("click", () => {
      if (currentPage > 0) {
        currentPage--;
        renderPage();
      }
    });
    d3.select("#nextPage").on("click", () => {
      if (currentPage < totalPages - 1) {
        currentPage++;
        renderPage();
      }
    });
  };

  renderPage();
}


