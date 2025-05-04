//Issues fixed: 13
import { updateState, getState } from "../state.js";
const colorGroups = [
    { range: [1, 5691], color: "#787878" },  
    { range: [5692, 11382], color:  "#a9a9a9" },
    { range: [11383, 17074], color: "#c3c3c3" },
    { range: [17075, 22765], color: "#dadada"},
    { range: [22766, 28456], color: "#efefef" }  
];

function generateLogTicks2(min, max) {
    const ticks = [];

    
    const rangeSpan = Math.log10(max) - Math.log10(min);

    
    const bases = rangeSpan < 1
        ? [1, 2, 3, 4, 5, 6, 7, 8, 9] 
        : [1, 2, 3, 5];              

    const minExp = Math.floor(Math.log10(min));
    const maxExp = Math.ceil(Math.log10(max));

    for (let e = minExp; e <= maxExp; e++) {
        for (let base of bases) {
            const value = base * Math.pow(10, e);
            if (value >= min && value <= max) {
                ticks.push(value);
            }
        }
    }

    return ticks;
}

function generateLogTicks(min, max) {
    const ticks = [];
    const logSpan = Math.log10(max) - Math.log10(min);

    if (logSpan < 0.5) {
        
        const step = (max - min) / 10;
        for (let i = min; i <= max; i += step) {
            ticks.push(i);
        }
    } else if (logSpan < 1) {
        
        const bases = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const minExp = Math.floor(Math.log10(min));
        const maxExp = Math.ceil(Math.log10(max));
        for (let e = minExp; e <= maxExp; e++) {
            for (let base of bases) {
                const value = base * Math.pow(10, e);
                if (value >= min && value <= max) {
                    ticks.push(value);
                }
            }
        }
    } else {
        
        const bases = [1, 2, 3, 5];
        const minExp = Math.floor(Math.log10(min));
        const maxExp = Math.ceil(Math.log10(max));
        for (let e = minExp; e <= maxExp; e++) {
            for (let base of bases) {
                const value = base * Math.pow(10, e);
                if (value >= min && value <= max) {
                    ticks.push(value);
                }
            }
        }
    }

    return ticks;
}



function getGroupColor(rank) {
    if (rank === 0) return "#efefef"; 
    for (let group of colorGroups) {
        if (rank >= group.range[0] && rank <= group.range[1]) {
            return group.color;
        }
    }
    return colorGroups[colorGroups.length - 1].color; 
}



