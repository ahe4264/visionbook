# Figure spec: ResidualResnet2

**figure_id:** `ResidualResnet2`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/ResidualResnet2.png`

## input_prompt

This figure illustrates the architecture of a deep residual network (ResNet) at two levels of detail. The main diagram traces the flow of feature tensors through successive stages of the network, with labeled spatial and channel dimensions at each stage: a 7x7 convolution produces 112x112x64 feature maps, which are then processed through four residual stages yielding progressively smaller but deeper tensors — 56x56x256, 28x28x512, 14x14x1024, and 7x7x2048 — before a final average pooling and fully connected (AvgPool + FC) layer. Between stages, Subsample blocks reduce spatial resolution while increasing channel depth; within each stage, repeated ResBlocks (indicated by ellipses and annotations such as '24 blocks total' and '36 blocks total') apply the same transformation many times. An inset zooms into the internal structure of a single ResBlock, showing the sequence: Conv 1x1 (bottleneck squeeze), Batch Normalization (BN), ReLU, Conv 3x3 (spatial convolution), BN, ReLU, and Conv 1x1 (channel expansion), with a skip connection bypassing these layers and adding the input directly to the output. The figure introduces the residual (skip-connection) design that allows very deep networks to be trained effectively by ensuring gradients can flow directly from later to earlier layers.

## interactions

- Animate the residual block forward pass: trace the signal through the main path and simultaneously along the parallel 1×1 skip connection, then show the element-wise addition (⊕) combining both paths at the block output
- Slider for ResNet depth (24 blocks / 36 blocks): update the number of residual blocks shown per stage and the total block-count label, while the tensor dimensions at each stage (112×112×64 through 7×7×2048) remain constant
- Click on a stage's tensor block: zoom in to display the bottleneck detail with Conv 1×1 channel compression, Conv 3×3 spatial processing, and Conv 1×1 expansion, with the specific channel counts (e.g., 64 bottleneck, 256 output) labeled for that stage
