
import { updateState, getState } from "../state.js";
import { updateFilterPanel } from "./FilterPanel.js"; 

  const customOrder = [
    "original", "reprint", "functional reprint",
    "common", "uncommon", "rare", "mythic", "special", "bonus"];

function getDiscreteColor(percentage) {
  if (percentage < 20) return "#ceb397";
  if (percentage < 40) return "#b8997a";
  if (percentage < 60) return "#998066";
  if (percentage < 80) return "#736659";
  return "#594a3a"; 
}
  
let localChartFilters = {
  Originality: new Set(),
  Rarity: new Set()
};
let localLinkFilters = new Set(); 


function applyColorScale(selection, attrName, priceRange) {
  selection.attr(attrName, d => getNodeColor(d.avgPrice, priceRange.min, priceRange.max));
}

function formatPriceLabel(priceAttr) {
    return priceAttr
      .replace("price_", "") 
      .replace(/_/g, " ")    
      .toUpperCase();        
  }
    
  function formatPriceSymbol(attr) {
    if (attr.toLowerCase().includes("usd")) return "$";
    if (attr.toLowerCase().includes("eur")) return "€";
    return "";
  }
  


const infoTooltipText = `
<strong>Chart Interactions:</strong><br>
• <strong>Click</strong> on a node or link: temporarily filter the chart.<br>
• <strong>Double-click</strong> on a node or link: apply a global filter to the dataset.<br>
• <strong>Hover</strong> on nodes or links: see details.<br>
`;




function getMarginLeftOffset(screenWidth) {
  const baseOffset = 35;
  const maxOffset = 50;
  const maxScreenWidth = 1600;

  if (screenWidth < maxScreenWidth) return baseOffset;
  if (screenWidth >= maxScreenWidth) return maxOffset;
}

function getNodeColor(price, minPrice, maxPrice) {
  let percentage = ((price - minPrice) / (maxPrice - minPrice)) * 100;
  return getDiscreteColor(percentage); 
}

