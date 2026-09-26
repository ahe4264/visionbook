# Figure spec: reprojection_error

**figure_id:** `reprojection_error`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/reprojection_error.png`

## input_prompt

This figure illustrates the concept of reprojection error in the context of camera parameter estimation. Three 3D points form a triangle in the scene and project through the camera onto the image plane as observed image points p1, p2, and p3. Adjacent to each observed point is a corresponding reprojected point computed by projecting the same 3D points using estimated (rather than true) camera parameters; short red line segments connect each observed point to its reprojected counterpart, visualizing the per-point error. The figure motivates reprojection error as the measurable 2D residual between observed image locations and those predicted by the estimated camera model, which serves as the objective function for camera calibration.

## interactions

- Drag an observed image point or its reprojected estimate and watch the red reprojection error vector update in length, direction, and numeric residual value
- Sliders for camera pose and intrinsic parameters K, R, and T: perturb the estimated camera model and show all reprojected points shifting relative to their observed counterparts
- Toggle aggregate error mode: display individual residuals for each point or the total sum-of-squared reprojection error used as the nonlinear optimization objective
