# Figure spec: basic_motion_point

**figure_id:** `basic_motion_point`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/basic_motion_point.png`

## input_prompt

This figure illustrates how the 3D motion of a point projects into 2D motion on the image plane under a pinhole camera model. A 3D point P moves through space with instantaneous velocity Ṗ, and the green line from the camera center O through P shows the projection ray, which pierces the image plane at the corresponding 2D image point p. The red arrow at P labeled Ṗ marks the point's 3D velocity, while the red arrow at p labeled ṗ marks the resulting instantaneous velocity of its 2D projection; the dashed line traces where the displaced 3D point projects, making clear that the 2D velocity is the projection of the 3D velocity rather than a simple rescaling of it. This figure motivates the perspective-projection relations x = fX/Z and y = fY/Z, and their time derivatives, as the mathematical link between a point's 3D velocity Ṗ = (Ẋ, Ẏ, Ż) in world coordinates and its observed 2D optical flow ṗ = (ẋ, ẏ) in the camera plane.

## interactions

- Drag the 3D point P along its trajectory and watch the 2D projection p move on the image plane
- Sliders for velocity components (X-dot, Y-dot, Z-dot) to show how each affects the 2D optical flow vector
