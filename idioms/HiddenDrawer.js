let drawerContainer = null;
let drawerButton = null;
let currentPage = 0;
let illegalCurrentPage = 0;
const pageSize = 25;
let illegalCardsInDrawer = [];

function getClonedFilters() {
  const currentState = getState();
  const cloned = {};
  for (const key in currentState.selectedFilters) {
    cloned[key] = new Set(currentState.selectedFilters[key]);
  }
  return cloned;
}

let drawerBtnHover = false;
let illegalBtnHover = false;

function updateDrawerButtonLabel() {
  
  if (!drawerButton || !drawerContainer) return;
  const isVisible = drawerContainer.classed("visible");
  const arrow = isVisible ? "→" : "←";
  const count = cardsInDrawer.length || 0;
  // show count when visible OR while hovering
  drawerButton.html(isVisible || drawerBtnHover ? `${arrow} (${count})` : `${arrow}`);
}

function updateIllegalButtonLabel() {
  const illegalButton = d3.select("#toggleIllegalDrawerButton");
  const illegalDrawer = d3.select("#illegalDrawer");
  if (illegalButton.empty() || illegalDrawer.empty()) return;
  const isVisible = illegalDrawer.classed("visible");
  const arrow = isVisible ? "→" : "←";
  const count = illegalCardsInDrawer.length || 0;
  illegalButton.text(isVisible || illegalBtnHover ? `${arrow} (${count})` : `${arrow}`);
}


import { updateState, getState } from "../state.js";
import { emitCardSearch, emitClearSelection } from "./Events.js";
export function createHiddenDrawer(containerSelector = "body") {
  const container = d3.select(containerSelector);

  // Drawer first
  drawerContainer = container
  .append("div")
  .attr("id", "hiddenDrawer")
  .attr("class", "drawer")

  .html(`
    <div class="drawer-header">
      <div id="hiddenDrawerTitle" class="drawer-title">Selected Cards</div>
    </div>
    <div id="cardImages"></div>
  `);

// optional, match the look/feel of the illegal header
drawerContainer
  .select(".drawer-header")
  .style("display", "flex")
  .style("flex-direction", "column")
  .style("align-items", "center")
  .style("gap", "8px")
  .style("margin-bottom", "12px");

// make the title show the same tooltip text as the toggle button
drawerContainer
  .select("#hiddenDrawerTitle")
  .style("color", "#8A9CE4") 
  .on("mouseover", (event) => {
    const tooltip = d3.select("#tooltip");
    tooltip
      .style("display", "block")
      .html("Cards that match the current selections");
    positionTooltip(event, tooltip);
  })
  .on("mousemove", (event) => positionTooltip(event))
  .on("mouseout", () => d3.select("#tooltip").style("display", "none"));


  // Then button separately
  drawerButton = container
  .append("button")
  .attr("id", "toggleDrawerButton")
  .style("background", "#8A9CE4")
  .style("color", "white")
  .on("mouseover", (event) => {
    drawerBtnHover = true;
    // show tooltip only when closed (unchanged)
    if (!drawerContainer.classed("visible")) {
      const tooltip = d3.select("#tooltip");
      tooltip
        .style("display", "block")
        .html("Cards that match the current selections");
      positionTooltip(event, tooltip);
    }
    updateDrawerButtonLabel();
  })
  .on("mousemove", (event) => {
    if (!drawerContainer.classed("visible")) {
      positionTooltip(event);
    }
  })
  .on("mouseout", () => {
    drawerBtnHover = false;
    d3.select("#tooltip").style("display", "none");
    updateDrawerButtonLabel();
  })
  .on("click", () => {
    const isVisible = drawerContainer.classed("visible");
    drawerContainer.classed("visible", !isVisible);
    updateDrawerButtonLabel();
  });

updateDrawerButtonLabel(); // initial label (arrow only)


  drawerContainer
    .insert("button", "#cardImages")
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

      emitClearSelection();
    });

  drawerContainer
    .select("#cardImages")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center");

  updateDrawerButtonLabel();
}

// Call this to update hovered card images
let cardsInDrawer = []; // store current list

