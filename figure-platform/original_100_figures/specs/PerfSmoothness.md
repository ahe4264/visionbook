# Figure spec: PerfSmoothness

**figure_id:** `PerfSmoothness`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/PerfSmoothness.png`

## input_prompt

This figure contains six panels (a through f) arranged in a 3×2 grid, each showing the scalar output y of a trained shallow one-hidden-layer neural network as a function of a scalar input x ∈ [0, 1]. The panels correspond to networks with increasing numbers of hidden units — 6, 7, 8, 10, and 50, plus one additional configuration — with each panel’s title indicating the hidden unit count. Each panel has a horizontal axis labeled “Input, x” and a vertical axis labeled “Output, y”; the y-axis range spans approximately [0, 1] or [−1, 1] depending on the panel. With more hidden units the output function is relatively simple and smooth, while as the hidden unit count decreases the function develops more oscillations and finer local structure. This figure illustrates how the capacity of a shallow neural network — and hence the complexity and expressiveness of the functions it can represent — scales with the number of hidden units.

## interactions

- Slider for number of hidden units (6 → 7 → 8 → 10 → 50): animate the fitted regression curve transitioning between panels, showing how the function becomes smoother and more detailed as capacity increases
- Click a panel (a–f) to zoom in on that specific hidden unit count and compare the fit against the data points
- Toggle between an underfitting panel (6 hidden units) and an overfit panel (50 hidden units) to contrast rough versus overly smooth approximations
