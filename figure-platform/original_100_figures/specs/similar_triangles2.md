# Figure spec: similar_triangles2

**figure_id:** `similar_triangles2`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/similar_triangles2.png`

## input_prompt

This figure illustrates the geometric derivation of the perspective projection equations using similar triangles. A 3D world point lies at depth Z, and a dashed ray connects it through the pinhole at the origin to the projected image point on the image plane, which is positioned at focal distance f. The cyan and green shaded planes highlight the two cross-sectional triangles — one in the X-Z plane and one in the Y-Z plane — whose proportional sides directly yield the relations x/f = X/Z and y/f = Y/Z. Image coordinates x and y are labeled in green on the projection plane, and the 3D axes X, Y, Z are shown emanating from the pinhole. The figure demonstrates how collinearity of the 3D point, optical center, and image point forces the similar-triangle relationships that are the geometric foundation of the pinhole projection model.

## interactions

- Drag the 3D point P and update both colored similar-triangle cross sections together, linking the X-Z triangle that gives x/f = X/Z with the Y-Z triangle that gives y/f = Y/Z
- Slider for focal length f: move the image plane and show both projected coordinates x and y scaling from the same depth Z
- Toggle correspondence labels: highlight matching sides across the cyan and green triangle pairs so the two projection equations are visibly derived from the same ray geometry
