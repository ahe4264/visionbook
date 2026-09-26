# Figure spec: homogeneousAndHeteregeneous_VS3

**figure_id:** `homogeneousAndHeteregeneous_VS3`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/homogeneousAndHeteregeneous_VS3.png`

## input_prompt

This figure illustrates the geometric relationship between heterogeneous (standard 2D) and homogeneous (projective) coordinate representations of the same 2D point. On the left, a point (x, y) exists in the standard Euclidean plane with axes x and y; on the right, the homogeneous coordinate space introduces a third axis w, and the canonical embedding of (x, y) is the point (x, y, 1) on the w=1 plane. A dashed ray extends from the origin through (x, y, 1) out to the general scalar multiple (lambda*x, lambda*y, lambda), showing that the entire ray through the origin corresponds to a single heterogeneous point, making scale irrelevant. This figure introduces the equivalence-class interpretation of homogeneous coordinates, which is the geometric foundation that allows projective transformations such as homographies to be expressed as linear matrix multiplications.

## interactions

- Drag the 2D point (x, y) in the left plane and watch the corresponding 3D homogeneous ray in the right panel rotate through the origin while the canonical point (x, y, 1) stays pinned to the w=1 plane
- Slider for w: move the selected homogeneous representative along the right-panel ray and display the recovered heterogeneous coordinates (x/w, y/w) back on the left-panel point
- Toggle linked-view mode: highlight the left 2D point, the right canonical point (x, y, 1), and several scaled equivalents such as (2x, 2y, 2) as one shared equivalence class
