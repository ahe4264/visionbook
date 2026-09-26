# Figure spec: ShallowNet

**figure_id:** `ShallowNet`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/ShallowNet.png`

## input_prompt

This figure contains two panels (a and b), each showing a diagram of a shallow neural network with one input node x, three hidden units h_1, h_2, h_3, and one output node y. In panel (b), two bias nodes labeled 1 are present — one feeding the hidden layer and one feeding the output — and the connections from hidden units to the output are labeled with weights φ_1, φ_2, φ_3 plus a bias weight φ_0; a single representative input-to-hidden weight θ_{11} is also labeled to indicate the notation convention. In panel (a), the weight labeling emphasizes the hidden-layer side: the bias connections to each hidden unit carry weights θ_{10}, θ_{20}, θ_{30}, and the connections from input x carry weights θ_{21} and θ_{31}, making the full first-layer parameterization explicit. Arrows in both panels use black and orange coloring to distinguish the input-side (pre-activation) connections from the output-side (post-activation) connections. This figure introduces the standard parameterization of a shallow network, showing how θ weights govern the input-to-hidden linear transformation and φ weights govern the hidden-to-output linear combination.

## interactions

- Click a hidden neuron h_i to highlight its incoming weight from x and bias, plus its outgoing contribution to output y, making the weight labels φ_i and θ_ij visible
- Toggle between panels a and b to compare the clean network diagram with the fully labeled weight view showing all φ and θ parameter names
- Slider for number of hidden units: add or remove neurons from the hidden layer while keeping the single input x and output y fixed
