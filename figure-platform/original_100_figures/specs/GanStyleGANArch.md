# Figure spec: GanStyleGANArch

**figure_id:** `GanStyleGANArch`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/GanStyleGANArch.png`

## input_prompt

This figure illustrates the StyleGAN architecture, organized into three labeled vertical columns: the main generative pipeline (center), the noise injection branch (left of center), and the style branch (right). In the style branch, a latent variable z (1×1×512) is passed through a fully connected network to produce an intermediate variable w (1×1×512), which then feeds three separate linear transforms (each outputting 2×1×512) to generate style vectors y₁, y₂, y₃ that apply per-channel scale and offset adjustments at successive resolution levels of the generator. The main generative pipeline begins with a learned constant input (4×4×512) and passes through convolutional blocks that double in spatial resolution from 4×4×512 to 8×8×512, with each block receiving the corresponding style injection. The noise branch contributes three additive perturbations (z₁⊗ψ₁, z₂⊗ψ₂, z₃⊗ψ₃) from thin 4×4×1 or 8×8×1 noise volumes, each scaled and broadcast across all channels to introduce stochastic spatial variation at different resolutions. Underbrace labels at the bottom group the three columns under the headings Main generative pipeline, Noise, and Style. This figure demonstrates how StyleGAN separates high-level content from fine-grained stochastic detail by injecting global style information through adaptive normalization and local noise directly into the feature maps at each scale.

## interactions

- Animate the main generative pipeline: trace latent z through the fully connected mapping network to intermediate variable w, then through three linear transforms producing styles y1, y2, y3, and show each style's per-channel scale and offset being applied at the 4×4, 8×8 synthesis blocks
- Slider for noise scale ψ: adjust the noise injection weight and show how the noise terms z1⊗ψ1, z2⊗ψ2, z3⊗ψ3 change magnitude at each resolution level, with the affected channels in the synthesis blocks highlighted
