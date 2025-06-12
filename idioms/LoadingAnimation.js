export function showLoader() {

  const loader = d3.select("#inlineLoader");
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


export function showPopup(message) {
    const popup = document.createElement("div");
    popup.className = "popup-error";
    popup.innerText = message;

    Object.assign(popup.style, {
        position: "fixed",
        top: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#f44336",
        color: "#fff",
        padding: "12px 20px",
        borderRadius: "6px",
        zIndex: 9999,
        fontSize: "14px",
        boxShadow: "0px 4px 12px rgba(0,0,0,0.3)"
    });

    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 3500);
}

