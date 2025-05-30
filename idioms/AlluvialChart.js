//Issues fixed: 4
import { updateState, getState } from "../state.js";
import { updateFilterPanel } from "./FilterPanel.js"; 
const nodeColorScale = d3.scaleSequential()
    .interpolator(d3.interpolateRgb("#F0F0F0", "#373737")); // Soft to dark green

let localChartFilters = {
  Originality: new Set(),
  Rarity: new Set()
};
let localLinkFilters = new Set(); // each entry will be a string like "original|common"

function formatPriceLabel(priceAttr) {
    return priceAttr
      .replace("price_", "") // remove prefix
      .replace(/_/g, " ")    // replace underscores with spaces
      .toUpperCase();        // uppercase
  }
    
  function formatPriceSymbol(attr) {
    if (attr.toLowerCase().includes("usd")) return "$";
    if (attr.toLowerCase().includes("eur")) return "€";
    return "";
  }
   
  function applyFisheyeEffect(rects, xScale, yScale, event) {
    const [mouseX, mouseY] = d3.pointer(event);

    rects.each(function (d) {
        
        let x = xScale(d.x0);
        let y = yScale(d.y0);
        let width = xScale(d.x1) - xScale(d.x0);
        let height = yScale(d.y1) - yScale(d.y0);

        
        let dx = Math.abs(mouseX - (x + width / 2));
        let dy = Math.abs(mouseY - (y + height / 2));
        let distance = Math.sqrt(dx * dx + dy * dy);

        
        let scale = Math.max(1.2, 3 - (distance / 150)); 

        d3.select(this)
            .transition()
            .duration(100)
            .attr("x", x - (width * (scale - 1)) / 2)
            .attr("y", y - (height * (scale - 1)) / 2)
            .attr("width", width * scale)
            .attr("height", height * scale);
    });
}
  

/*function getDiscreteColor(percentage) {
  if (percentage < 20) return "#f0f0f0";
  if (percentage < 40) return "#cbcbcb";
  if (percentage < 60) return "#9c9c9c";
  if (percentage < 80) return "#6a6a6a";
  return "#373737"; 
}*/

function getDiscreteColor(percentage) {
  if (percentage < 20) return "#efefef";
  if (percentage < 40) return "#dadada";
  if (percentage < 60) return "#c3c3c3";
  if (percentage < 80) return "#a9a9a9";
  return "#787878"; 
}



function getPriceRange(data) {
  const prices = data.map(d => d.avgPrice).filter(price => !isNaN(price));
  return {
      min: d3.min(prices),
      max: d3.max(prices)
  };
}


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

