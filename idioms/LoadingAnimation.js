export function showLoader() {

console.log("Showing loader...");
  const loader = d3.select("#inlineLoader");
  console.log("Loader element:", loader.node());
  loader.style("display", "flex");

  if (loader.select(".loader-text").empty()) {
    loader.append("span")
      .attr("class", "loader-text")
      .text("Loading...");
  }
}

export function hideLoader(delay = 50) {
  if (delay > 0) {
    setTimeout(() => {
      d3.select("#inlineLoader").style("display", "none");
    }, delay);
  } else {
    d3.select("#inlineLoader").style("display", "none");
  }
}