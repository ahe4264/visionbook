# Figure spec: epipolar_geometry

**figure_id:** `epipolar_geometry`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/epipolar_geometry.png`

## input_prompt

This figure illustrates the core geometric relationships in a stereo camera pair. Two cameras with centers O1 and O2 face inward, each with its own image plane; a 3D point P projects to image points p1 and p2 on the respective planes, and the three points O1, P, O2 together define the epipolar plane. The baseline connecting O1 and O2 intersects each image plane at the epipoles e1 and e2, and the intersections of the epipolar plane with each image plane produce the labeled epipolar lines, which pass through the epipoles and through the respective image projections p1 and p2. This constraint means that if p1 is known, the corresponding point p2 must lie somewhere on the epipolar line in the second image, reducing stereo correspondence from a 2D search to a 1D one. The figure establishes the epipolar geometry as the fundamental constraint that links projections across two views, motivating the essential and fundamental matrices.

## interactions

- Build the two-camera rig as one live model: the epipolar plane, epipoles e1/e2, and both epipolar lines are recomputed from O1, O2, and P every frame
- Drag the 3D point P: watch p1, p2, the epipolar plane, and both epipolar lines track it continuously
- Drag or rotate camera 2 (sliders for baseline and rotation): the epipoles slide along the image planes and the epipolar lines re-orient, showing the constraint depends only on relative pose