export function createScatterPlot(data, containerId, isUpdate = false) {
    d3.select(containerId).selectAll("*").remove();

    const excludedSetTypes = new Set(["promo", "funny", "memorabilia", "alchemy", "token", "minigame"]);
    const excludedSetNames = ["Arena", "Alchemy", "Digital"];
    const excludedTypes = ["Emblem", "Token"];
    data = data.filter(card =>
        !excludedSetTypes.has(card.set_type) &&
        !excludedSetNames.some(keyword => card.set_name && card.set_name.includes(keyword)) &&
        !excludedTypes.includes(card.type) &&
        !card.digital
    );

    const cardMap = new Map();

    data.forEach(card => {
        const price = isNaN(card.price_usd) || card.price_usd === null ? 0 : card.price_usd;
        if (!isNaN(card.complexity)) {
            if (!cardMap.has(card.name)) {
                cardMap.set(card.name, { ...card, prices: [], avg_price: 0 });
            }
            cardMap.get(card.name).prices.push(price);
        }
    });

    cardMap.forEach(card => {
        card.avg_price = card.prices.length > 0
            ? card.prices.reduce((sum, p) => sum + p, 0) / card.prices.length
            : 0;
    });

    const filteredData = Array.from(cardMap.values());
    const sampledData = filteredData.length > 1000 ? d3.shuffle(filteredData).slice(0, 30000) : filteredData;

    const container = d3.select(containerId).node();
    const { width, height } = container.getBoundingClientRect();
    const margin = { top: 20, right: 30, bottom: 50, left: 70 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(containerId)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const g = svg.append("g").attr("transform", `translate(${margin.left - 8.5}, ${margin.top})`);

    const originalXScale = d3.scaleLog()
        .domain([
            Math.max(0.01, d3.min(sampledData, d => d.avg_price || 0.01)),
            d3.max(sampledData, d => d.avg_price)
        ])
        .range([0, chartWidth]);

    const originalYScale = d3.scaleLinear()
        .domain([
            d3.min(sampledData, d => d.complexity),
            d3.max(sampledData, d => d.complexity)
        ])
        .range([chartHeight, 0]);

    const xScale = originalXScale.copy();
    const yScale = originalYScale.copy();

    const formatPrice = d3.format("$,.2f");

    const xAxisG = g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${chartHeight})`);

    const yAxisG = g.append("g")
        .attr("class", "y-axis");

    const numTicks = 12;
    function updateAxes() {
        const logMin = Math.log10(xScale.domain()[0]);
        const logMax = Math.log10(xScale.domain()[1]);
        const ticks = d3.range(numTicks).map(i => Math.pow(10, logMin + i / (numTicks - 1) * (logMax - logMin)));

        xAxisG.call(d3.axisBottom(xScale).tickValues(ticks).tickFormat(formatPrice));
        yAxisG.call(d3.axisLeft(yScale).ticks(numTicks));
    }

    updateAxes();

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", margin.left + chartWidth / 2)
        .attr("y", height - 15)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .text("Price (USD)");

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("x", -margin.top - chartHeight / 2)
        .attr("y", 30)
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

    const dots = gClip.selectAll("circle")
        .data(sampledData, d => d.name)
        .join("circle")
        .attr("r",2.5)
        .attr("fill", d => getGroupColor(d.edhrec_rank || 0))
        .attr("stroke", "none")
        .attr("opacity", 0.8);

    function updatePointPositions() {
        dots.attr("cx", d => xScale(d.avg_price))
            .attr("cy", d => yScale(d.complexity));
    }

    updatePointPositions();

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
    let hoverTimeout = null;


    dots.on("mouseover", function (event, d) {
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
            const tooltipNode = tooltip.node();
            const tooltipWidth = tooltipNode.offsetWidth;
            const pageX = event.pageX;
            const pageY = event.pageY;
            const padding = 10;

            let left = pageX + padding;
            if (left + tooltipWidth > window.innerWidth) {
                left = pageX - tooltipWidth - padding;
            }

            tooltip.style("left", left + "px")
                .style("top", (pageY + padding) + "px");
        })
        .on("mouseout", function () {
            tooltip.style("display", "none");
        })
        .on("click", function (event, d) {
            const currentHovered = getState().hoveredCard;
            const isSameCard = currentHovered && currentHovered.name === d.name;
        
            if (isSameCard) {
                console.log("[Scatterplot] Unhighlighting:", d.name);
                updateState({ hoveredCard: null });
            } else {
                console.log("[Scatterplot] Highlighting:", d.name);
                updateState({ hoveredCard: d });
            }
        });
        
        
        
        
    let zoomTimeout = null;
    const ZOOM_DELAY = 60; // ms — feel free to tweak (e.g., 40–100)

    const zoom = d3.zoom()
        .scaleExtent([1, 24])
        .on("zoom", event => {
            if (zoomTimeout) clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                const transform = event.transform;
                const newX = transform.rescaleX(originalXScale);
                let newY = transform.rescaleY(originalYScale);
                const [yMin, yMax] = newY.domain();

                // Clamp Y-axis so it doesn't go below 0
                if (yMin < 0) {
                    const span = yMax - yMin;
                    newY = d3.scaleLinear()
                        .domain([0, Math.max(0.001, span)])
                        .range([chartHeight, 0]);
                }

                xScale.domain(newX.domain());
                yScale.domain(newY.domain());

                updateAxes();
                updatePointPositions();
                
            }, ZOOM_DELAY);
        });


    svg.call(zoom);

    function updatePointStyle(zoomLevel) {
        dots.attr("r", d => {
            if (zoomLevel < 2) return 1.5;
            if (zoomLevel < 6) return 3;
            return 5;
        });
    }
    
    function resetZoom() {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    }

    d3.select("#reset-button").on("click", resetZoom);
}

