# MTG-Vis — Current Limitations and Collected Feedback



[← Back to main page](../)

---

This document summarizes all **current limitations** of the MTG‑Vis project and all **feedback gathered** through heuristic, and utility evaluations. It is intended as a reference for future developement of this project.

## ## Current Limitations

### 1. Static Dataset (No Real-Time Updates)

* Dashboard uses a processed static snapshot of the Scryfall dataset.
* Users cannot upload personal collections.
* No real-time card updates or price updates.

### 2. Performance Constraints

* Scatterplot becomes slow at large scales; requires aggregation both for unique card designs and at low zoom levels.
* Icicle Chart suffers from lag during panning/zooming.
* Some interactions feel unresponsive under heavy filtering.

### 3. Confusion With Global and Local Filters 
* Hard distinction between **global filters** and **local filters**.
* Users struggled to understand how highlighted subsets propagate.
* Hard to notice when new cards are added.

### 4. Timeline View Issues

* Requires too much vertical scrolling.
* Cross‑browser issues (e.g., missing scrollbar in Firefox).

### 5. Interactions

* Panning controls are not very easy to grasp


---

## ## Feedback Collected

### **Filtering Feedback**

* Add full‑text filtering (e.g., being able to filter by oracle text).
* Allow filtering by EDH rank.
* Allow filtering by complexity value.
* Allow brushing in axes of the visualizations.
* Sort filters by frequency / relevance, not alphabetical.
* Allow filtering/sorting of **drawer contents**.
* Add support for searching sets by set code (e.g., "M21").
* Enable inferred color identity filters (e.g., show all identities formable from card’s colors).


### **Interaction Feedback**

* Provide clearer indication of active local filters.
* Add visual cue when a card is added to the drawer.
* Improve highlight visibility on scatterplot.
* Add scroll bars for smoother zoom/pan operations.

### **Layout and Visualization Feedback**

* Reduce vertical space of Icicle Chart and Line Chart.
* Increase visibility of Timeline View.
* Order set types in the timeline by relevance or frequency.
* Improve Icicle tooltips (show actual color identity breakdown, same behaviour as in the Scatterplot).

---

If you have questions or want clarification on any part of the project, refer to the main documentation or contact the previous authors.
