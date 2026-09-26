# Figure spec: GraphAdjoint

**figure_id:** `GraphAdjoint`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/GraphAdjoint.png`

## input_prompt

This figure illustrates the step-by-step construction of the line graph (also called the edge graph or adjoint graph) of an undirected graph, presented in three labeled sub-panels (a, b, c). Panel a), titled ‘Original graph’, shows a 6-node undirected graph whose nodes are filled orange-colored circles labeled 1 through 6, connected by thin black undirected edges. Panel b) shows the intermediate transformation step, annotated with the instruction ‘Add new node at each original edge’: a new teal circle is placed at the position of each edge of the original graph, with the original 6 nodes still visible. Panel c), titled ‘Edge graph’, shows the resulting line graph, in which each new node is labeled by the pair of original endpoint nodes it represents (e.g., ‘2/3’, ‘1/4’, ‘4/6’, ‘1/6’, ‘4/5’, ‘2/5’, ‘1/3’), and the annotation ‘Connect new nodes if original edges shared node’ explains the rule for drawing new edges between them. All graph nodes across panels use the same teal fill color (#a0d9d3) and thin black outlines, while edges are drawn as plain black lines without arrowheads. This figure introduces the adjoint or line graph transformation, in which each edge of the original graph becomes a node in the new graph, a construct used in edge-centric graph neural network architectures.

## interactions

- Animate the adjoint graph construction step by step: first place a new node at each original edge, then draw edges between new nodes whenever the corresponding original edges shared a node
- Click an edge in the original graph to highlight the corresponding node in the edge graph and show the shared-node connections it generates
- Toggle between the Original graph and Edge graph panels to compare the structure before and after the adjoint transformation
