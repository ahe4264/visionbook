# Figure spec: brdf

**figure_id:** `brdf`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/physics/3d/brdf.png`

## input_prompt

This figure illustrates the Bidirectional Reflectance Distribution Function (BRDF) as a surface interaction model. An incoming light ray strikes a green surface at a point, where the surface normal n points upward and two ray vectors p and q define the local surface coordinate frame. Multiple outgoing arrows emanating in a hemisphere of directions represent the scattered radiance, and the governing equation shows that the reflected intensity depends on the incident radiance, surface orientation, wavelength, and surface material properties. The spread of outgoing rays captures the fact that real surfaces scatter light across many directions rather than reflecting it specularly into a single one. This figure motivates the BRDF as the general mathematical model that describes how a surface converts incoming irradiance into outgoing radiance across all viewing angles.

## interactions

- Model the BRDF live: a hemisphere of outgoing arrows above the surface point whose lengths encode reflected radiance, recomputed continuously from the current incoming direction and material
- Drag the incoming ray ℓ_in around the hemisphere: the outgoing radiance lobe re-renders in real time with the equation labels tracking
