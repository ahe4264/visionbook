# Figure spec: orthogonal_projection

**figure_id:** `orthogonal_projection`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/orthogonal_projection.png`

## input_prompt

This figure illustrates orthographic projection of a 3D box onto a 2D projection plane within a labeled world coordinate frame with X, Y, and Z axes. The two-step staircasesolid, whose faces are color-coded red, green, and cyan, is positioned along the Z-axis, and dashed lines parallel to Z connect each corner of the box to the projection plane, showing that projection rays travel perpendicular to the plane with no angular convergence. The resulting projected shape on the plane preserves the lateral dimensions and color-face layout of the box exactly, with no foreshortening based on depth. The figure introduces orthographic projection as a distance-independent mapping that retains parallelism and metric lengths in the plane perpendicular to the projection axis, contrasting it with the depth-scaling behavior of perspective projection.

## interactions

- Slider for object depth: move the box toward or away from the projection plane while the orthographic footprint keeps its scale, showing that parallel projection removes depth-dependent size changes.
- Slider blending orthographic to perspective projection: compare constant-size depth-independent projection against perspective foreshortening as objects move along Z
- Toggle depth guides: display equal-length lateral measurements at different depths to show why x = X and y = Y under orthographic projection but not under perspective projection