export function createAlluvialChart(data, containerId, isUpdate = false, selectedPriceAttribute = "price_eur") {
const container = d3.select(containerId);
const { width, height } = container.node().getBoundingClientRect();
const svgWidth = width;
const svgHeight = height;
const screenSize = d3.select("body").node().getBoundingClientRect();

  
const marginLeftOffset = getMarginLeftOffset(screenSize.width);
const chartWidth = svgWidth * 0.85
const chartHeight = svgHeight * 0.75
const chartXOffset = (svgWidth - chartWidth) / 2 - 40; 
const chartYOffset = (svgHeight - chartHeight) / 2; 

const margin = { top: 45, right: 18, bottom: 40, left: 10 };
const originalitySet = new Set();
const raritySet = new Set();
data.forEach(card => {
    if (card.originality) originalitySet.add(card.originality.toLowerCase());
    if (card.rarity) raritySet.add(card.rarity.toLowerCase());
  });

const originalityCategories = Array.from(originalitySet).sort();
const rarityCategories = Array.from(raritySet).sort();
  
const priceAttr = selectedPriceAttribute;
const origPriceSums = {}, origPriceCounts = {},
        rarityPriceSums = {}, rarityPriceCounts = {},
        linkCounts = {}, linkPriceSums = {}, linkPriceCounts = {};
  
originalityCategories.forEach(o => (origPriceSums[o] = origPriceCounts[o] = 0));
rarityCategories.forEach(r => (rarityPriceSums[r] = rarityPriceCounts[r] = 0));




   data.forEach(card => {
    const orig = card.originality?.toLowerCase() || "";
    const rarity = card.rarity?.toLowerCase() || "";
    if (!originalitySet.has(orig) || !raritySet.has(rarity)) return;

    const key = `${orig}|${rarity}`;
    linkCounts[key] = (linkCounts[key] || 0) + 1;

    const price = parseFloat(card[priceAttr]);
    if (!isNaN(price)) {
      linkPriceSums[key] = (linkPriceSums[key] || 0) + price;
      linkPriceCounts[key] = (linkPriceCounts[key] || 0) + 1;
      origPriceSums[orig] += price;
      origPriceCounts[orig] += 1;
      rarityPriceSums[rarity] += price;
      rarityPriceCounts[rarity] += 1;
    }
  });
  
  
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
  
  
  const nodes = [
    ...originalityCategories.map(o => ({
      name: o,
      avgPrice: origPriceCounts[o] ? origPriceSums[o] / origPriceCounts[o] : 0
    })),
    ...rarityCategories.map(r => ({
      name: r,
      avgPrice: rarityPriceCounts[r] ? rarityPriceSums[r] / rarityPriceCounts[r] : 0
    }))
  ].sort((a, b) => customOrder.indexOf(a.name) - customOrder.indexOf(b.name));
  
  const nodeIndexMap = Object.fromEntries(nodes.map((n, i) => [n.name, i]));
  const links = originalityCategories.flatMap(orig =>
    rarityCategories.map(rarity => {
      const key = `${orig}|${rarity}`;
      return {
        source: nodeIndexMap[orig],
        target: nodeIndexMap[rarity],
        value: linkCounts[key] || 0,
        avgPrice: linkPriceCounts[key] ? linkPriceSums[key] / linkPriceCounts[key] : 0
      };
    })
  );
  
 
  

 let svg = container.select("svg");
  if (svg.empty()) {
    svg = container.append("svg").attr("width", svgWidth).attr("height", svgHeight);
  }
  svg.selectAll("g").remove();
  const sankeyGroup = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

const infoGroup = svg.append("g")
  .attr("class", "info-icon")
  .attr("transform", `translate(20, 30)`);

infoGroup.append("circle")
  .attr("r", 10)
  .attr("fill", "#8A9CE4")
  .attr("stroke", "#fff");

infoGroup.append("text")
  .attr("text-anchor", "middle")
  .attr("dy", "0.35em")
  .attr("font-size", "12px")
  .attr("font-weight", "bold")
  .attr("fill","#fff")
  .text("ℹ")
  .attr("pointer-events", "none");


  infoGroup
  .on("mouseover", function(event) {
    tooltip.style("display", "block")
           .html(infoTooltipText);
  })
  .on("mousemove", function(event) {
    const tooltipWidth = tooltip.node().offsetWidth;
    const tooltipHeight = tooltip.node().offsetHeight;

    let x = event.pageX + 10;
    let y = event.pageY + 10;

    if (x + tooltipWidth > window.innerWidth) {
      x = window.innerWidth - tooltipWidth - 10;
    }
    if (y + tooltipHeight > window.innerHeight) {
      y = window.innerHeight - tooltipHeight - 10;
    }

    tooltip
      .style("left", `${x}px`)
      .style("top", `${y}px`);
  })
  .on("mouseout", function() {
    tooltip.style("display", "none");
  });

  const sankey = d3.sankey().nodeWidth(20).nodePadding(20).extent([[0, 0], [chartWidth, chartHeight]]);
  const sankeyData = sankey({
    nodes: nodes.map(d => ({ ...d })),
    links: links.map(d => ({ ...d }))
  });

  const leftNodes = sankeyData.nodes.filter(n => n.x0 === d3.min(sankeyData.nodes, d => d.x0));
const totalLeftHeight = d3.max(leftNodes, d => d.y1) - d3.min(leftNodes, d => d.y0);
const offset = (chartHeight - totalLeftHeight) / 2;
leftNodes.forEach(node => {
  node.y0 += offset;
  node.y1 += offset;
});
sankey.update(sankeyData); 
  
const allPrices = [...sankeyData.nodes.map(d => d.avgPrice), ...sankeyData.links.map(d => d.avgPrice)];
const priceRange = { min: d3.min(allPrices), max: d3.max(allPrices) };

const tooltip = d3.select("#tooltip");

sankeyGroup.selectAll(".link")
    .data(sankeyData.links, d => `${d.source.name}|${d.target.name}`)
    .data(sankeyData.links.sort((a, b) => b.width - a.width))
    .join(
      enter => enter.append("path")
        .attr("class", "link")
        .attr("d", d3.sankeyLinkHorizontal())
        .attr("fill", "none")
        .attr("stroke-opacity", 0.5)
        .attr("stroke-width", d => Math.max(1, d.width))
        .call(sel => applyColorScale(sel, "stroke", priceRange))
.on("mouseover", function(event, d) {
  tooltip.style("display", "block")
         .html(`From: ${d.source.name}<br>To: ${d.target.name}<br>Cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(2)}`);
  
  d3.selectAll("g.node rect")
    .filter(node => node.name === d.source.name || node.name === d.target.name)
    .transition()
    .duration(200)
    .attr("transform", node => {
      const centerX = node.x0 + (node.x1 - node.x0) / 2;
      const centerY = node.y0 + (node.y1 - node.y0) / 2;
      return `translate(${centerX}, ${centerY}) scale(1.2) translate(${-centerX}, ${-centerY})`;
    })
    .attr("stroke-width", 3);
})
        .on("mousemove", function(event) {
  const tooltipWidth = tooltip.node().offsetWidth;
  const tooltipHeight = tooltip.node().offsetHeight;

  let x = event.pageX + 10;
  let y = event.pageY + 10;

  if (x + tooltipWidth > window.innerWidth) {
    x = window.innerWidth - tooltipWidth - 10;
  }
  if (y + tooltipHeight > window.innerHeight) {
    y = window.innerHeight - tooltipHeight - 10;
  }

  tooltip
    .style("left", `${x}px`)
    .style("top", `${y}px`);
})
.on("mouseout", function(event, d) {
  tooltip.style("display", "none");

  d3.selectAll("g.node rect")
    .filter(node => node.name === d.source.name || node.name === d.target.name)
    .transition()
    .duration(200)
    .attr("transform", null)
    .attr("stroke-width", 1);
})
        .on("click", function(event, d) {
  const key = `${d.source.name}|${d.target.name}`;

  if (localLinkFilters.has(key)) {
    localLinkFilters.delete(key);
  } else {
    localLinkFilters.add(key);
  }

  applyLocalLinkAndNodeFilter();
})
        .on("dblclick", function(event, d) {
      const currentState = getState();
      const updatedFilters = {};
    
      for (const key in currentState.selectedFilters) {
        updatedFilters[key] = new Set(currentState.selectedFilters[key]);
      }
    
      const orig = d.source.name;
      const rarity = d.target.name;
    
      
      if (updatedFilters["Originality"].has(orig)) {
        updatedFilters["Originality"].delete(orig);
      } else {
        updatedFilters["Originality"].add(orig);
      }
    
      
      if (updatedFilters["Rarity"].has(rarity)) {
        updatedFilters["Rarity"].delete(rarity);
      } else {
        updatedFilters["Rarity"].add(rarity);
      }
    
      updateState({ selectedFilters: updatedFilters });
      updateFilterPanel(getState().originalData, updatedFilters); 

    }),
      update => update
        .attr("d", d3.sankeyLinkHorizontal())
        .attr("stroke-width", d => Math.max(1, d.width))
        .call(sel => applyColorScale(sel, "stroke", priceRange)),
      exit => exit.remove()
    );





    
    
  function applyLocalLinkAndNodeFilter() {
  const activeLinks = Array.from(localLinkFilters);
  const activeSources = new Set();
  const activeTargets = new Set();


  activeLinks.forEach(linkKey => {
    const [source, target] = linkKey.split("|");
    activeSources.add(source);
    activeTargets.add(target);
  });


  d3.selectAll("path.link").each(function(d) {
    const key = `${d.source.name}|${d.target.name}`;
    const show = localLinkFilters.size === 0 || localLinkFilters.has(key);

    d3.select(this)
      .classed("alluvial-hidden", !show)
      .classed("alluvial-visible", show);
  });


  d3.selectAll("g.node rect").each(function(d) {
    const isLeft = d.x0 === 0;
    const show = localLinkFilters.size === 0 ||
                 (isLeft && activeSources.has(d.name)) ||
                 (!isLeft && activeTargets.has(d.name));

    d3.select(this)
      .classed("alluvial-hidden", !show)
      .classed("alluvial-visible", show);
  });


  d3.selectAll("g.node text").each(function(d) {
    const isLeft = d.x0 === 0;
    const show = localLinkFilters.size === 0 ||
                 (isLeft && activeSources.has(d.name)) ||
                 (!isLeft && activeTargets.has(d.name));

    d3.select(this)
      .classed("alluvial-hidden", !show)
      .classed("alluvial-visible", show);
  });
}


  
const nodeGroups = sankeyGroup.selectAll(".node")
    .data(sankeyData.nodes, d => d.name)
    .join(
      enter => {
        const g = enter.append("g").attr("class", "node");
        g.append("rect")
          .attr("x", d => Math.round(d.x0))
          .attr("y", d => Math.round(d.y0))
          .attr("width", d => d.x1 - d.x0)
          .attr("height", d => d.y1 - d.y0)
          .style("shape-rendering", "crispEdges")
          .attr("stroke", "#000")
          .call(sel => applyColorScale(sel, "fill", priceRange))
          .on("mouseover", function(event, d) {
      tooltip.style("display", "block")
             .html(`Category: ${d.name}<br>Total cards: ${d.value}<br>Avg Price: $${d.avgPrice.toFixed(2)}`);
    })
          .on("mousemove", function(event) {
  const tooltipWidth = tooltip.node().offsetWidth;
  const tooltipHeight = tooltip.node().offsetHeight;

  let x = event.pageX + 10;
  let y = event.pageY + 10;

  if (x + tooltipWidth > window.innerWidth) {
    x = window.innerWidth - tooltipWidth - 10;
  }
  if (y + tooltipHeight > window.innerHeight) {
    y = window.innerHeight - tooltipHeight - 10;
  }

  tooltip
    .style("left", `${x}px`)
    .style("top", `${y}px`);
})
          .on("mouseout", function() {
      tooltip.style("display", "none");
    })
          .on("click", function(event, d) {
  const category = d.x0 === 0 ? "Originality" : "Rarity";
  const name = d.name;


  if (localChartFilters[category].has(name)) {
    localChartFilters[category].delete(name);
  } else {
    localChartFilters[category].add(name);
  }

  applyLocalChartFilter(); 
})

          .on("dblclick", function(event, d) {
      const category = d.x0 === 0 ? "Originality" : "Rarity"; 
      const currentState = getState();
      const updatedFilters = {};
  
      for (const key in currentState.selectedFilters) {
        updatedFilters[key] = new Set(currentState.selectedFilters[key]);
      }
  
      
      if (updatedFilters[category].has(d.name)) {
        updatedFilters[category].delete(d.name);
      } else {
        updatedFilters[category].add(d.name);
      }
      
      updateState({ selectedFilters: updatedFilters });
      updateFilterPanel(getState().originalData, updatedFilters); 

    });

        g.append("text")
          .attr("x", d => {
      const centerX = (d.x0 + d.x1) / 2;
      const isLeftSide = centerX < width / 2;
      return isLeftSide ? d.x0 : d.x1;
  })
          .attr("y", d => d.y0 - 5)
          .attr("text-anchor", d => {
      const centerX = (d.x0 + d.x1) / 2;
      const isLeftSide = centerX < width / 2;
      return isLeftSide ? "start" : "end";
  })
          .text(d => d.name)
          .attr("font-size", "12px")
          .style("shape-rendering", "crispEdges")
          .attr("fill", "#000")
          .style("pointer-events", "auto")
          .on("mouseover", function(event, d) {
    const explanations = {
      "original": `<strong>Original Card</strong><br>This is the first-ever printing of a card, typically from its debut set.`,
      "reprint": `<strong>Reprint</strong><br>A card that has been printed again in a later set without functional changes.`,
      "functional reprint": `<strong>Functional Reprint</strong><br>A different card with identical rules text and function, but a different name or flavor.`
    };
  
    const key = d.name.toLowerCase();
    if (explanations[key]) {
      tooltip
        .style("display", "block")
        .html(explanations[key]);
    }
  })
          .on("mousemove", function(event) {
  const tooltipWidth = tooltip.node().offsetWidth;
  const tooltipHeight = tooltip.node().offsetHeight;

  let x = event.pageX + 10;
  let y = event.pageY + 10;

  if (x + tooltipWidth > window.innerWidth) {
    x = window.innerWidth - tooltipWidth - 10;
  }
  if (y + tooltipHeight > window.innerHeight) {
    y = window.innerHeight - tooltipHeight - 10;
  }

  tooltip
    .style("left", `${x}px`)
    .style("top", `${y}px`);
})
          .on("mouseout", function() {
    tooltip.style("display", "none");
  });
        return g;
      },
      update => update.select("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("height", d => d.y1 - d.y0)
        .call(sel => applyColorScale(sel, "fill", priceRange)),
      exit => exit.remove()
    );
  
function applyLocalChartFilter() {
  const origSet = localChartFilters.Originality;
  const raritySet = localChartFilters.Rarity;

  d3.selectAll("g.node rect").each(function(d) {
    const isOrig = d.x0 === 0;
    const category = isOrig ? "Originality" : "Rarity";
    const filterSet = isOrig ? origSet : raritySet;
    const match = filterSet.size === 0 || filterSet.has(d.name);

    d3.select(this)
      .classed("alluvial-hidden", !match)
      .classed("alluvial-visible", match);
  });

  d3.selectAll("path.link").each(function(d) {
    const origMatch = origSet.size === 0 || origSet.has(d.source.name);
    const rarityMatch = raritySet.size === 0 || raritySet.has(d.target.name);
    const match = origMatch && rarityMatch;

    d3.select(this)
      .classed("alluvial-hidden", !match)
      .classed("alluvial-visible", match);
  });
}

  

  
  const numBins = 5; 

  
  const priceStep = (priceRange.max - priceRange.min) / numBins;

  
  const symbol = formatPriceSymbol(priceAttr);

  const dynamicLegendData = Array.from({ length: numBins }, (_, i) => ({
    label: `${symbol ? symbol + " " : ""}${(priceRange.min + (i + 1) * priceStep).toFixed(2)}`,
    color: getDiscreteColor(i * (100 / numBins))
  })).reverse();
  
  


    
  
const legendX = chartWidth + margin.right;  // slight adjustment inward
const legendY = margin.top;
const rectHeight = 20;
const extraSpacing = 0;

const legend = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${legendX}, ${legendY})`);

    legend.append("text")
    .attr("x", 0)
    .attr("y", 120)
    .text("Avg Price")
    .attr("fill", "#000")
    .style("font-size", "12px")
    .style("shape-rendering", "crispEdges")
    .style("font-weight", "bold");

legend.append("text")
    .attr("x", 0)
    .attr("y", 135)
    .text("(" + formatPriceLabel(priceAttr)+ ")")
    .attr("fill", "#000")
    .style("font-size", "12px")
    .style("shape-rendering", "crispEdges")
    .style("font-weight", "bold");


dynamicLegendData.forEach((interval, i) => {
    const legendEntry = legend.append("g")
      .attr("transform", `translate(0, ${i * (rectHeight + extraSpacing)})`);

    legendEntry.append("rect")
        .attr("width", 20)
        .attr("height", rectHeight)
        .style("shape-rendering", "crispEdges")
        .attr("fill", interval.color)
        .attr("stroke", "#000");

    legendEntry.append("text")
        .attr("x", 30) 
        .attr("y",rectHeight-16)
        .text(interval.label) 
        .attr("fill", "#000")
        .style("font-size", "12px")
        .style("shape-rendering", "crispEdges");
});


const zeroEntry = legend.append("g")
    .attr("transform", `translate(0, ${numBins * (rectHeight + extraSpacing)})`);

zeroEntry.append("text")
    .attr("x", 30)
    .attr("y", rectHeight - 16)
    .text(`${symbol} 0.00`)
    .attr("fill", "#000")
    .style("font-size", "12px")
    .style("shape-rendering", "crispEdges");

}


export function highlightAlluvialElements(hoveredCards) {
  if (!hoveredCards || hoveredCards.length === 0) {
    // Remove all highlights if no hovered cards
    d3.selectAll("g.node rect").classed("highlighted", false);
    return;
  }

  // Build a set of hovered rarity categories
  const hoveredRarities = new Set(
    hoveredCards.map(card => card.rarity?.toLowerCase()).filter(Boolean)
  );


  // Highlight only the rarity nodes (x0 !== 0)
  d3.selectAll("g.node rect").classed("highlighted", d => {
    const isRarityNode = d.x0 !== 0;
    return isRarityNode && hoveredRarities.has(d.name);
  });
}

export function highlightAlluvialElementsHoverOnly(card) {
  if (!card || !card.rarity) return;

  const rarity = card.rarity.toLowerCase();
  

  
  d3.selectAll("g.node rect")
    .filter(d => d.x0 !== 0 && d.name === rarity)
    .classed("hover-temp", true);
}

export function clearAlluvialHoverOnly() {
  d3.selectAll("g.node rect").classed("hover-temp", false);
}
export function highlightAlluvialElementsHoverOnlyFromSet(originalities, rarities) {
  d3.selectAll("g.node rect").classed("hover-temp", d =>
    (d.x0 === 0 && originalities.has(d.name)) ||
    (d.x0 !== 0 && rarities.has(d.name))
  );
}




