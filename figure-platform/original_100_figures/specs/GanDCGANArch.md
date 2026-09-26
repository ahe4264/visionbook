# Figure spec: GanDCGANArch

**figure_id:** `GanDCGANArch`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/GanDCGANArch.png`

## input_prompt

This figure shows the complete DCGAN (Deep Convolutional Generative Adversarial Network) architecture as two mirrored pipelines labeled Generator (left) and Discriminator (right), each spanning one half of the figure and delineated by underbrace annotations. The Generator begins with a 100×1 latent variable z, passes it through a “Project and reshape” step to produce a 4×4×1024 feature volume, and then applies a series of fractional (transposed) convolutions with arctan activations that progressively upsample through 8×8×512, 16×16×256, 32×32×128, and finally a 64×64×3 output image. The Discriminator receives either a real image x or a generated image x*, starting at 64×64×3, and uses strided convolutions to downsample through 32×32×128, 16×16×256, 8×8×512, 4×4×1024, before a 4×4 convolution collapses the spatial dimensions to a 1×1 scalar that is passed through a sigmoid activation to produce the probability Pr(real). All feature volumes are rendered as three-dimensional orange-shaded parallelogram blocks, with black arrows indicating data flow. This figure introduces the DCGAN architecture, which replaces fully connected hidden layers with purely convolutional operations to produce and evaluate photorealistic images.

## interactions

- Animate the generator forward pass: trace the latent variable z (100×1 noise vector) through Project and reshape, then through fractional convolution stages watching the tensor grow from 4×4×1024 to 8×8×512 to 16×16×256 to 32×32×128 to the final 64×64×3 output image
- Animate the discriminator forward pass: trace a real or generated image x through strided convolution stages from 64×64×3 down to 4×4×1024, then to the 1×1 output and through sigmoid to Pr(real)
