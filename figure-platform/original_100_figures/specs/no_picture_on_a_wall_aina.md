# Figure spec: no_picture_on_a_wall_aina

**figure_id:** `no_picture_on_a_wall_aina`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/no_picture_on_a_wall_aina.png`

## input_prompt

This figure contains two panels, (a) and (b), contrasting image formation without and with a pinhole aperture. In panel (a), multiple rays from different parts of a tree converge onto just two points on a bare wall, showing that without any aperture restriction every wall point receives light from many different scene directions simultaneously, preventing any coherent image from forming. In panel (b), a black opaque barrier with a single pinhole is placed between the scene and the wall; now each wall point receives light from exactly one scene direction through the pinhole, and an inverted, spatially distinct projection appears. The figure motivates the pinhole camera model by demonstrating that aperture restriction is the essential mechanism establishing a one-to-one correspondence between scene points and image locations.

## interactions

- Toggle the figure between no wall opening to pinhole opening and watch panel (a) transform into panel (b), linking the mixed ray bundle on the blank wall to the restricted ray bundle that forms the image
- Toggle side-by-side ray comparison: highlight one wall location in both panels and show that it receives many scene directions without a pinhole but only one dominant direction through the pinhole
- Slider for pinhole size, which increases the image blurriness when size increases and vice versa
