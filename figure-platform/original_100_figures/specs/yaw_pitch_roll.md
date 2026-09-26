# Figure spec: yaw_pitch_roll

**figure_id:** `yaw_pitch_roll`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/yaw_pitch_roll.png`

## input_prompt

This figure illustrates the decomposition of 3D camera rotation into three Euler angles about the principal coordinate axes. A right-handed coordinate system is anchored at the origin, with Y pointing up, X pointing laterally, and Z pointing forward along the optical axis. Red curved arrows indicate the three rotation types: yaw (theta_Y) as rotation about Y, pitch (theta_X) as rotation about X, and roll (theta_Z) as rotation about Z. A tilted image plane with local axes x and y contains an image point p, and a dashed line connects it to a 3D world point P, illustrating the overall projection geometry that the rotation parameters affect. The figure sets up the Euler-angle parameterization used to construct the full 3D rotation matrix R, which relates the world and camera coordinate frames.

## interactions

- Individual sliders for yaw, pitch, and roll: rotate the camera/image plane about Y, X, and Z axes and show the compounded orientation after each Euler-angle step
- Toggle rotation order, such as yaw-pitch-roll versus roll-pitch-yaw, to demonstrate non-commutativity by ending at different final camera orientations from the same angle values
- Animate one rotation at a time with the active axis highlighted, updating the image point p and dashed projection ray so the effect of each angle on the viewing geometry is visible
