// HiddenDrawer.js
//
// Purpose
// -------
// Renders two slide-out drawers:
// 1) "Selected Cards" drawer (matches current selections / highlights across views)
// 2) "Unpriced Cards" drawer (cards excluded from visuals due to missing EUR/USD/TIX)
// Both drawers support:
// • Hover tooltips with compact metadata
// • Print navigation per card (prev/next art/print image)
// • Pagination for large lists
// • Quick search & scroll for the Unpriced drawer
//
// Notes
// -----
// • This file is UI-only; it does not compute which cards belong in the drawers.
//   Call `updateDrawer(cards)` / `updateIllegalDrawer(cards)` with precomputed arrays.
// • Pagination size is fixed (pageSize=25). Adjust if needed.
// • The drawer toggle buttons show arrows (← to open, → to close) and counts.
//
// --------------------------------------------------------------------------------------

let drawerContainer = null;     // DOM node for the Selected Cards drawer
let drawerButton = null;        // Toggle button for the Selected Cards drawer
let currentPage = 0;            // Pagination state for Selected Cards
let illegalCurrentPage = 0;     // Pagination state for Unpriced Cards
const pageSize = 25;
let illegalCardsInDrawer = [];  // Cached array for Unpriced Cards
let cardsInDrawer = [];         // Cached array for Selected Cards (hovered/persistently selected)

let drawerBtnHover = false;     // Hover state for improving the label UX on the toggle buttons
let illegalBtnHover = false;

// --- Utilities ------------------------------------------------------------


// Update the Selected Cards button label: shows arrow and (count) when open or hovered.
function updateDrawerButtonLabel() {
  if (!drawerButton || !drawerContainer) return;
  const isVisible = drawerContainer.classed("visible");
  const arrow = isVisible ? "→" : "←";
  const count = cardsInDrawer.length || 0;
  drawerButton.html(isVisible || drawerBtnHover ? `${arrow} (${count})` : `${arrow}`);
}

// Update the Unpriced Cards button label: shows arrow and (count) when open or hovered.
function updateIllegalButtonLabel() {
  const illegalButton = d3.select("#toggleIllegalDrawerButton");
  const illegalDrawer = d3.select("#illegalDrawer");
  if (illegalButton.empty() || illegalDrawer.empty()) return;
  const isVisible = illegalDrawer.classed("visible");
  const arrow = isVisible ? "→" : "←";
  const count = illegalCardsInDrawer.length || 0;
  illegalButton.text(isVisible || illegalBtnHover ? `${arrow} (${count})` : `${arrow}`);
}

// --- Imports --------------------------------------------------------------

import { updateState, getState, cloneSelectedFilters } from "../state.js";
import { clearSelection } from "./Linking.js";
import { moveTooltip, colorIdentityBackground } from "./ui.js";

// --- Selected Cards Drawer ------------------------------------------------

/**
 * createHiddenDrawer(containerSelector)
 * Mounts the "Selected Cards" drawer and its toggle button.
 * Call once on app init; then call updateDrawer(cards) whenever the list changes.
 */
export function createHiddenDrawer(containerSelector = "body") {
  const container = d3.select(containerSelector);

  // Drawer container
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

  // Cosmetic alignment for header
  drawerContainer
    .select(".drawer-header")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("margin-bottom", "12px");

  // Title tooltip mirrors the toggle button tooltip
  drawerContainer
    .select("#hiddenDrawerTitle")
    .style("color", "#8A9CE4")
    .on("mouseover", (event) => {
      const tooltip = d3.select("#tooltip");
      tooltip
        .style("display", "block")
        .html("Cards that match the current selections");
      moveTooltip(event);
    })
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseout", () => d3.select("#tooltip").style("display", "none"));

  // Toggle button for the selected drawer
  drawerButton = container
    .append("button")
    .attr("id", "toggleDrawerButton")
    .style("background", "#8A9CE4")
    .style("color", "white")
    .on("mouseover", (event) => {
      drawerBtnHover = true;
      if (!drawerContainer.classed("visible")) {
        const tooltip = d3.select("#tooltip");
        tooltip
          .style("display", "block")
          .html("Cards that match the current selections");
        moveTooltip(event);
      }
      updateDrawerButtonLabel();
    })
    .on("mousemove", (event) => {
      if (!drawerContainer.classed("visible")) moveTooltip(event);
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

  // "Clear All" button resets cross-view persistent selections and hover state
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
      clearSelection();
    });

  // Cards area styling
  drawerContainer
    .select("#cardImages")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center");

  updateDrawerButtonLabel();
}

