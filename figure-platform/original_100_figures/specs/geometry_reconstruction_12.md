# Figure spec: geometry_reconstruction_12

**figure_id:** `geometry_reconstruction_12`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/geometry_reconstruction_12.png`

## input_prompt

This figure illustrates the two-frame geometry of 3D point reconstruction from a moving camera. Two image planes are shown — a reference frame and a target frame — with a 3D point P visible from both; the image point p on the target frame is lifted back to 3D via P = zK⁻¹p using the intrinsic calibration matrix K and depth z. The two camera frames are related by an extrinsic rigid-body transformation parameterized by rotation R and translation T (the loop P' = MP at the 3D point), and the transformed point is projected onto the reference frame as p' = KP. This figure sets up the two-view reconstruction pipeline in which known or estimated camera motion and intrinsic calibration K together determine the 3D location of a scene point from its projected image correspondences across frames.

## interactions

- Live two-view model: the back-projected ray P = zK⁻¹p, the rigid transform P' = MP, and the reprojection p' = KP are recomputed continuously from the current geometry
- Slider for depth z along the ray through p: the 3D point slides along the ray and both image projections update together, showing the depth ambiguity a single view leaves
- Sliders for the relative pose (R, T) of the second camera: watch p' move in the reference frame while p stays fixed, visualizing how motion parameters determine where the correspondence lands
