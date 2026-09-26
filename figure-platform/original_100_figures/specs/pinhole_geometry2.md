# Figure spec: pinhole_geometry2

**figure_id:** `pinhole_geometry2`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/pinhole_geometry2.png`

## input_prompt

This figure contains two panels, (a) and (b), that together establish the coordinate geometry of the pinhole camera model. Panel (a) shows the 3D world-coordinate setup with axes X, Y, and Z: a scene point P projects through the pinhole at the origin, with red arrows marking the focal length f on both sides — the physical projection plane at distance f behind the pinhole carries an inverted image, while the virtual camera plane at distance f in front carries an upright image, demonstrating why the virtual plane convention avoids image inversion. Panel (b) zooms into the virtual camera plane and shows the two 2D coordinate systems that coexist on it: the camera coordinate frame centered at the principal point with axes x and y, and the image coordinate frame with integer pixel axes n and m whose origin sits at the image corner. The figure motivates the need to account for the principal point offset when converting between continuous camera coordinates and discrete pixel indices in the projection equations.

## interactions

- Drag the 3D point P in panel (a) and show its matching coordinate location in panel (b), linking the 3D ray projection to the 2D camera-coordinate and image-coordinate conversion
- Slider for focal length f: move both real and virtual camera planes in panel (a) while panel (b) updates the projected coordinate scale and principal-point offset
- Toggle real-versus-virtual projection: compare the inverted physical sensor point in panel (a) with the upright virtual-plane convention, then trace how that same point is expressed as pixel coordinates in panel (b)
