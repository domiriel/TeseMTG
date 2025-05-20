let drawerContainer = null;

export function createHiddenDrawer(containerSelector = "body") {
  const container = d3.select(containerSelector);

  // Create button
  container.append("button")
    .attr("id", "toggleDrawerButton")
    .text("Show Selected Cards")
    .on("click", () => {
      const drawer = d3.select("#hiddenDrawer");
      const isVisible = drawer.classed("visible");
      drawer.classed("visible", !isVisible);
      d3.select("#toggleDrawerButton").text(isVisible ? "Show Drawer" : "Hide Drawer");
    });

  // Drawer container
  drawerContainer = container.append("div")
    .attr("id", "hiddenDrawer")
    .attr("class", "drawer")
    .html(`<div id="cardImages"></div>`);
}

// Call this to update hovered card images
export function updateDrawer(cards = []) {
  if (!drawerContainer) return;

  const cardArea = drawerContainer.select("#cardImages");

  const images = cardArea.selectAll("img")
    .data(cards, d => d.name); // use card name as key

  // EXIT
  images.exit().remove();

  // UPDATE
  images.attr("src", d => d.image_normal);

  // ENTER
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
