# Figure spec: flying_bird

**figure_id:** `flying_bird`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/flying_bird.png`

## input_prompt

This figure illustrates the concept of vanishing points arising when a static camera observes an object translating at constant velocity. A bird flies away from camera center O along a straight receding path, depicted as a sequence of silhouettes with equal-length red velocity arrows labeled V (the bird's constant 3D velocity); it is the projected image-plane velocity arrows that grow shorter as the bird recedes. Green projection rays from O through the image plane to each successive bird position show that as the bird recedes, its image on the plane converges toward a single point labeled Vanishing point, and the image-plane velocity arrows shrink and all point toward that same location. The lower portion of the figure shows the corresponding image-plane view, where the bird projected positions collapse toward the vanishing point and the image velocity approaches zero. This figure demonstrates that for pure constant-velocity translation, the image positions and velocities converge toward the vanishing point of the motion direction — the focus of expansion — whose location encodes the direction of translation.

## interactions

- Animate the phenomenon on a loop: the bird flies along its straight path at constant velocity V while its projection, projected path, and image-velocity arrows are recomputed live on the image plane
- The vanishing point / focus of expansion is drawn as a fixed marker: watch the projected bird converge toward it with shrinking image velocity as it recedes
- Drag the bird's velocity direction: the vanishing point relocates to the image of the new direction, demonstrating that the FOE encodes the translation direction
- Slider to scrub the animation: bird position advances along its straight path while projected path, image-plane position, and image-velocity arrows update together, showing how the same 3D motion induces a changing 2D image velocity.
