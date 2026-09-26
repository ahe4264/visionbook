# Figure spec: flatland_camera_linear

**figure_id:** `flatland_camera_linear`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/2d/flatland_camera_linear.png`

## input_prompt

This figure shows a one-dimensional imaging system in flatland, a simplified 2D world used to build intuition for camera modeling. The scene is represented as a line of varying light intensities at a fixed depth, and the sensor axis is reversed relative to the scene, consistent with pinhole geometry. The figure sets up the linear algebra framework for treating cameras as linear systems, where the camera maps a world intensity vector to a sensor measurement vector.

## interactions

- Drag scene albedo values along the 1D scene line and see the sensor measurement vector update in real time
- Toggle to flip the sensor axis and highlight the reversal relative to scene coordinates
