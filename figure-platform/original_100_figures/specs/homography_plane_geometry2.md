# Figure spec: homography_plane_geometry2

**figure_id:** `homography_plane_geometry2`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/homography_plane_geometry2.png`

## input_prompt

This figure illustrates the geometry of projecting a planar 3D surface onto a camera image plane. A world coordinate frame is placed with its origin on the planar surface and the Z-axis perpendicular to the plane, so every surface point has the degenerate form (X, Y, 0); a single world point at (X, Y, 0) is projected by rays from the camera center through the image plane to the image point (x, y). Because all scene points lie on the Z=0 plane, the depth dimension vanishes and the full 3x4 camera projection collapses to a 3x3 matrix — the homography H — that directly maps (X, Y) to (x, y). This figure motivates the derivation of the homography by showing that planarity of the scene eliminates the depth degree of freedom, establishing a direct and invertible 2D-to-2D linear mapping between the world plane and the image.

## interactions

- Drag the camera center around the planar scene and watch the image-plane projection of the world point update while the homography matrix H changes in real time
- Tilt or rotate the world plane away from the camera and show how the projected grid becomes increasingly foreshortened while the Z=0 plane constraint is preserved
- Toggle between full 3D projection and collapsed 2D-to-2D homography view: first show rays from the camera to the plane, then flatten the same mapping into paired source and image-plane coordinates
