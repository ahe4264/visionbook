# Figure spec: DiffusionUNet

**figure_id:** `DiffusionUNet`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/DiffusionUNet.png`

## input_prompt

This figure illustrates the U-Net architecture used as the noise-prediction backbone in a diffusion model. The diagram is organized as an encoder-decoder structure: the left side progressively downsamples a noisy 256×256×3 input image through orange/brown feature-map volumes with labeled resolutions 256×256×128, 128×128×128, 64×64×256, 32×32×256, 16×16×512, and 8×8×512; the right side mirrors this process by progressively upsampling through matching orange/brown feature-map volumes back toward the output image. Long horizontal arrows labeled “Concatenate” connect encoder features to decoder features at matching spatial scales, showing the U-Net skip connections. A circled timestep variable t at the lower left feeds into a time-embedding path along the bottom, with arrows injecting the time embedding into multiple residual blocks throughout the network. The legend indicates two processing types: a plain residual block and a residual block with self-attention. This figure shows how a diffusion U-Net combines multiscale encoder-decoder features, skip connections, residual processing, self-attention at selected scales, and timestep conditioning to predict denoising updates.

## interactions

- Animate the encoder-decoder pass: step from the noisy 256×256×3 input down through each smaller resolution to the 8×8×512 bottleneck, then back up through the decoder, pulsing each Concatenate skip connection when its encoder feature is reused
- Slider for timestep t: vary the diffusion timestep and trace the time-embedding path from the circled t node into the residual blocks across the encoder and decoder
- Toggle block type highlighting: distinguish plain residual blocks from residual blocks with self-attention using the legend’s arrow styles, and show where self-attention is applied in the U-Net
