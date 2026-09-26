# Figure spec: plenoptic_function

**figure_id:** `plenoptic_function`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/2d/plenoptic_function.png`

## input_prompt

This figure shows a slice of the plenoptic function sampled at four spatial locations: two in free space and two inside a pinhole camera. At each location, the plenoptic function encodes the intensity of light rays passing through that point from every direction. The locations inside the pinhole camera show that most directional values are zero, with only specific directions carrying non-zero intensity due to the camera aperture. The figure introduces the plenoptic function as a complete representation of all light in a scene, motivating its use in neural radiance fields (NeRFs).

## interactions

- Click to move the sampling point anywhere in the scene; display the angular light distribution at that point
- Toggle between free-space and inside-camera locations to contrast the dense vs sparse plenoptic function
