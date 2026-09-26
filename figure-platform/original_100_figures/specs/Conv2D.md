# Figure spec: Conv2D

**figure_id:** `Conv2D`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/Conv2D.png`

## input_prompt

This figure contains four panels (a, b, c, and d) illustrating 2D convolution by showing the kernel stepping across a 2D input grid to compute successive output values. Each panel presents three 3D-perspective grids side by side — two grids of small circles (the input X and hidden layer H_1) and one grid of square cells (the weights Omega): on the left, the input array X with cells labeled x_ij; in the center, the weight (kernel) array Omega with cells labeled omega_ij; and on the right, the hidden layer H_1 with cells labeled h_ij. Within the input grid, the active input patch involved in the current computation is shaded with solid labels while the remaining cells stay white with faint gray labels, distinguishing the active receptive field from the rest of the array; the weight array Omega is drawn as a grid of square cells (not circles), and the currently computed output cell in H_1 is highlighted the same way. In panels (c) and (d), explicit 0 entries appear outside the input border, showing the zero padding used when the kernel overlaps the array edge. A terracotta circled-cross (otimes) between the input and weight grids denotes the element-wise multiplication, and a terracotta circled-plus (oplus) between the weight and output grids denotes the summation that accumulates the dot product. Across the four panels, the shaded highlighted region shifts to different positions within the input, and correspondingly a different output cell h_ij is computed, showing the sliding-window nature of the convolution. This figure demonstrates how a 2D convolutional layer systematically applies a fixed kernel at each spatial position of a 2D feature map to produce one scalar output per position.

## interactions

- Drag the kernel window across the input grid: animate the 3×3 filter sliding from one position to the next over the x_ij input cells, highlighting the active receptive field and updating the corresponding h_ij output cell in real time
- Click on an output cell h_ij: highlight the matching 3×3 patch of x_ij inputs and display the element-wise products x_ij × ω_ij summed to produce that output value
- Slider for stride: change the step size between kernel positions and show how the number of output cells h_ij changes and which input elements are skipped
