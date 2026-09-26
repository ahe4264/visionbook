# Figure spec: ResidualNormTypes

**figure_id:** `ResidualNormTypes`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/3d/ResidualNormTypes.png`

## input_prompt

This figure contains five panels (a–e), each depicting a different normalization method using a 3D cube diagram with three labeled axes: position (spatial dimensions), batch index, and channel. Within each cube, orange-shaded regions indicate the set of activations that are jointly normalized together (i.e., the cells over which mean and variance statistics are computed), while gray regions indicate un-normalized cells. Panel (a) shows BatchNorm, where one horizontal slab spanning all batch instances and all spatial positions within a single channel is highlighted, reflecting normalization across the batch and spatial dimensions per channel. Panel (b) shows GhostNorm, where a region covering all batch instances and all channels but not spatial position is highlighted. Panel (c) shows LayerNorm, where all channels and spatial positions within a single batch instance are highlighted, reflecting per-sample normalization across all features. Panel (d) shows GroupNorm, where a subset of channels at all spatial positions within one batch instance is highlighted, reflecting normalization over a fixed group of channels per sample. Panel (e) shows InstanceNorm, where all spatial positions for a single channel within a single batch instance are highlighted, reflecting per-channel per-sample spatial normalization. This figure introduces and contrasts the major normalization strategies used in deep networks, illustrating how they differ in which axes they aggregate statistics over.

## interactions

- Select a normalization type: click BatchNorm, GhostNorm, LayerNorm, GroupNorm, or InstanceNorm to highlight the orange cells that share one mean and variance estimate, while gray cells remain excluded from the statistic
- Animate statistic aggregation: sweep across the highlighted region in the selected cube and show which axes are being pooled over — position, batch index, channel, or a subset of channels — before applying normalization to those activations
- Compare normalization scopes: toggle between the five panels to see how BatchNorm pools across batch and position per channel, GhostNorm uses a restricted batch grouping, LayerNorm pools all features within one sample, GroupNorm pools a channel group within one sample, and InstanceNorm pools spatial positions for one channel within one sample
