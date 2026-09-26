# Figure spec: SupervisedOpt

**figure_id:** `SupervisedOpt`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/SupervisedOpt.png`

## input_prompt

This figure contains two panels (a and b) illustrating the supervised learning optimization landscape for a linear model with parameters phi_0 (intercept) and phi_1 (slope). Panel a) shows a colored contour heatmap of the loss function L[phi] over the two-dimensional parameter space, with the x-axis labeled Intercept, phi_0 (ranging from 0 to 2) and the y-axis labeled Slope, phi_1 (ranging from 0 to 4); the colormap transitions from near-white (low loss) through progressively deeper teals — #b4e1dd, #8bd0c9, #4db7aa, #2f7870 — indicating increasing loss, with a visible minimum region shown as the lightest area. Panel b) shows either a complementary view of the data or a second parameterization of the loss, also labeled with Input, x and Output, y axes (each spanning 0 to 2 with tick marks at 0, 1, 2), with a similar teal gradient colormap. The figure demonstrates how the total supervised training loss varies as a function of the model parameters, establishing the geometric landscape that gradient-based optimization must navigate.

## interactions

- Drag the current parameter location on the 2D loss surface L[φ] to simultaneously update the fitted line in the data scatter panel, showing intercept φ_0 and slope φ_1 changing together
- Slider for intercept φ_0 (–1 to 2): shift the fitted line up or down in the data panel while the marker moves vertically on the loss surface
- Slider for slope φ_1 (0 to 4): rotate the fitted line in the data panel while the marker moves horizontally on the loss surface