export function updateDrawer(cards = []) {
  const filters = getState().selectedFilters;
  if (!drawerContainer) return;

  const t0 = performance.now();

  cardsInDrawer = cards;
  updateDrawerButtonLabel();

  const cardArea = drawerContainer.select("#cardImages");

  const t1 = performance.now();

  // Data join
  const totalPages = Math.ceil(cards.length / pageSize);
  const visibleCards = cards.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );
  const cardSel = cardArea
    .selectAll(".card-wrapper")
    .data(visibleCards, (d) => d.name);

  cardSel.exit().remove();
  const cardEnter = cardSel
    .enter()
    .append("div")
    .attr("class", "card-wrapper")
    .style("position", "relative")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center")
    .style("justify-content", "center")
    .style("margin-bottom", "12px");

  cardEnter
    .append("img")
    .attr("alt", (d) => d.name)
    .attr("display", "flex")
    .style("width", "80%")

    .style("justify-content", "center")
    .style("border-radius", "8px")
    .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");

  cardEnter
    .append("div")
    .attr("class", "nav-wrapper")
    .style("margin-top", "4px")

    .style("gap", "6px")
    .style("justify-content", "center");

  cardEnter.append("button").attr("class", "remove-card");
  cardEnter.append("button").attr("class", "show-sets-btn");

  const t2 = performance.now();

  const cardMerge = cardEnter.merge(cardSel);

  cardMerge.each((card, i, nodes) => {
    const wrapper = d3.select(nodes[i]);
    if (typeof card.selectedPrintIndex !== "number")
      card.selectedPrintIndex = 0;

    const idx = card.selectedPrintIndex;
    card.image_normal = card.all_print_images[idx];
    card.tooltip_image = card.image_normal;

    wrapper.select("img").attr("src", card.image_normal);
    const tooltipMeta = card.print_image_metadata?.find(
      (d) => d.image === card.tooltip_image
    );

    wrapper.select(".set-info-box").remove();

    // Add metadata display box before nav buttons
    wrapper
      .insert("div", ".nav-wrapper") // <-- INSERT before nav-wrapper
      .datum(tooltipMeta || {})
      .attr("class", "set-info-box")
      .style("margin-bottom", "4px")
      .style("font-size", "12px")
      .style("background", "#f0f0f0")
      .style("padding", "4px 8px")
      .style("border-radius", "4px")
      .style("text-align", "center")
      .style("max-width", "90%")
      .html((d) =>
        d.set_name && d.set_type
          ? `<strong>${d.set_name}</strong> <span style="color: #555;">(${d.set_type})</span>`
          : "Unknown Set"
      );
    const navWrapper = wrapper.select(".nav-wrapper").html("");

    // Lookup set metadata for current tooltip image

    navWrapper
      .append("button")
      .text("◀")
      .attr("title", "Previous print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx =
          (card.selectedPrintIndex - 1 + card.all_print_images.length) %
          card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.tooltip_image = card.all_print_images[newIdx];
        const updatedMeta = card.print_image_metadata?.find(
          (d) => d.image === card.tooltip_image
        );
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );
        const dot = d3
          .selectAll(".dots circle")
          .filter((d) => d.name === card.name)
          .datum();
        if (dot) {
          dot.tooltip_image = card.tooltip_image;
          const tooltip = d3.select("#tooltip");
          if (!tooltip.empty() && tooltip.style("display") !== "none") {
            mouseoverFn(null, dot);
          }
        }

        wrapper.select("img").attr("src", card.tooltip_image);
      });

    navWrapper
      .append("button")
      .text("▶")
      .attr("title", "Next print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx =
          (card.selectedPrintIndex + 1) % card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.tooltip_image = card.all_print_images[newIdx];
        const updatedMeta = card.print_image_metadata?.find(
          (d) => d.image === card.tooltip_image
        );
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );
        wrapper.select("img").attr("src", card.tooltip_image);
      });

    /*wrapper
      .select(".remove-card")
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
        const name = card.name; // use the 'card' from the .each() closure
        

    const circle = d3
      .selectAll(".Scatterplot .dots circle")
      .filter(d => d.name === name)
      .node();

    if (!circle) return;

    const cardDatum = d3.select(circle).datum();
    emitCardSearch(cardDatum);
    const newList = cardsInDrawer.filter(c => c.name !== name);
    updateDrawer(newList);

    updateDrawerButtonLabel(); 
      });
*/
    wrapper
      .select("img")
      .on("mouseover", (event) => showCompactTooltip(card, event))
      .on("mousemove", (event) => positionTooltip(event))
      .on("mouseout", () => d3.select("#tooltip").style("display", "none").style("background", null).style("color", null));

    wrapper
      .select(".show-sets-btn")
      .text(`Filter by Set Appearence (${card.all_sets?.length || 0})`)
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
        const updatedFilters = getClonedFilters();
        if (!updatedFilters["Set Names"]) {
          updatedFilters["Set Names"] = new Set();
        }

        card.all_sets.forEach((set) =>
          updatedFilters["Set Names"].add(set.name)
        );

        const newSelectedFilters = {};
        for (const key in updatedFilters) {
          newSelectedFilters[key] = new Set(updatedFilters[key]); // fully detached
        }
        updateState({
          selectedFilters: newSelectedFilters,
          updateContext: "TimelineFilter",
        });
      });
  });

  const nav = drawerContainer.select("#pagination-nav");
  if (!nav.empty()) nav.remove();

  drawerContainer
    .insert("div", "#cardImages")
    .attr("id", "pagination-nav")
    .style("text-align", "center")
    .style("margin-top", "10px").html(`
    <button id="prevPage" ${currentPage === 0 ? "disabled" : ""}>Prev</button>
    <span> Page ${currentPage + 1} of ${totalPages} </span>
    <button id="nextPage" ${
      currentPage === totalPages - 1 ? "disabled" : ""
    }>Next</button>
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

  const illegalDrawer = container
    .append("div")
    .attr("id", "illegalDrawer")
    .attr("class", "drawer").html(`
  <div class="illegal-header">
    <div class="drawer-title" title="These cards are not shown in the visualizations because they have no price data in EUR, USD, or TIX.">
      Unpriced Cards
    </div>
    <input id="illegalSearchInput" type="text" placeholder="Search card..." list="illegalCardNamesList">
  </div>
  <div id="illegalCardImages"></div>
`);

illegalDrawer
  .select(".drawer-title")
  .on("mouseover", (event) => {
    const tooltip = d3.select("#tooltip");
    tooltip
      .style("display", "block")
      .html("These cards are not shown in the visualizations because they have no price data in EUR, USD, or TIX.");
    positionTooltip(event, tooltip);
  })
  .on("mousemove", (event) => positionTooltip(event))
  .on("mouseout", () => d3.select("#tooltip").style("display", "none"));

  illegalDrawer
    .select(".illegal-header")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("margin-bottom", "12px");

  illegalDrawer
    .select("#illegal-search-bar")
    .style("display", "flex")
    .style("gap", "6px")
    .style("justify-content", "center");

  illegalDrawer
    .select("#illegalSearchInput")
    .style("padding", "4px 8px")
    .style("font-size", "14px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("width", "150px");

  illegalDrawer
    .select("#illegalSearchButton")
    .style("padding", "4px 8px")
    .style("font-size", "14px")
    .style("background", "#007bff")
    .style("color", "white")
    .style("border", "none")
    .style("border-radius", "4px")
    .style("cursor", "pointer");

  container.append("datalist").attr("id", "illegalCardNamesList");

  d3.select("#illegalSearchInput").on("keydown", (event) => {
    if (event.key === "Enter") {
      const query = event.target.value.trim().toLowerCase();
      if (!query) return;

      const index = illegalCardsInDrawer.findIndex((card) =>
        card.name.toLowerCase().includes(query)
      );
      if (index !== -1) {
        illegalCurrentPage = Math.floor(index / pageSize);
        updateIllegalDrawer(illegalCardsInDrawer);

        // Scroll to the card after drawer updates (use setTimeout to wait for DOM update)
        const matchingCard = illegalCardsInDrawer[index];
        const cardSel = d3
          .select("#illegalCardImages")
          .selectAll(".card-wrapper")
          .filter((d) => d.name === matchingCard.name);

        const cardEl = cardSel.node();
        const imgEl = cardSel.select("img").node();

        if (imgEl && !imgEl.complete) {
          imgEl.onload = () => {
            cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
          };
        } else if (cardEl) {
          cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        this.value = "";
      } else {
        d3.select("#illegalSearchInput").style("border", "1px solid red");
        setTimeout(() => {
          d3.select("#illegalSearchInput").style("border", "1px solid #ccc");
        }, 1500);
      }
    }
  });

  // Append button after the drawer
const illegalButton = container
  .append("button")
  .attr("id", "toggleIllegalDrawerButton")
  .style("background", "#D9534F")
  .style("color", "white")
  .on("mouseover", (event) => {
    illegalBtnHover = true;
    // show tooltip only when closed (unchanged)
    if (!illegalDrawer.classed("visible")) {
      const tooltip = d3.select("#tooltip");
      tooltip
        .style("display", "block")
        .html("These cards are not shown in the visualizations because they have no price data in EUR, USD, or TIX.");
      positionTooltip(event, tooltip);
    }
    updateIllegalButtonLabel();
  })
  .on("mousemove", (event) => {
    if (!illegalDrawer.classed("visible")) {
      positionTooltip(event);
    }
  })
  .on("mouseout", () => {
    illegalBtnHover = false;
    d3.select("#tooltip").style("display", "none");
    updateIllegalButtonLabel();
  })
  .on("click", () => {
    const nowVisible = !illegalDrawer.classed("visible");
    illegalDrawer.classed("visible", nowVisible);
    updateIllegalButtonLabel();
  });

updateIllegalButtonLabel(); // initial label (arrow only)
  d3.select("#illegalCardImages")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center");
  updateIllegalDrawer(cards);

  const datalist = d3.select("#illegalCardNamesList");
  datalist
    .selectAll("option")
    .data(cards)
    .join("option")
    .attr("value", (d) => d.name);
}

export function updateIllegalDrawer(cards = []) {
  illegalCardsInDrawer = cards;
  const alchemyIllegalCount = cards.filter((card) =>
    card.all_sets?.some((set) => set.type?.toLowerCase() === "alchemy")
  ).length;

  const cardArea = d3.select("#illegalCardImages");
  const totalPages = Math.ceil(illegalCardsInDrawer.length / pageSize);
  const visibleCards = illegalCardsInDrawer.slice(
    illegalCurrentPage * pageSize,
    (illegalCurrentPage + 1) * pageSize
  );

  const cardSel = cardArea
    .selectAll(".card-wrapper")
    .data(visibleCards, (d) => d.name);
  cardSel.exit().remove();

  const cardEnter = cardSel
    .enter()
    .append("div")
    .attr("class", "card-wrapper")
    .style("margin-bottom", "12px")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center")
    .style("justify-content", "center");

  cardEnter
    .append("img")
    .style("width", "80%")
    .style("border-radius", "8px")
    .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");

  const cardMerge = cardEnter.merge(cardSel);

  cardMerge.each((card, i, nodes) => {
    const wrapper = d3.select(nodes[i]);
    if (typeof card.selectedPrintIndex !== "number")
      card.selectedPrintIndex = 0;
    const idx = card.selectedPrintIndex;
    card.image_normal = card.all_print_images[idx];
    wrapper.select("img").attr("src", card.image_normal);

    const tooltipMeta = card.print_image_metadata?.find(
      (d) => d.image === card.image_normal
    );

    // Remove any old set-info-box
    wrapper.select(".set-info-box").remove();

    // Insert new one above nav-wrapper
    wrapper
      .insert("div", ".nav-wrapper")
      .datum(tooltipMeta || {})
      .attr("class", "set-info-box")
      .style("margin", "6px 0 4px")
      .style("font-size", "12px")
      .style("background", "#f0f0f0")
      .style("padding", "4px 8px")
      .style("border-radius", "4px")
      .style("text-align", "center")
      .style("max-width", "90%")
      .html((d) =>
        d.set_name && d.set_type
          ? `<strong>${d.set_name}</strong> <span style="color: #555;">(${d.set_type})</span>`
          : "Unknown Set"
      );

    let navWrapper = wrapper.select(".nav-wrapper");
    if (navWrapper.empty()) {
      navWrapper = wrapper
        .append("div")
        .attr("class", "nav-wrapper")
        .style("margin-top", "4px")
        .style("display", "flex")
        .style("gap", "6px")
        .style("justify-content", "center");
    } else {
      navWrapper.html("");
    }

    navWrapper
      .append("button")
      .text("◀")
      .attr("title", "Previous print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx =
          (card.selectedPrintIndex - 1 + card.all_print_images.length) %
          card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.image_normal = card.all_print_images[newIdx];
        const updatedMeta = card.print_image_metadata?.find(
          (d) => d.image === card.image_normal
        );
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );
        wrapper.select("img").attr("src", card.image_normal);
      });

    navWrapper
      .append("button")
      .text("▶")
      .attr("title", "Next print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx =
          (card.selectedPrintIndex + 1) % card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.image_normal = card.all_print_images[newIdx];
        const updatedMeta = card.print_image_metadata?.find(
          (d) => d.image === card.image_normal
        );
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );
        wrapper.select("img").attr("src", card.image_normal);
      });

    wrapper
      .select("img")
      .on("mouseover", (event) => showCompactTooltip(card, event))
      .on("mousemove", (event) => positionTooltip(event))
      .on("mouseout", () => d3.select("#tooltip").style("display", "none").style("background", null).style("color", null));
  });

  // Pagination controls
  const nav = d3.select("#illegalDrawer #pagination-nav");
  if (!nav.empty()) nav.remove();

  d3
    .select("#illegalDrawer")
    .insert("div", "#illegalCardImages")
    .attr("id", "pagination-nav")
    .style("text-align", "center")
    .style("margin-top", "10px").html(`
      <button id="illegalPrevPage" ${
        illegalCurrentPage === 0 ? "disabled" : ""
      }>Prev</button>
      <span> Page ${illegalCurrentPage + 1} of ${totalPages} </span>
      <button id="illegalNextPage" ${
        illegalCurrentPage === totalPages - 1 ? "disabled" : ""
      }>Next</button>
    `);

  d3.select("#illegalPrevPage").on("click", () => {
    if (illegalCurrentPage > 0) {
      illegalCurrentPage--;
      updateIllegalDrawer(illegalCardsInDrawer);
    }
  });

  d3.select("#illegalNextPage").on("click", () => {
    if (illegalCurrentPage < totalPages - 1) {
      illegalCurrentPage++;
      updateIllegalDrawer(illegalCardsInDrawer);
    }
  });
}

function showCompactTooltip(card, event = null) {
  const tooltip = d3.select("#tooltip");
  const colorBg = getColorIdentityBackground(card.color_identity);
  const formatDate = d3.timeFormat("%d %b %Y");
  const formattedDate = card.release_date
    ? formatDate(new Date(card.release_date))
    : "Unknown";

  tooltip
    .style("display", "block")
    .style("background", colorBg)
    .style("color", "black").html(`
      <div>
        <strong>${card.name}</strong><br>
        Release Date: ${formattedDate}<br>
        Complexity: ${card.complexity}<br>
        EDH Rank: ${card.edhrec_rank || "N/A"}<br>
        Supertypes: ${card.supertype}<br>
        Type: ${card.type}<br>
        Subtype: ${card.subtype}<br>
        Colors: ${card.color_identity?.join("") || "None"}<br>
        All Sets: ${
          card.all_sets
            ?.map((set) => `${set.name} (${set.type})`)
            .join("<br>") || "—"
        }<br>
        Number of Prints: ${card.all_print_images?.length || 0}
      </div>
    `);

  if (event) positionTooltip(event, tooltip);
}

function positionTooltip(event, tooltip = d3.select("#tooltip")) {
  const tooltipWidth = tooltip.node().offsetWidth;
  const tooltipHeight = tooltip.node().offsetHeight;
  const padding = 10;
  let x = event.pageX + padding;
  let y = event.pageY + padding;

  if (x + tooltipWidth > window.innerWidth) {
    x = event.pageX - tooltipWidth - padding;
  }
  if (y + tooltipHeight > window.innerHeight) {
    y = event.pageY - tooltipHeight - padding;
  }

  tooltip.style("left", `${x}px`).style("top", `${y}px`);
}

function getColorIdentityBackground(colorIdentity) {
  if (!Array.isArray(colorIdentity) || colorIdentity.length === 0)
    return "#888";

  const colorMap = {
    W: "#f6f1d5",
    U: "#b3d9ff",
    R: "#f8b3a0",
    B: "#c8b4c0",
    G: "#b6d7b3",
  };

  const mtgColorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };

  // Sort identity based on defined order
  const sorted = [...colorIdentity].sort(
    (a, b) => mtgColorOrder[a] - mtgColorOrder[b]
  );
  const colors = sorted.map((c) => colorMap[c]).filter(Boolean);

  if (colors.length === 1) {
    return colors[0];
  } else {
    const step = 100 / (colors.length - 1);
    const stops = colors.map((color, i) => `${color} ${i * step}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
}
