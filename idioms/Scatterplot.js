const colorGroups = [
    { range: [1, 5691], color: "#787878" },  
    { range: [5692, 11382], color:  "#a9a9a9" },
    { range: [11383, 17074], color: "#c3c3c3" },
    { range: [17075, 22765], color: "#dadada"},
    { range: [22766, 28456], color: "#efefef" }  
];



function getGroupColor(rank) {
    if (rank === 0) return "#efefef"; 
    for (let group of colorGroups) {
        if (rank >= group.range[0] && rank <= group.range[1]) {
            return group.color;
        }
    }
    return colorGroups[colorGroups.length - 1].color; 
}



function createScatterPlot(data, containerId, isUpdate = false) {
    
    const excludedSetTypes = new Set(["promo", "funny", "memorabilia", "alchemy", "token", "minigame"]); 
    const excludedSetNames = ["Arena", "Alchemy", "Digital"]; 
    const excludedTypes =  ["Emblem", "Token"]
    data = data.filter(card => 
        !excludedSetTypes.has(card.set_type) && 
        !excludedSetNames.some(keyword => card.set_name && card.set_name.includes(keyword)) &&
        !excludedTypes.includes(card.type) &&

        !card.digital
        
    );

    const cardMap = new Map();

    data.forEach(card => {
        let price = isNaN(card.price_usd) || card.price_usd === null ? 0 : card.price_usd; 
        
        if (!isNaN(card.complexity)) {
            if (!cardMap.has(card.name)) {
                cardMap.set(card.name, {
                    ...card, 
                    prices: [],  
                    avg_price: 0 
                });
            }
            cardMap.get(card.name).prices.push(price);
        }
        /*if (card.name === "Zenkidar") {
            console.log(`Price Type`, typeof(cardMap.get(card.name).prices[0]));
            console.log(`Card Info Before Calcs:`, cardMap.get(card.name));
        }*/
    });

  
    cardMap.forEach(card => {
        if (card.prices.length > 0) {
            const total = card.prices.reduce((sum, p) => sum + p, 0);
            card.avg_price = total / card.prices.length;
        } else {
            card.avg_price = 0; 
        }
        /*if (card.name === "Willow Elf") {
            console.log(`Card Info After Calcs:`, cardMap.get(card.name));
        }*/
    });

    

    const filteredData = Array.from(cardMap.values());

 
    const sampledData = filteredData.length > 1000 ? d3.shuffle(filteredData).slice(0, 30000) : filteredData;
    console.log(`Scatterplot data size: ${sampledData.length}`);

  
    const container = d3.select(containerId).node();
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    
    if (isUpdate) {
        d3.select(containerId).select("svg").remove();
    }

  
    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    

    
    const xScale = d3.scaleLog()
        .domain([Math.max(0.01, d3.min(filteredData, d => d.avg_price || 0.01)), d3.max(filteredData, d => d.avg_price)])
        .range([0, chartWidth]);

    const yScale = d3.scaleLinear()
        .domain([d3.min(filteredData, d => d.complexity), d3.max(filteredData, d => d.complexity)])
        .range([chartHeight, 0]);

    const formatPrice = d3.format("$,.2f");

    
    const xAxis = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(xScale).tickFormat(formatPrice));

    const yAxis = g.append("g")
        .attr("class", "y-axis")
        .call(d3.axisLeft(yScale));

    
    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", chartWidth / 2)
        .attr("y", chartHeight + margin.bottom +5)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Price (USD)");

    
    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("x", -chartHeight / 2)
        .attr("y", 40)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Complexity");

 
svg.append("defs")
    .append("clipPath")
    .attr("id", "chart-clip")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", chartWidth)
    .attr("height", chartHeight);


const gDot = g.append("g")
    .attr("class", "dots")
    .attr("clip-path", "url(#chart-clip)");  


const gClip = gDot.append("g").attr("class", "clip-group");

   
    gClip.selectAll("circle")
        .data(filteredData, d => d.name)
        .join(
            enter => enter.append("circle")
                .attr("r", 1)
                .attr("fill", d => getGroupColor(d.edhrec_rank || 0))
                .attr("stroke", "none")
                .attr("opacity", 0.8)
                .attr("cx", d => {
                    const x = xScale(d.avg_price);
                    //if (isNaN(x)) console.log(`NaN cx for card:`, d.name, `avg_price:`, d.avg_price);
                    return x;
                })
                .attr("cy", d => yScale(d.complexity)),
            update => update,
            exit => exit.remove()
        );

   
    if (!d3.select("#scatter-tooltip").node()) {
        d3.select("body")
            .append("div")
            .attr("id", "scatter-tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0, 0, 0, 0.7)")
            .style("color", "white")
            .style("padding", "5px")
            .style("border-radius", "3px")
            .style("font-size", "12px")
            .style("pointer-events", "none")
            .style("display", "none");
    }

    const tooltip = d3.select("#scatter-tooltip");

    gDot.selectAll("circle")
        .on("mouseover", function (event, d) {
            tooltip.style("display", "block")
                .html(`
                    <strong>${d.name}</strong><br>
                    Complexity: ${d.complexity}<br>
                    EDH Rank: ${d.edhrec_rank || "N/A"}<br>
                    Supertypes: ${d.supertype}<br>
                    Type: ${d.type}<br>
                    Subtype: ${d.subtype}<br>
                    Colors: ${d.color_identity}<br>
                    Avg Price: $${d.avg_price.toFixed(2)}<br>
                `);
        })
        .on("mousemove", function (event) {
            tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("display", "none");
        });
    const zoom = d3.zoom()
        .scaleExtent([0.5, 28])
        .on("zoom", zoomed);

    svg.call(zoom);

    let isZooming = false;
    function zoomed(event) {
        if (!isZooming) {
            requestAnimationFrame(() => {
                
                gClip.attr("transform", event.transform);
                xAxis.call(d3.axisBottom(event.transform.rescaleX(xScale)).tickFormat(formatPrice));
                yAxis.call(d3.axisLeft(event.transform.rescaleY(yScale)));
                isZooming = false;
            });
            isZooming = true;
        }
    }

    

    
    function resetZoom() {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    }

    d3.select("#reset-button").on("click", resetZoom);
}
