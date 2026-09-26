# Figure spec: SupervisedSurface

**figure_id:** `SupervisedSurface`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/SupervisedSurface.png`

## input_prompt

This figure contains two panels, labeled a) and b), each showing a three-dimensional surface plot of the supervised learning loss L[phi] as a function of two model parameters: the slope phi_1 (ranging from approximately -1.0 to 1.0) and the intercept phi_0 (ranging from approximately 0.0 to 2.0), with the vertical loss axis extending from 0 to 70. Panel a) renders the bowl-shaped quadratic loss landscape as a shaded 3D mesh surface, while panel b) shows the corresponding top-down 2D heatmap with contour lines over the same (phi_0, phi_1) plane; three circular markers (one pale gray-white, one light cyan, one teal) mark the same example parameter settings in both panels, and the minimum of the bowl — corresponding to the optimal parameter values — is visible in both views. The surface exhibits the characteristic smooth, convex shape of a least-squares regression loss, with the loss rising steeply as parameters deviate from the optimum in either direction. The figure introduces the loss landscape of a supervised linear model, illustrating that gradient-based optimization reliably converges to the global minimum because the surface has no local minima or saddle points.

## interactions

- Sliders for ?0 and ?1: the parameter marker moves on the loss surface and heatmap together while L[?] updates numerically, showing how slope and intercept choices determine training loss.
- Drag the current parameter point on the surface: place (φ0, φ1) at any location on the bowl and trace an animated gradient-descent path of iterative steps descending toward the minimum, displaying the current loss value
- Slider for learning rate: change the step size and animate successive gradient-descent updates on the surface, showing overshooting and oscillation for large rates versus slow convergence for small rates
