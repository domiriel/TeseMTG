const nodeColorScale = d3.scaleSequential()
    .interpolator(d3.interpolateRgb("#EDF8E9", "#006D2C")); // Soft to dark green



function getDiscreteColor(percentage) {
  if (percentage < 20) return "#edf8e9";
  if (percentage < 40) return "#bae4b3";
  if (percentage < 60) return "#74c475";
  if (percentage < 80) return "#31a343";
  return "#006d2c"; // 81-100%
}

function getPriceRange(data) {
  const prices = data.map(d => d.avgPrice).filter(price => !isNaN(price));
  return {
      min: d3.min(prices),
      max: d3.max(prices)
  };
}

function getNodeColor(price, minPrice, maxPrice) {
  let percentage = ((price - minPrice) / (maxPrice - minPrice)) * 100;
  return getDiscreteColor(percentage); // Now using discrete colors
}

function createAlluvialChart(data, containerId, isUpdate = false) {
  // Dynamically extract categories from data
  const originalitySet = new Set();
  const raritySet = new Set();
  


  data.forEach(card => {
    if (card.originality) {
      originalitySet.add(card.originality.toLowerCase());
    }
    if (card.rarity) {
      raritySet.add(card.rarity.toLowerCase());
    }
  });
  
  // Convert sets to sorted arrays (sorting is optional)
  const originalityCategories = Array.from(originalitySet).sort();
  const rarityCategories = Array.from(raritySet).sort();
  
  // Prepare aggregates for nodes (average price)
  const origPriceSums = {};
  const origPriceCounts = {};
  originalityCategories.forEach(orig => {
    origPriceSums[orig] = 0;
    origPriceCounts[orig] = 0;
  });
  
  const rarityPriceSums = {};
  const rarityPriceCounts = {};
  rarityCategories.forEach(rarity => {
    rarityPriceSums[rarity] = 0;
    rarityPriceCounts[rarity] = 0;
  });
  
  // Prepare aggregates for links (price sums/counts) and count links
  let linkCounts = {};
  const linkPriceSums = {};
  const linkPriceCounts = {};
  
  data.forEach(card => {
    const orig = card.originality ? card.originality.toLowerCase() : "";
    const rarity = card.rarity ? card.rarity.toLowerCase() : "";
    // Update link counts and price aggregates if categories exist
    if (originalitySet.has(orig) && raritySet.has(rarity)) {
      const key = `${orig}|${rarity}`;
      linkCounts[key] = (linkCounts[key] || 0) + 1;
      let price = parseFloat(card.price_usd);
      if (!isNaN(price)) {
        linkPriceSums[key] = (linkPriceSums[key] || 0) + price;
        linkPriceCounts[key] = (linkPriceCounts[key] || 0) + 1;
      }
    }
    
    // Update node aggregates for originality and rarity
    let price = parseFloat(card.price_usd);
    if (!isNaN(price)) {
      if (origPriceSums.hasOwnProperty(orig)) {
        origPriceSums[orig] += price;
        origPriceCounts[orig] += 1;
      }
      if (rarityPriceSums.hasOwnProperty(rarity)) {
        rarityPriceSums[rarity] += price;
        rarityPriceCounts[rarity] += 1;
      }
    }
  });
  
  // Ensure every combination exists (even if 0)
  originalityCategories.forEach(orig => {
    rarityCategories.forEach(rarity => {
      const key = `${orig}|${rarity}`;
      if (!linkCounts.hasOwnProperty(key)) {
        linkCounts[key] = 0;
        linkPriceSums[key] = 0;
        linkPriceCounts[key] = 0;
      }
    });
  });
  
  // Create nodes for originality and rarity with average price values
  const origNodes = originalityCategories.map(orig => ({
    name: orig,
    avgPrice: origPriceCounts[orig] > 0 ? origPriceSums[orig] / origPriceCounts[orig] : 0
  }));
  
  const rarityNodes = rarityCategories.map(rarity => ({
    name: rarity,
    avgPrice: rarityPriceCounts[rarity] > 0 ? rarityPriceSums[rarity] / rarityPriceCounts[rarity] : 0
  }));
  
  const nodes = origNodes.concat(rarityNodes);
  
  // Build the links array using indices based on node order, including average price
  const links = [];
  originalityCategories.forEach((orig, i) => {
    rarityCategories.forEach((rarity, j) => {
      const key = `${orig}|${rarity}`;
      links.push({
        source: i, // originality nodes come first
        target: origNodes.length + j, // rarity nodes follow
        value: linkCounts[key],
        avgPrice: linkPriceCounts[key] > 0 ? linkPriceSums[key] / linkPriceCounts[key] : 0
      });
    });
  });
  
  // Define chart dimensions
  const margin = { top: 20, right: 50, bottom: 20, left: 50 }; // Swap left and right margins

  const width = 800;
  const height = 400;
  
  // Remove any existing SVG if updating
  if (isUpdate) {
    d3.select(containerId).select("svg").remove();
  }
  
  const legendWidth = 120; // Extra space for the legend
  const svgWidth = width + margin.left + margin.right;


  // Create the SVG container
  const svg = d3.select(containerId)
  .append("svg")
  .attr("width", svgWidth)
  .attr("height", height);


  
const chartOffset = legendWidth + margin.left; // Shift everything to the right
const chartGroup = svg.append("g")
  .attr("transform", `translate(${width +chartOffset}, 0)`); // Move chart to the right, keeping space on the left

  
  
  
  // Setup the Sankey layout using d3-sankey
  const sankeyGenerator = d3.sankey()
    .nodeWidth(20)
    .nodePadding(10)
    .extent([[1, 1], [width - 1, height - 5]]);
  
  const sankeyData = sankeyGenerator({
    nodes: nodes.map(d => Object.assign({}, d)),
    links: links.map(d => Object.assign({}, d))
  });
  
  // Create tooltip if it doesn't exist
  if (!d3.select("#tooltip").node()) {
    d3.select("body")
      .append("div")
      .attr("id", "tooltip")
      .style("position", "absolute")
      .style("background", "rgba(0, 0, 0, 0.7)")
      .style("color", "white")
      .style("padding", "5px")
      .style("border-radius", "3px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("display", "none");
  }
  const tooltip = d3.select("#tooltip");
  

  const priceRangeLinks = getPriceRange(sankeyData.links);
  const priceRangeNodes = getPriceRange(sankeyData.nodes);  

  const allPrices = [...sankeyData.nodes.map(d => d.avgPrice), ...sankeyData.links.map(d => d.avgPrice)];
  const sharedPriceRange = {
    min: d3.min(allPrices),
    max: d3.max(allPrices)
};
  // Draw the links with tooltip behavior
  svg.append("g")
    .attr("class", "links")
    .selectAll("path")
    .data(sankeyData.links)
    .enter()
    .append("path")
      .attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", d => getNodeColor(d.avgPrice, sharedPriceRange.min, sharedPriceRange.max))
      .attr("stroke-opacity", 0.5)
      .attr("fill", "none")
      .attr("stroke-width", d => Math.max(1, d.width))
      .on("mouseover", function(event, d) {
        tooltip.style("display", "block")
               .html(`From: ${d.source.name}<br>To: ${d.target.name}<br>Cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(2)}`);
        d3.select(this).attr("stroke-opacity", 0.8);
       
      })
      .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
               .style("top", (event.pageY + 10) + "px");
      })
      .on("mouseout", function() {
        tooltip.style("display", "none");
        d3.select(this).attr("stroke-opacity", 0.5);
      });
  
  // Draw the nodes with tooltip behavior
  const node = svg.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(sankeyData.nodes)
    .enter()
    .append("g");
  
  
  node.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("height", d => d.y1 - d.y0)
    .attr("fill", d => getNodeColor(d.avgPrice, sharedPriceRange.min, sharedPriceRange.max)) 
    .attr("stroke", "#000")
    .on("mouseover", function(event, d) {
      tooltip.style("display", "block")
             .html(`Category: ${d.name}<br>Total cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(2)}`);
    })
    .on("mousemove", function(event) {
      tooltip.style("left", (event.pageX + 10) + "px")
             .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function() {
      tooltip.style("display", "none");
    });
  
  // Add text labels to the nodes
  node.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y0 + d.y1) / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .text(d => d.name)
    .attr("font-size", "12px")
    .attr("fill", "#000");



  // Define number of bins for price intervals (matching the color scale)
  const numBins = 5; 

  // Compute price step based on the range
  const priceStep = (sharedPriceRange.max - sharedPriceRange.min) / numBins;

  // Generate dynamic intervals based on min/max price
  const dynamicLegendData = Array.from({ length: numBins }, (_, i) => ({
    label: `$${(sharedPriceRange.min + (i+1) * priceStep).toFixed(2)}`,
      color: getDiscreteColor(i * (100 / numBins)) // Map percentage to color
  })).reverse(); // Reverse so the highest value is at the top

    
  // Remove the old colorLegendData and use dynamicLegendData
const legendX = margin.left + 770;  // Adjust based on layout
const legendY = 20;  // Adjust vertical position
const rectHeight = 20;
const extraSpacing = 0;

const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

// Loop through each color range and add a legend entry
dynamicLegendData.forEach((interval, i) => {
    const legendEntry = legend.append("g")
      .attr("transform", `translate(0, ${i * (rectHeight + extraSpacing)})`);

    legendEntry.append("rect")
        .attr("width", 20)
        .attr("height", rectHeight)
        .attr("fill", interval.color)
        .attr("stroke", "#000");

    legendEntry.append("text")
        .attr("x", 30) // Align text to the right of the rectangle
        .attr("y",rectHeight-16)
        .text(interval.label) // Use dynamically computed price range
        .attr("fill", "#000")
        .style("font-size", "12px");
});

}
