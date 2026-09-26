# Figure spec: Conv1DChannels

**figure_id:** `Conv1DChannels`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/Conv1DChannels.png`

## input_prompt

This figure depicts a three-dimensional schematic of a 1D convolutional layer with multiple channels, rendered in a 3D perspective with labeled axes for Channels, Width, and Height. The input layer H and output layer H' are shown as two 3D volumetric grids of white circles with black outlines and thin strokes, each circle representing a feature value at a specific (channel, position) coordinate; the two grids are positioned side by side with spatial offset to convey depth. Between the input and output grids, the weight tensor Omega is represented as a smaller 3D grid of circles, and two operator symbols in terracotta color (#b46d59) — a circled-cross (otimes, indicating convolution) and a circled-plus (oplus, indicating bias addition) — are placed between the input, weights, and output to denote the two arithmetic steps. Dark slate (#424b4f) arrows connect the input volume to the weight tensor and from there to the output volume, showing the flow of computation; additional terracotta triangle-tipped arrows indicate the direction of individual connections between feature channels. This figure demonstrates how a 1D convolution with multiple input and output channels operates as a weighted linear combination across channel and spatial dimensions, extending the single-channel 1D convolution to multi-channel feature maps.

## interactions

- Slider for channel index: step through output channels in H', highlighting the corresponding filter slice in the weights Ω and showing how each input channel of H contributes to that output
- Click an output channel in H': the contributing input-channel slices and matching weight slices in ? highlight together, showing how each output channel aggregates across the input channels.
- Slider for kernel width: vary the convolution kernel size along the Width axis and show how the receptive field span changes in the input H and how the output H' dimensions update accordingly
