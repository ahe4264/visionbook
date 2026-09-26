# Figure spec: sampling_reconstruction2

**figure_id:** `sampling_reconstruction2`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/2d/sampling_reconstruction2.png`

## input_prompt

This figure illustrates the reconstruction of a continuous signal from its discrete samples via convolution, presented as a three-part equation. The left panel shows the discrete sample sequence as blue impulse arrows at regular intervals labeled -T_s, 0, T_s, and 2T_s along the time axis t. The middle panel shows the reconstruction kernel — a sinc-like function with peak value 1 that decays with oscillations — which acts as an interpolation filter. The right panel, separated by an equals sign, shows the convolution result: each blue sample arrow generates a scaled copy of the green kernel (shown as dashed green curves), and all shifted, scaled copies sum together to produce the reconstructed continuous signal (solid red curve) that passes through every sample point. This figure demonstrates that ideal signal reconstruction is a linear superposition process, connecting discrete samples back to the continuous domain through sinc interpolation.

## interactions

- Slider for sampling interval T_s: decrease it to show well-separated green sinc copies and a clean red reconstructed envelope; increase it past the Nyquist limit to show overlapping sinc copies and aliasing distortion in the red envelope
- Toggle individual sinc copies (dashed green curves in the right panel) on and off to reveal how each sample contributes its own scaled sinc and how they sum to form the red reconstructed signal
- Animate the convolution sweep: step the sinc filter across each sample position one by one, incrementally building up the cumulative red envelope from left to right
