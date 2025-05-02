//Issues fixed: 4

const nodeColorScale = d3.scaleSequential()
    .interpolator(d3.interpolateRgb("#F0F0F0", "#373737")); // Soft to dark green



  
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

function createAlluvialChart(data, containerId, isUpdate = false) {
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
  
  data.forEach(card => {
    const orig = card.originality ? card.originality.toLowerCase() : "";
    const rarity = card.rarity ? card.rarity.toLowerCase() : "";
    
    if (originalitySet.has(orig) && raritySet.has(rarity)) {
      const key = `${orig}|${rarity}`;
      linkCounts[key] = (linkCounts[key] || 0) + 1;
      let price = parseFloat(card.price_usd);
      if (!isNaN(price)) {
        linkPriceSums[key] = (linkPriceSums[key] || 0) + price;
        linkPriceCounts[key] = (linkPriceCounts[key] || 0) + 1;
      }
    }
    
    
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
        tooltip.style("left", (event.pageX + 10) + "px")
               .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function(event, d) {
        tooltip.style("display", "none");
    
        
        d3.selectAll(".nodes rect")
          .filter(node => node.name === d.source.name || node.name === d.target.name)
          .transition()
          .duration(200)
          .attr("transform", "scale(1)") 
          .attr("stroke-width", 1); 
    });
  
  
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
      tooltip.style("left", (event.pageX + 10) + "px")
             .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function() {
      tooltip.style("display", "none");
    });
  
  
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
    .style("pointer-events", "none");





  
  const numBins = 5; 

  
  const priceStep = (sharedPriceRange.max - sharedPriceRange.min) / numBins;

  
  const dynamicLegendData = Array.from({ length: numBins }, (_, i) => ({
    label: `$${(sharedPriceRange.min + (i+1) * priceStep).toFixed(2)}`,
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
    .text("(USD)")
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
    .text("$0.00")
    .attr("fill", "#000")
    .style("font-size", "12px");

}