export function createAlluvialChart(data, containerId, isUpdate = false, selectedPriceAttribute = "price_usd") {

  d3.select(containerId).selectAll("*").remove();

 
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
  
  
  const originalityCategories = Array.from(originalitySet).sort();
  const rarityCategories = Array.from(raritySet).sort();
  
  
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
  
  
  let linkCounts = {};
  const linkPriceSums = {};
  const linkPriceCounts = {};

  const priceAttr = selectedPriceAttribute;

  data.forEach(card => {
    const orig = card.originality ? card.originality.toLowerCase() : "";
    const rarity = card.rarity ? card.rarity.toLowerCase() : "";
    
    if (originalitySet.has(orig) && raritySet.has(rarity)) {
      const key = `${orig}|${rarity}`;
      linkCounts[key] = (linkCounts[key] || 0) + 1;
      
      let price = parseFloat(card[priceAttr]);

      if (!isNaN(price)) {
        linkPriceSums[key] = (linkPriceSums[key] || 0) + price;
        linkPriceCounts[key] = (linkPriceCounts[key] || 0) + 1;
      }
    }
    
    
    let price = parseFloat(card[priceAttr]);

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
  
  
  const origNodes = originalityCategories.map(orig => ({
    name: orig,
    avgPrice: origPriceCounts[orig] > 0 ? origPriceSums[orig] / origPriceCounts[orig] : 0
  }));
  
  const rarityNodes = rarityCategories.map(rarity => ({
    name: rarity,
    avgPrice: rarityPriceCounts[rarity] > 0 ? rarityPriceSums[rarity] / rarityPriceCounts[rarity] : 0
  }));
  
  const customOrder = [
    "original", "reprint", "functional reprint",
    "common", "uncommon", "rare", "mythic", "special", "bonus"];



    const nodes = origNodes.concat(rarityNodes).sort((a, b) => {
      return customOrder.indexOf(a.name) - customOrder.indexOf(b.name);
  });
  
  const nodeIndexMap = {};
nodes.forEach((node, index) => {
    nodeIndexMap[node.name] = index;
});


  
  const links = [];
originalityCategories.forEach(orig => {
    rarityCategories.forEach(rarity => {
        const key = `${orig}|${rarity}`;
        links.push({
            source: nodeIndexMap[orig], 
            target: nodeIndexMap[rarity], 
            value: linkCounts[key],
            avgPrice: linkPriceCounts[key] > 0 ? linkPriceSums[key] / linkPriceCounts[key] : 0
        });
    });
});
  
 
  const container = d3.select(containerId).node();
  const{width, height} = container.getBoundingClientRect();

  
  const svgWidth = width;
  const svgHeight = height;

 
  if (isUpdate) {
    d3.select(containerId).select("svg").remove();
  }
  
  const screenSize = d3.select("body").node().getBoundingClientRect();

  
 const marginLeftOffset = getMarginLeftOffset(screenSize.width);
const chartHeight = svgHeight *0.75
const chartWidth = svgWidth * 0.85

const margin = { top: 20, right: 60, bottom: 20, left: (svgWidth - chartWidth)/2 - marginLeftOffset }; 


const chartXOffset = (svgWidth - chartWidth) / 2 - 40; 
const chartYOffset = (svgHeight - chartHeight) / 2; 
  
  const svg = d3.select(containerId)
  .append("svg")
  .attr("width", svgWidth)
  .attr("height", svgHeight)
  .append("g")
  .attr("transform", `translate(${chartXOffset}, ${chartYOffset})`); 
 ;


 const sankeyGroup = svg.append("g");
 

  const sankeyGenerator = d3.sankey()
    .nodeWidth(20)
    .nodePadding(20)
    .extent([[0, 0], [chartWidth, chartHeight]]);
  
  const sankeyData = sankeyGenerator({
    nodes: nodes.map(d => Object.assign({}, d)),
    links: links.map(d => Object.assign({}, d))
  });
  

const leftNodes = sankeyData.nodes.filter(n => n.x0 === d3.min(sankeyData.nodes, d => d.x0));


const totalLeftHeight = d3.max(leftNodes, d => d.y1) - d3.min(leftNodes, d => d.y0);


const offset = (chartHeight - totalLeftHeight) / 2;


leftNodes.forEach(node => {
  node.y0 += offset;
  node.y1 += offset;
});
sankeyGenerator.update(sankeyData);



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
 
      sankeyGroup.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(sankeyData.links.sort((a, b) => b.width - a.width)) 
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
    
        
        d3.selectAll(".nodes rect")
          .filter(node => node.name === d.source.name || node.name === d.target.name)
          .transition()
          .duration(200)
          .attr("transform", d => `translate(${d.x0 + (d.x1 - d.x0) / 2}, ${d.y0 + (d.y1 - d.y0) / 2}) scale(1.2) translate(${- (d.x0 + (d.x1 - d.x0) / 2)}, ${- (d.y0 + (d.y1 - d.y0) / 2)})`)
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
    
        
        d3.selectAll(".nodes rect")
          .filter(node => node.name === d.source.name || node.name === d.target.name)
          .transition()
          .duration(200)
          .attr("transform", "scale(1)") 
          .attr("stroke-width", 1); 
    })
    .on("click", function(event, d) {
  const key = `${d.source.name}|${d.target.name}`;

  if (localLinkFilters.has(key)) {
    localLinkFilters.delete(key);
  } else {
    localLinkFilters.add(key);
  }

  applyLocalLinkAndNodeFilter();// hide/show based on link filter
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

    });
    
    
  function applyLocalLinkAndNodeFilter() {
  const activeLinks = Array.from(localLinkFilters);
  const activeSources = new Set();
  const activeTargets = new Set();

  // Collect node names from active links
  activeLinks.forEach(linkKey => {
    const [source, target] = linkKey.split("|");
    activeSources.add(source);
    activeTargets.add(target);
  });

  // Apply to links
  d3.selectAll(".links path").each(function(d) {
    const key = `${d.source.name}|${d.target.name}`;
    const show = localLinkFilters.size === 0 || localLinkFilters.has(key);

    d3.select(this)
      .classed("alluvial-hidden", !show)
      .classed("alluvial-visible", show);
  });

  // Apply to nodes
  d3.selectAll(".nodes rect").each(function(d) {
    const isLeft = d.x0 === 0;
    const show = localLinkFilters.size === 0 ||
                 (isLeft && activeSources.has(d.name)) ||
                 (!isLeft && activeTargets.has(d.name));

    d3.select(this)
      .classed("alluvial-hidden", !show)
      .classed("alluvial-visible", show);
  });

  // Optional: also dim labels if you want
  d3.selectAll(".nodes text").each(function(d) {
    const isLeft = d.x0 === 0;
    const show = localLinkFilters.size === 0 ||
                 (isLeft && activeSources.has(d.name)) ||
                 (!isLeft && activeTargets.has(d.name));

    d3.select(this)
      .classed("alluvial-hidden", !show)
      .classed("alluvial-visible", show);
  });
}


  
  const node = sankeyGroup.append("g")
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

  // Toggle filter
  if (localChartFilters[category].has(name)) {
    localChartFilters[category].delete(name);
  } else {
    localChartFilters[category].add(name);
  }

  applyLocalChartFilter(); // update visibility
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
      updateFilterPanel(getState().originalData, updatedFilters); // Ensure panel reflects the change

    });
  
    function applyLocalChartFilter() {
  const origSet = localChartFilters.Originality;
  const raritySet = localChartFilters.Rarity;

  d3.selectAll(".nodes rect").each(function(d) {
    const isOrig = d.x0 === 0;
    const category = isOrig ? "Originality" : "Rarity";
    const filterSet = isOrig ? origSet : raritySet;
    const match = filterSet.size === 0 || filterSet.has(d.name);

    d3.select(this)
      .classed("alluvial-hidden", !match)
      .classed("alluvial-visible", match);
  });

  d3.selectAll(".links path").each(function(d) {
    const origMatch = origSet.size === 0 || origSet.has(d.source.name);
    const rarityMatch = raritySet.size === 0 || raritySet.has(d.target.name);
    const match = origMatch && rarityMatch;

    d3.select(this)
      .classed("alluvial-hidden", !match)
      .classed("alluvial-visible", match);
  });
}

  
    node.append("text")
  .attr("x", d => {
      const centerX = (d.x0 + d.x1) / 2;
      const isLeftSide = centerX < width / 2;
      return isLeftSide ? d.x0 : d.x1;
  })
  .attr("y", d => d.y0 - 5)
  .attr("dy", "0em")
  .attr("text-anchor", d => {
      const centerX = (d.x0 + d.x1) / 2;
      const isLeftSide = centerX < width / 2;
      return isLeftSide ? "start" : "end";
  })
  .text(d => d.name)
  .attr("font-size", "12px")
  .attr("fill", "#000")
  .style("cursor", "help")
  .style("pointer-events", "auto") // Allow interaction
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






  
  const numBins = 5; 

  
  const priceStep = (sharedPriceRange.max - sharedPriceRange.min) / numBins;

  
  const symbol = formatPriceSymbol(priceAttr);

  const dynamicLegendData = Array.from({ length: numBins }, (_, i) => ({
    label: `${symbol ? symbol + " " : ""}${(sharedPriceRange.min + (i + 1) * priceStep).toFixed(2)}`,
    color: getDiscreteColor(i * (100 / numBins))
  })).reverse();
  
  


    
  
