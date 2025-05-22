let drawerContainer = null;
let drawerButton = null; // ← new

export function createHiddenDrawer(containerSelector = "body") {
  const container = d3.select(containerSelector);

  drawerButton = container.append("button") // ← save ref
    .attr("id", "toggleDrawerButton")
    .text("Show Selected Cards (0)")
    .on("click", () => {
      const drawer = d3.select("#hiddenDrawer");
      const isVisible = drawer.classed("visible");
      drawer.classed("visible", !isVisible);
      updateButtonLabel(cardsInDrawer.length); // ← also update label on toggle
    });

  drawerContainer = container.append("div")
    .attr("id", "hiddenDrawer")
    .attr("class", "drawer")
    .html(`<div id="cardImages"></div>`);
}


// Call this to update hovered card images
let cardsInDrawer = []; // store current list

export function updateDrawer(cards = []) {
  if (!drawerContainer) return;

  cardsInDrawer = cards; // store for reuse
  updateButtonLabel(cards.length); // ← update count in label

  const cardArea = drawerContainer.select("#cardImages");

  const images = cardArea.selectAll("img")
    .data(cards, d => d.name);

  images.exit().remove();
  images.attr("src", d => d.image_normal);

  images.enter()
    .append("img")
    .attr("src", d => d.image_normal)
    .attr("alt", d => d.name)
     .style("width", "100%")
    .style("align-self", "center")
    .style("margin-bottom", "10px")
    .style("border-radius", "8px")
    .style("box-shadow", "0 2px 8px rgba(0, 0, 0, 0.2)");
}

function updateButtonLabel(count) {
  if (drawerButton) {
    drawerButton.text(`Show Selected Cards (${count})`);
  }
}
