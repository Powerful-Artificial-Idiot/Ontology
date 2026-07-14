# Ontology Explorer interaction checks

The Ontology Explorer no longer installs browser-global debug or synthetic mouse APIs. Interaction state is owned by the page reducer, while React Flow only renders derived nodes and edges.

## State invariants

- Source nodes and edges are immutable mock data.
- Base visibility depends only on the domain filter and explicit focus state.
- Hover, selection, search, and highlight mode never change the base visible set.
- Ontology nodes are not draggable or connectable.
- Focus entry and exit preserve the current viewport.
- `Fit Visible` and `Reset View` are the only ontology actions that call `fitView`.

## Manual regression sequence

1. Open Ontology Explorer with the All filter. Confirm 26 nodes and 31 edges.
2. Hover several nodes, edge paths, sidebar items, and Domain Dock items. Counts must remain unchanged.
3. Click several nodes and relationships. Counts must remain unchanged and the detail panel must follow the selection.
4. Pan and zoom the canvas. Nodes must remain visible and no console exception should occur.
5. Select each domain filter. Reset View must restore 26 nodes and 31 edges.
6. Double click a node. Focus must show the node, direct neighbors, and direct edges without changing the viewport transform.
7. Click Show All. The full graph must return without changing the viewport transform.
8. Click a Domain Dock lane. The left sidebar must scroll its matching lane group into view.

For a quick read-only count in DevTools:

```js
({
  nodes: document.querySelectorAll(".react-flow__node").length,
  edges: document.querySelectorAll(".react-flow__edge").length,
  viewport: document.querySelector(".react-flow__viewport")?.getAttribute("style"),
})
```
