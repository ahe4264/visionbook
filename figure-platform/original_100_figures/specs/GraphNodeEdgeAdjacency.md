# Figure spec: GraphNodeEdgeAdjacency

**figure_id:** `GraphNodeEdgeAdjacency`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/GraphNodeEdgeAdjacency.png`

## input_prompt

This figure contains four sub-panels (a through d) showing the different matrix representations used to encode a graph for graph neural networks. Panel a) depicts a 6-node undirected graph with nodes labeled 1 through 6, connected by edges whose identities are marked by the pair of endpoint node labels (e.g., ‘1\3’, ‘1\4’, ‘2\3’, ‘3\4’, ‘3\6’, ‘4\5’, ‘5\6’). Panel b) shows the adjacency matrix A (N × N), a square binary matrix encoding which pairs of nodes are connected by edges. Panel c) shows the node feature matrix X (D × N), in which each column stores the D-dimensional feature vector associated with one of the N nodes. Panel d) shows the edge feature matrix E (Dᴷ × E), in which each column stores the Dᴷ-dimensional feature vector associated with one of the E edges, with edges ordered to match the labeled pairs in panel a). Labels for each matrix include its name, symbol, and dimensions. This figure introduces the three standard data structures—adjacency matrix, node feature matrix, and edge feature matrix—that together fully represent a graph with node and edge attributes in a deep learning context.

## interactions

- Click a node (1–6) in the graph diagram to highlight its row and column in the adjacency matrix A and its column in the node data matrix X
- Click an edge between two nodes to highlight the corresponding entry in the edge data matrix E and the two nodes it connects
- Toggle between panels a–d to compare the visual graph, the N×N adjacency matrix, the D×N node data, and the D_E×E edge data representations