const legendX = margin.left + chartWidth;  
const legendY = margin.top - 20  
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
    .style("font-weight", "bold");

legend.append("text")
    .attr("x", 0)
    .attr("y", 135)
    .text("(" + formatPriceLabel(priceAttr)+ ")")
    .attr("fill", "#000")
    .style("font-size", "12px")
    .style("font-weight", "bold");


dynamicLegendData.forEach((interval, i) => {
    const legendEntry = legend.append("g")
      .attr("transform", `translate(0, ${i * (rectHeight + extraSpacing)})`);

    legendEntry.append("rect")
        .attr("width", 20)
        .attr("height", rectHeight)
        .attr("fill", interval.color)
        .attr("stroke", "#000");

    legendEntry.append("text")
        .attr("x", 30) 
        .attr("y",rectHeight-16)
        .text(interval.label) 
        .attr("fill", "#000")
        .style("font-size", "12px");
});


const zeroEntry = legend.append("g")
    .attr("transform", `translate(0, ${numBins * (rectHeight + extraSpacing)})`);

zeroEntry.append("text")
    .attr("x", 30)
    .attr("y", rectHeight - 16)
    .text(`${symbol} 0.00`)
    .attr("fill", "#000")
    .style("font-size", "12px");

}
export function highlightAlluvialAllElements(hovered) {
  d3.selectAll(".nodes rect, .links path").classed("highlighted", function(d) {
    if (!hovered) return false;

    if (this.tagName === "rect") {
      return d.name === hovered.originality?.toLowerCase() || d.name === hovered.rarity?.toLowerCase();
    }

    if (this.tagName === "path") {
      return d.source?.name === hovered.originality?.toLowerCase() &&
             d.target?.name === hovered.rarity?.toLowerCase();
    }

    return false;
  });
}

export function highlightAlluvialElements(hoveredCards) {
  const hoveredRarities = new Set(
    (hoveredCards || []).map(card => card.rarity?.toLowerCase()).filter(Boolean)
  );

  d3.selectAll(".nodes rect").classed("highlighted", d =>
    hoveredRarities.has(d.name)
  );
}