/**
 * updateDrawer(cards)
 * Renders the current page of "Selected Cards" with per-card print navigation
 * and a "Filter by Set Appearance" action.
 */
export function updateDrawer(cards = []) {
  if (!drawerContainer) return;

  // A new selection starts on the first page; re-renders of the same list
  // (pagination clicks) keep the page, clamped to the available pages.
  if (cards !== cardsInDrawer) currentPage = 0;
  cardsInDrawer = cards;
  updateDrawerButtonLabel();

  const cardArea = drawerContainer.select("#cardImages");

  // Pagination window
  const totalPages = Math.ceil(cards.length / pageSize) || 1;
  currentPage = Math.min(currentPage, totalPages - 1);
  const visibleCards = cards.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // Data join on card wrappers
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

  // Card image
  cardEnter
    .append("img")
    .attr("alt", (d) => d.name)
    .style("width", "80%")
    .style("justify-content", "center")
    .style("border-radius", "8px")
    .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");

  // Navigation area (prev/next print + filter-by-sets)
  cardEnter
    .append("div")
    .attr("class", "nav-wrapper")
    .style("margin-top", "4px")
    .style("gap", "6px")
    .style("justify-content", "center");

  // Button placeholder (filled in merge each)
  cardEnter.append("button").attr("class", "show-sets-btn");

  // Merge: bind handlers per card
  const cardMerge = cardEnter.merge(cardSel);
  cardMerge.each((card, i, nodes) => {
    const wrapper = d3.select(nodes[i]);

    // Ensure we have a current print index; select image
    if (typeof card.selectedPrintIndex !== "number") card.selectedPrintIndex = 0;
    const idx = card.selectedPrintIndex;
    card.image_normal = card.all_print_images[idx];
    card.tooltip_image = card.image_normal;
    wrapper.select("img").attr("src", card.image_normal);

    // Set metadata box (above nav buttons)
    const tooltipMeta = card.print_image_metadata?.find((d) => d.image === card.tooltip_image);
    wrapper.select(".set-info-box").remove();
    wrapper
      .insert("div", ".nav-wrapper")
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

    // Prev print
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

        const updatedMeta = card.print_image_metadata?.find((d) => d.image === card.tooltip_image);
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );

        wrapper.select("img").attr("src", card.tooltip_image);
      });

    // Next print
    navWrapper
      .append("button")
      .text("▶")
      .attr("title", "Next print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx = (card.selectedPrintIndex + 1) % card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.tooltip_image = card.all_print_images[newIdx];

        const updatedMeta = card.print_image_metadata?.find((d) => d.image === card.tooltip_image);
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );

        wrapper.select("img").attr("src", card.tooltip_image);
      });

    // Card image compact tooltip
    wrapper
      .select("img")
      .on("mouseover", (event) => showCompactTooltip(card, event))
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseout", () =>
        d3.select("#tooltip").style("display", "none").style("background", null).style("color", null)
      );

    // Quick action: filter the whole app by sets where this card appears
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
        const updatedFilters = cloneSelectedFilters();
        if (!updatedFilters["Set Names"]) updatedFilters["Set Names"] = new Set();
        card.all_sets.forEach((set) => updatedFilters["Set Names"].add(set.name));

        // Provide a deep-cloned Set map to state (avoids shared references)
        const newSelectedFilters = {};
        for (const key in updatedFilters) newSelectedFilters[key] = new Set(updatedFilters[key]);

        updateState({
          selectedFilters: newSelectedFilters,
        });
      });
  });

  // Pagination controls (rebuild each render to keep disabled states correct)
  const nav = drawerContainer.select("#pagination-nav");
  if (!nav.empty()) nav.remove();

  drawerContainer
    .insert("div", "#cardImages")
    .attr("id", "pagination-nav")
    .style("text-align", "center")
    .style("margin-top", "10px")
    .html(`
      <button id="prevPage" ${currentPage === 0 ? "disabled" : ""}>Prev</button>
      <span> Page ${currentPage + 1} of ${totalPages} </span>
      <button id="nextPage" ${currentPage >= totalPages - 1 ? "disabled" : ""}>Next</button>
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
}

// --- Unpriced Cards Drawer -----------------------------------------------

/**
 * createIllegalDrawer(cards, containerSelector)
 * Mounts the "Unpriced Cards" drawer and its toggle button; renders initial cards.
 * Use updateIllegalDrawer(cards) later to refresh.
 */
export function createIllegalDrawer(cards, containerSelector = "body") {
  const container = d3.select(containerSelector);

  const illegalDrawer = container
    .append("div")
    .attr("id", "illegalDrawer")
    .attr("class", "drawer")
    .html(`
      <div class="illegal-header">
        <div class="drawer-title" title="These cards are not shown in the visualizations because they have no price data in EUR, USD, or TIX.">
          Unpriced Cards
        </div>
        <input id="illegalSearchInput" type="text" placeholder="Search card..." list="illegalCardNamesList">
      </div>
      <div id="illegalCardImages"></div>
    `);

  // Title tooltip
  illegalDrawer
    .select(".drawer-title")
    .on("mouseover", (event) => {
      const tooltip = d3.select("#tooltip");
      tooltip
        .style("display", "block")
        .html("These cards are not shown in the visualizations because they have no price data in EUR, USD, or TIX.");
      moveTooltip(event);
    })
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseout", () => d3.select("#tooltip").style("display", "none"));

  // Header layout
  illegalDrawer
    .select(".illegal-header")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("align-items", "center")
    .style("gap", "8px")
    .style("margin-bottom", "12px");

  // Search input styling
  illegalDrawer
    .select("#illegalSearchInput")
    .style("padding", "4px 8px")
    .style("font-size", "14px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("width", "150px");

  // Datalist for card names
  container.append("datalist").attr("id", "illegalCardNamesList");

  // "Enter" in search: jump to and scroll the first match
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

        // After DOM updates, scroll the matching card into view (wait for image load if needed)
        const matchingCard = illegalCardsInDrawer[index];
        const cardSel = d3
          .select("#illegalCardImages")
          .selectAll(".card-wrapper")
          .filter((d) => d.name === matchingCard.name);

        const cardEl = cardSel.node();
        const imgEl = cardSel.select("img").node();

        if (imgEl && !imgEl.complete) {
          imgEl.onload = () => cardEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (cardEl) {
          cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        event.target.value = "";
      } else {
        // No match visual feedback
        d3.select("#illegalSearchInput").style("border", "1px solid red");
        setTimeout(() => {
          d3.select("#illegalSearchInput").style("border", "1px solid #ccc");
        }, 1500);
      }
    }
  });

  // Toggle button for the unpriced drawer
  const illegalButton = container
    .append("button")
    .attr("id", "toggleIllegalDrawerButton")
    .style("background", "#D9534F")
    .style("color", "white")
    .on("mouseover", (event) => {
      illegalBtnHover = true;
      if (!illegalDrawer.classed("visible")) {
        const tooltip = d3.select("#tooltip");
        tooltip
          .style("display", "block")
          .html("These cards are not shown in the visualizations because they have no price data in EUR, USD, or TIX.");
        moveTooltip(event);
      }
      updateIllegalButtonLabel();
    })
    .on("mousemove", (event) => {
      if (!illegalDrawer.classed("visible")) moveTooltip(event);
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

  // Initial render + populate datalist
  updateIllegalDrawer(cards);
  const datalist = d3.select("#illegalCardNamesList");
  datalist
    .selectAll("option")
    .data(cards)
    .join("option")
    .attr("value", (d) => d.name);
}

/**
 * updateIllegalDrawer(cards)
 * Renders the current page of "Unpriced Cards" with per-card print navigation.
 */
export function updateIllegalDrawer(cards = []) {
  illegalCardsInDrawer = cards;

  const cardArea = d3.select("#illegalCardImages");
  const totalPages = Math.ceil(illegalCardsInDrawer.length / pageSize) || 1;
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

    // Select current print image
    if (typeof card.selectedPrintIndex !== "number") card.selectedPrintIndex = 0;
    const idx = card.selectedPrintIndex;
    card.image_normal = card.all_print_images[idx];
    wrapper.select("img").attr("src", card.image_normal);

    // Set metadata box (above nav)
    const tooltipMeta = card.print_image_metadata?.find((d) => d.image === card.image_normal);
    wrapper.select(".set-info-box").remove();
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

    // Ensure nav wrapper exists, then (re)build buttons
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

    // Prev print
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

        const updatedMeta = card.print_image_metadata?.find((d) => d.image === card.image_normal);
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );
        wrapper.select("img").attr("src", card.image_normal);
      });

    // Next print
    navWrapper
      .append("button")
      .text("▶")
      .attr("title", "Next print")
      .style("padding", "2px 6px")
      .on("click", () => {
        const newIdx = (card.selectedPrintIndex + 1) % card.all_print_images.length;
        card.selectedPrintIndex = newIdx;
        card.image_normal = card.all_print_images[newIdx];

        const updatedMeta = card.print_image_metadata?.find((d) => d.image === card.image_normal);
        wrapper
          .select(".set-info-box")
          .html(
            updatedMeta?.set_name && updatedMeta?.set_type
              ? `<strong>${updatedMeta.set_name}</strong> <span style="color: #555;">(${updatedMeta.set_type})</span>`
              : "Unknown Set"
          );
        wrapper.select("img").attr("src", card.image_normal);
      });

    // Compact tooltip on hover
    wrapper
      .select("img")
      .on("mouseover", (event) => showCompactTooltip(card, event))
      .on("mousemove", (event) => moveTooltip(event))
      .on("mouseout", () =>
        d3.select("#tooltip").style("display", "none").style("background", null).style("color", null)
      );
  });

  // Pagination controls
  const nav = d3.select("#illegalDrawer #pagination-nav");
  if (!nav.empty()) nav.remove();

  d3.select("#illegalDrawer")
    .insert("div", "#illegalCardImages")
    .attr("id", "pagination-nav")
    .style("text-align", "center")
    .style("margin-top", "10px")
    .html(`
      <button id="illegalPrevPage" ${illegalCurrentPage === 0 ? "disabled" : ""}>Prev</button>
      <span> Page ${illegalCurrentPage + 1} of ${totalPages} </span>
      <button id="illegalNextPage" ${illegalCurrentPage >= totalPages - 1 ? "disabled" : ""}>Next</button>
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

  // Keep the button count in sync
  updateIllegalButtonLabel();
}

// --- Tooltip & color helpers ---------------------------------------------

// A small, shared card tooltip used in both drawers.
function showCompactTooltip(card, event = null) {
  const tooltip = d3.select("#tooltip");
  const colorBg = colorIdentityBackground(card.color_identity);
  const formatDate = d3.timeFormat("%d %b %Y");
  const formattedDate = card.release_date ? formatDate(new Date(card.release_date)) : "Unknown";

  tooltip
    .style("display", "block")
    .style("background", colorBg)
    .style("color", "black")
    .html(`
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
          card.all_sets?.map((set) => `${set.name} (${set.type})`).join("<br>") || "—"
        }<br>
        Number of Prints: ${card.all_print_images?.length || 0}
      </div>
    `);

  if (event) moveTooltip(event);
}

