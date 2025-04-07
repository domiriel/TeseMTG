function createStackedLineChart(data, containerId, isUpdate = false) {
    
    data = data.filter(card => card.name !== "Gleemax");

    const groupedData = d3.rollups(
        data,
        cards => {
            const reprints = cards.filter(c => c.originality === 'functional reprint').length;
            const avgComplexity = d3.mean(cards, c => +c.complexity || 0);
            const avgCMC = d3.mean(cards, c => +c.cmc || 0);
            

            if (cards[0] && new Date(cards[0].release_date).getFullYear() === 2004) {
                cards.forEach(c => {
                    const raw = c.cmc;
                    const numeric = +raw;
                    if (isNaN(numeric) || numeric > 100) {
                        console.warn("Suspicious CMC in 2004:", {
                            name: c.name,
                            cmc: c.cmc,
                            set: c.set_name
                        });
                    }
                });
            }
            return {
                
                reprints,
                avgComplexity,
                avgCMC
            };
        },
        d => new Date(d.release_date).getFullYear()
    )
    .map(([year, values]) => {
        console.log(`Year: ${year}`);
        console.log(`  Reprints: ${values.reprints}`);
        console.log(`  Avg Complexity: ${values.avgComplexity?.toFixed(2)}`);
        console.log(`  Avg CMC: ${values.avgCMC?.toFixed(2)}`);
        return {
            year: new Date(year, 0, 1),
            ...values
        };
    })
    .sort((a, b) => a.year - b.year);
    
    



    const metrics = [
        { key: "reprints", label: "Func. Reprints", color: "#c3c3c3" },
        { key: "avgComplexity", label: "Avg. Complexity", color: "#c3c3c3" },
        { key: "avgCMC", label: "Average CMC", color: "#c3c3c3" }
    ];
    
    const container = d3.select(containerId);

    const containerBounds = container.node().getBoundingClientRect();
    const containerWidth = containerBounds.width * 0.9;
    const containerHeight = containerBounds.height;

    const margin = { top: 20, right: 50, bottom: 30, left: 60 };
    const width = containerWidth - margin.left - margin.right;
    const chartHeight = containerHeight / 4; 
    const chartSpacing = 10;
    const height = (chartHeight + chartSpacing) * metrics.length - chartSpacing; 


    if (isUpdate) {
        container.select(".stacked-line-wrapper").remove();
    }

    const wrapper = container.append("div")
        .attr("class", "stacked-line-wrapper")
        .style("position", "relative")
        .style("width", `${containerWidth}px`);

    const svg = wrapper.append("svg")
        .attr("width", containerWidth)
        .attr("height", containerHeight);

    const chartGroup = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    const xScale = d3.scaleTime()
        .domain(d3.extent(groupedData, d => d.year))
        .range([0, width]);

    const allYears = groupedData.map(d => d.year);

    const xAxis = d3.axisBottom(xScale)
            .tickValues(allYears)
            .tickFormat(d3.timeFormat("%Y"));
        

    

   

metrics.forEach((metric, i) => {
    const y = d3.scaleLinear()
    .domain([
        0,
        d3.max(groupedData, d => d[metric.key])
    ])
    .nice()
    .range([chartHeight, 0]);


    const line = d3.line()
        .x(d => xScale(d.year))
        .y(d => y(d[metric.key]));

    const g = chartGroup.append("g")
        .attr("transform", `translate(0, ${i * (chartHeight + chartSpacing)})`);


       
        g.append("path")
            .datum(groupedData)
            .attr("fill", "none")
            .attr("stroke", metric.color)
            .attr("stroke-width", 2)
            .attr("d", line);

        
const tooltip = d3.select("body")
.append("div")
.attr("class", "chart-tooltip")
.style("position", "absolute")
.style("background", "rgba(0, 0, 0, 0.7)")
.style("color", "white")
.style("padding", "5px")
.style("border-radius", "3px")
.style("pointer-events", "none")
.style("display", "none");



g.selectAll("circle")
    .data(groupedData)
    .enter()
    .append("circle")
    .attr("cx", d => xScale(d.year))
    .attr("cy", d => y(d[metric.key]))
    .attr("r", 4)
    .attr("fill", metric.color)
    .attr("data-year", d => d.year.getFullYear()) 
    .attr("class", "data-point") 
    .on("mouseover", (event, d) => {
        tooltip
            .style("display", "block")
            .html(`
                <strong>Year:</strong> ${d.year.getFullYear()}<br/>
                <strong>${metric.label}:</strong> ${d[metric.key].toFixed(2)}<br/>
            `);

        
        d3.selectAll(`circle.data-point[data-year='${d.year.getFullYear()}']`)
            
            .attr("stroke", "#000")
            .attr("stroke-width", 1.5);
    })
    .on("mousemove", (event) => {
        tooltip
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", () => {
        tooltip.style("display", "none");

       
        d3.selectAll("circle.data-point")
            .attr("r", 4)
            .attr("stroke", "none");
    });



        
        g.append("g").call(d3.axisLeft(y).ticks(4));

       
        g.append("text")
        .attr("transform", `rotate(-90)`)
        .attr("x", -chartHeight / 2)
        .attr("y", -margin.left + 30)
        .attr("text-anchor", "middle")
            .text(metric.label)
            .attr("fill", "#000")
            .attr("font-size", "12px");

       
        if (i === metrics.length - 1) {
            g.append("g")
                .attr("transform", `translate(0, ${chartHeight})`)
                .call(xAxis)
                .selectAll("text")
                .attr("transform", "rotate(-45)")
                .style("text-anchor", "end");
        }
    });
}
