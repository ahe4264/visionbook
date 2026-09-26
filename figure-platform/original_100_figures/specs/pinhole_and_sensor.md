# Figure spec: pinhole_and_sensor

**figure_id:** `pinhole_and_sensor`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/pinhole_and_sensor.png`

## input_prompt

This figure illustrates the complete image formation chain from a 3D scene point P to a discrete pixel location on a physical sensor. The camera coordinate frame is defined by axes Xc, Yc, and the optical axis Zc, with the camera center (pinhole) at the origin; a virtual image plane with local x and y axes sits at focal length f in front, while the physical sensor sits at distance f behind the camera center. The sensor is rendered as a discrete M-by-N pixel grid, and both a continuous projected point and its snapped pixel-grid location are visible, emphasizing the discretization from continuous coordinates to integer pixel indices. The figure establishes all geometric quantities — focal length f, pixel size, and the principal point offset (ox, oy) — required to assemble the full camera intrinsic matrix K.

## interactions

- Drag the 3D point P in camera coordinates and watch both the continuous projection on the virtual image plane and the snapped pixel location on the sensor grid update together
- Sliders for focal length, sensor width, and pixel resolution: update field of view, pixel size, and the intrinsic matrix entries so the tradeoff between geometry and sampling is visible
- Toggle coordinate readout modes: switch between camera-plane coordinates (x, y), sensor-centered coordinates, and image pixel indices (n, m), highlighting the principal point offset
