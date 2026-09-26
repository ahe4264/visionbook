# Figure spec: ConvAlex

**figure_id:** `ConvAlex`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/ConvAlex.png`

## input_prompt

This figure illustrates the AlexNet convolutional neural network architecture using a 3D volume diagram viewed in perspective. A left-to-right flow begins with a sheared input photograph representing the 224×224×3 input image, followed by a sequence of three-dimensional feature map volumes rendered as parallelogram-faced blocks in light teal (#d3edeb) for the main face and darker teal (#a0d9d3) for the depth layers, while orange (#d18362) and dark orange (#773c23) parallelogram blocks represent convolutional filter kernels applied at each stage. The feature map volumes progressively shrink in spatial resolution while increasing in depth, with labeled dimensions 55×55×96, 27×27×256, and 13×13×384 corresponding to the first three convolutional stages of AlexNet. Ellipsis (…) markers appear within the teal volume stacks to indicate that only a representative subset of the channels is depicted. A “Conv 5×5” annotation above one inter-stage region identifies the kernel size of one convolution, and black arrows with arrowheads indicate the forward data flow between stages. This figure introduces the AlexNet architecture, showing how successive convolution and pooling operations reduce spatial resolution while extracting increasingly abstract feature representations.

## interactions

- Animate data flow: sequentially highlight each 3D tensor block from input 224×224×3 through 55×55×96 and 27×27×256 to 13×13×384, displaying the spatial dimensions shrinking and channel depth growing at each conv/pool step
- Slider for layer index (1–3): select a convolutional stage, highlight its tensor block, and show an overlay with the Conv 5×5 kernel size and the resulting feature map dimensions
- Toggle receptive-field overlay: a selected activation in each later tensor highlights the input patch and previous-layer region that produced it, showing how spatial extent grows as resolution shrinks.
