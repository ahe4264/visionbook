# Figure spec: VAENonLinearLVM

**figure_id:** `VAENonLinearLVM`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/VAENonLinearLVM.png`

## input_prompt

This figure illustrates the nonlinear latent variable model underlying a variational autoencoder (VAE), using two panels connected by a conceptual annotation. The left panel displays the joint distribution Pr(x, z|phi) in a three-dimensional coordinate system with axes x_1, x_2, and z, where a family of curved colored lines — rendered in multiple colors including red, green, blue, black, olive, magenta, cyan, navy, and maroon — represent the distribution of observed data x = (x_1, x_2) conditioned on each particular value of the scalar latent variable z; each color corresponds to a different z slice, and the nonlinear decoder network phi warps the latent axis into a curved manifold in data space. The right panel displays the marginal distribution Pr(x|phi) in the two-dimensional x_1-x_2 plane, obtained by integrating (marginalizing) over all values of the latent variable z; the same multi-colored curves now appear projected onto 2D, forming a complex non-Gaussian distribution that cannot be expressed in closed form. A label reading 'Marginalize over latent variable, z' with a teal arrow connects the two panels, indicating the mathematical operation that links them. The figure introduces the nonlinear latent variable generative model and motivates the need for variational inference, since the marginalization that links the joint distribution to the observable marginal is intractable.

## interactions

- Animate marginalization over z: show the joint distribution surface Pr(x, z|φ) in the x1–x2–z space collapsing along the z axis with a sweeping animation to produce the marginal Pr(x|φ) projected onto the x1–x2 plane
- Drag an input point (x1, x2): highlight the posterior distribution Pr(z|x, φ) for that observation on the z axis and show how the uncertainty in the latent variable z varies across different regions of the x1–x2 plane
- Slider for latent variable z value: move z along its axis and update the displayed slice of the joint distribution Pr(x, z|φ), revealing how the conditional Pr(x|z, φ) shifts position and shape across the x1–x2 plane
