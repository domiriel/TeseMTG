export function showLoader() {
  const loader = d3.select("#inlineLoader");
  loader.style("visibility", "visible").style("opacity", 1);

  if (loader.select(".loader-text").empty()) {
    loader.append("span")
      .attr("class", "loader-text")
      .text("Loading...");
  }
}

export function hideLoader(delay = 50) {
  const loader = d3.select("#inlineLoader");
  const hide = () => loader.style("visibility", "hidden").style("opacity", 0);

  if (delay > 0) {
    setTimeout(hide, delay);
  } else {
    hide();
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

