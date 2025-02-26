function init() {
    d3.json("./data/card_details.json").then(function (data) {
        const originalData = JSON.parse(JSON.stringify(data));  // Store original unsorted data
        
        createIcicleChart(data, ".IcicleChart");  // Initial render
        createAlluvialChart(data, ".AlluvialChart");
    });
  }