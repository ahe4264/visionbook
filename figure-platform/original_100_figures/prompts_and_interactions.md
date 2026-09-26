# Original 100 benchmark figures (domain not prefixed `new_`)

Source: `figure-platform/contexts_export.json` (250 rows; 150 have `domain` = `new_*`).


---

## chemistry

### 1. `CNX_Chem_01_01_FuelCell`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 1
- **reference image:** `images/chemistry/2d/CNX_Chem_01_01_FuelCell.jpg`
- **caption:** A fuel cell generates electrical energy from hydrogen and oxygen via an electrochemical process and produces only water as the waste product.

**Input prompt**

This figure illustrates the internal operation of a hydrogen-oxygen fuel cell, showing the flow of reactants and charge carriers through three labeled components: the anode (left), the proton exchange membrane (center), and the cathode (right). Hydrogen gas enters from the left and is oxidized at the anode, releasing electrons that travel through an external circuit — symbolized by a resistor labeled Electric power at the top — and protons that migrate through the proton exchange membrane toward the cathode. At the cathode, the arriving protons and electrons combine with incoming oxygen to produce water, which exits at the lower right, while unused hydrogen exits at the lower left. This figure introduces the fuel cell as a device that converts the chemical energy of hydrogen oxidation directly into electrical energy through spatially separated half-reactions, with water as the sole byproduct.

**Interactions**

- Animate the electron flow: step through the fuel cell cycle showing H2 splitting at the anode, H+ ions crossing the proton exchange membrane, and electrons flowing through the external circuit to the cathode
- Slider for H2 feed rate: watch the arrow thickness on both the hydrogen inlet and the current path thicken or thin proportionally
- Toggle between the fully labeled diagram and a clean-flow schematic: collapse all text annotations to expose just the particle and electron flow arrows

### 2. `CNX_Chem_01_05_Archer2_img`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 1
- **reference image:** `images/chemistry/2d/CNX_Chem_01_05_Archer2_img.jpg`

**Input prompt**

This figure shows four circular archery targets displayed side by side, each labeled with an archer's name (W, X, Y, Z) and marked with four black dots indicating where arrows struck, designed to contrast the independent concepts of precision and accuracy. Archer W's four dots are tightly grouped near the center of the bullseye, representing both high precision and high accuracy. Archer X's four dots form an equally tight cluster but fall entirely outside the target rings to the lower right, illustrating high precision paired with low accuracy. Archer Y's dots are scattered widely across different regions of the target and beyond its outer edge, representing both low precision and low accuracy, while Archer Z shows two dots near the target rings and two far outside, indicating inconsistent and inaccurate performance. This figure introduces precision and accuracy as distinct, independently variable properties of measurement, demonstrating that reproducibility of results does not guarantee closeness to the true value.

**Interactions**

- Click each archer panel (W, X, Y, Z): highlight the selected panel and display its precision and accuracy classification in a callout
- Toggle to overlay all four targets into a single panel: show all shot-dot clusters simultaneously for direct comparison of spread and center
- Drag a new shot dot onto any target: recalculate and update the precision and accuracy rating label for that archer

### 3. `CNX_Chem_02_02_GoldFoil3`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 2
- **reference image:** `images/chemistry/3d/CNX_Chem_02_02_GoldFoil3.jpg`
- **caption:** The α particles are deflected only when they collide with or pass close to the much heavier, positively charged gold nucleus. Because the nucleus is very small compared to the size of an atom, very few α particles are deflected. Most pass through the relatively large region occupied by electrons, which are too light to deflect the rapidly moving particles.

**Input prompt**

This figure illustrates the atomic-scale interpretation of alpha-particle scattering through gold foil using two coordinated panels. The left panel provides a macroscopic overview of a beam of green-arrowed alpha particles striking a tilted gold foil and diverging on the far side, with a small boxed region indicating the area magnified in the right panel. The right panel, labeled "Enlarged cross-section," depicts a grid of large gold atoms (gold-colored spheres) each containing a tiny red dot representing the positively charged nucleus, and four labeled green arrows trace the three observed outcomes: the majority of alpha particles pass straight through the large empty space of atoms undeflected, a few are slightly deflected as their paths curve near a nucleus, and a very small number are significantly deflected — even nearly backscattered — when they pass nearly head-on through the concentrated positive charge of a nucleus. The extreme smallness of the red nucleus relative to the total atom volume directly conveys why most particles are unaffected, while the dense positive charge of the nucleus accounts for the rare large deflections. This figure provides the atomic-level mechanism that led Rutherford to conclude that an atom consists of a tiny, dense, positively charged nucleus surrounded by a vast region of mostly empty space occupied by electrons too light to deflect the fast-moving particles.

**Interactions**

- Drag an incoming alpha particle trajectory to vary its proximity to a gold nucleus: watch the deflection angle change from near-zero for a distant pass to large backscatter for a near-direct hit
- Slider for nuclear size: expand or shrink the nucleus dot in the cross-section and see how the scattering probability changes

### 4. `CNX_Chem_02_02_Rutherford`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 2
- **reference image:** `images/chemistry/3d/CNX_Chem_02_02_Rutherford.jpg`
- **caption:** Geiger and Rutherford fired α particles at a piece of gold foil and detected where those particles went, as shown in this schematic diagram of their experiment. Most of the particles passed straight through the foil, but a few were deflected slightly and a very small number were significantly deflected.

**Input prompt**

This figure shows a schematic diagram of the Geiger-Rutherford gold foil experiment, depicting the complete apparatus from alpha-particle source to detection. On the left, a labeled radium source of alpha particles emits a collimated green beam that travels horizontally to the right toward a thin gold foil mounted at the center of a circular luminescent screen, with the screen encircling the foil to capture scattered particles at any angle. Four labeled outcomes illustrate the three types of trajectories observed: most alpha particles pass straight through the foil undeflected, a few are slightly deflected at small angles, and a very small number are significantly deflected at large angles, including backward toward the source. The circular luminescent screen enables detection across the full angular range, making even the rare large-angle backscattering events observable. This figure introduces the experimental setup whose unexpected results — particularly the small fraction of particles deflected at large angles — provided the empirical evidence that Rutherford used to reject the Thomson plum-pudding model and propose instead a nuclear model of the atom with charge and mass concentrated in a tiny central nucleus.

**Interactions**

- Animate the experiment: fire the alpha particle beam from the radium source through the gold foil and watch scattered particles hit different positions on the luminescent screen
- Slider for gold foil thickness: show how adding more atomic layers increases the frequency of slight deflections without changing the rate of rare large-angle backscatter
- Toggle labels on and off: hide all component names to use the diagram as a self-quiz for identifying apparatus parts

### 5. `CNX_Chem_02_03_MassSpec`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 2
- **reference image:** `images/chemistry/3d/CNX_Chem_02_03_MassSpec.jpg`
- **caption:** Analysis of zirconium in a mass spectrometer produces a mass spectrum with peaks showing the different isotopes of Zr.

**Input prompt**

This figure contains two panels illustrating both the operating principle of a mass spectrometer and the isotopic data it produces, using zirconium as the sample. The left panel is a schematic cross-section of the instrument showing the sequential stages from left to right: the sample enters and is vaporized by a heater, ionized by an electron beam source, accelerated through electric-field lenses, then curved by a magnet — annotated with the note that the magnetic field deflects the lightest ions most — so that ions of different mass-to-charge ratios follow different curved paths and arrive at different positions on the detector. The right panel displays the resulting mass spectrum as a bar chart with mass-to-charge ratio on the x-axis and relative abundance (%) on the y-axis, showing five labeled peaks for Zr-90 (the tallest peak at approximately 51%), Zr-91, Zr-92, Zr-94, and Zr-96 (the smallest peak), each peak height directly proportional to the natural abundance of that isotope. The combined diagram thus connects instrument design to data output, showing how differential deflection by mass translates into the resolved peaks of the spectrum. This figure demonstrates how a mass spectrometer separates cations by their mass-to-charge ratio to reveal the isotopic composition and relative natural abundances of an element's isotopes.

**Interactions**

- Slider for magnetic field strength: deflect the ion beams by different amounts inside the instrument diagram and simultaneously highlight the corresponding bar (Zr-90 through Zr-96) in the abundance chart as each isotope reaches the detector
- Click a bar in the isotope chart: highlight the matching ion path curvature through the mass spectrometer and annotate the mass-to-charge ratio
- Toggle between the instrument diagram and the bar chart: view them side-by-side or switch between them to link physical ion separation to spectral output

### 6. `CNX_Chem_02_06_IonCharges`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 2
- **reference image:** `images/chemistry/2d/CNX_Chem_02_06_IonCharges.jpg`
- **caption:** Some elements exhibit a regular pattern of ionic charge when they form ions.

**Input prompt**

This figure shows a color-coded periodic table of the elements annotated with the most common ionic charges formed by main-group and selected transition-metal elements, illustrating the relationship between an element's position in the table and its tendency to form ions. Group 1 elements (Li+, Na+, K+, Rb+, Cs+, Fr+, shaded purple) and Group 2 elements (Be2+, Mg2+, Ca2+, Sr2+, Ba2+, Ra2+, shaded green) form cations with charges equal to their group number, while nonmetals in Groups 15–17 (shaded pink) form anions such as N3−, O2−, F−, P3−, S2−, Cl−, and their congeners, with negative charges reflecting how many groups they lie to the left of the noble gases. Transition metals in the central d-block (shaded tan) display variable charges — for example Cr3+/Cr6+, Fe2+/Fe3+, Cu+/Cu2+, and Au+/Au3+ — demonstrating that their ionic behavior is not reliably predicted by group position alone. Noble gases (He, Ne, Ar, Kr, Xe, Rn, shaded blue) carry no charge label, reflecting their chemical inertness. This figure establishes the periodic trends in ion formation and marks the boundary where the group-number rule reliably predicts ionic charge versus where transition-metal variability and other exceptions require additional consideration.

**Interactions**

- Click any element cell: highlight it and display the ion charge, the electron configuration, and the group-trend rule that explains the charge
- Slider for group number (1-18): sweep across the table highlighting one column at a time and showing the typical ion formed for each group
- Toggle the color scheme: switch between element-type coloring (metals, nonmetals, noble gases) and charge-value coloring to compare the two classification schemes

### 7. `CNX_Chem_06_03_Electrnin`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 6
- **reference image:** `images/chemistry/3d/CNX_Chem_06_03_Electrnin.jpg`
- **caption:** (a) The interference pattern for electrons passing through very closely spaced slits demonstrates that quantum particles such as electrons can exhibit wavelike behavior. (b) The experimental results illustrated here demonstrate the wave–particle duality in electrons.

**Input prompt**

This figure contains two panels, (a) and (b), that together demonstrate the wave–particle duality of electrons using a double-slit experiment. Panel (a) presents the wave picture: an electron source on the left sends waves — depicted as expanding concentric golden arcs — through a barrier containing two narrow slits, after which the wavefronts from each slit overlap and interfere to produce a classic banded interference pattern of alternating bright and dark fringes on the black detection screen at the right. Panel (b) presents the particle picture evolving over time: electrons (shown as individual yellow dots) leave the source as discrete particles, pass through the two slits in the barrier, and are recorded one by one on three successive detection screens arranged along a rightward "Time" axis; the first screen shows only a sparse, seemingly random scatter of hits, the second shows more dots still without an obvious pattern, and the third reveals the same banded interference pattern seen in panel (a) fully resolved from the accumulated detections. This figure motivates the concept of wave–particle duality by demonstrating that electrons exhibit clear particle-like behavior when detected individually yet collectively produce the wavelike interference pattern that Davisson and Germer observed experimentally, establishing the quantum mechanical reality that both descriptions are necessary.

**Interactions**

- Toggle between the wave interference model (panel a) and the particle accumulation model (panel b): contrast the continuous interference wave with the probabilistic dot buildup that emerges over time
- Animate the time-lapse in panel (b): advance from a sparse scatter of random dots at early time to a dense, banded interference pattern at late time
- Slider for slit separation: watch the fringe spacing in both the wave model and the accumulating dot pattern change to show wavelength dependence

### 8. `CNX_Chem_07_06_Axeq`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 7
- **reference image:** `images/chemistry/3d/CNX_Chem_07_06_Axeq.jpg`
- **caption:** (a) In a trigonal bipyramid, the two axial positions are located directly across from one another, whereas the three equatorial positions are located in a triangular arrangement. (b–d) The two lone pairs (red lines) in ClF 3 have several possible arrangements, but the T-shaped molecular structure (b) is the one actually observed, consistent with the larger lone pairs both occupying equatorial positions.

**Input prompt**

This figure contains four panels, (a) through (d), that illustrate the trigonal bipyramidal electron-pair geometry and identify the energetically preferred arrangement of lone pairs in ClF3. Panel (a) shows an unlabeled trigonal bipyramidal frame with arrows identifying the two types of positions: the "Axial" positions at the top and bottom of a vertical axis, and the "Equatorial" positions arranged in a triangular plane around the middle. Panels (b), (c), and (d) each show a Cl atom at the center of the trigonal bipyramidal geometry with three F atoms (labeled F) and two lone pairs (shown as short red bond lines) distributed among the five positions in three distinct arrangements: panel (b) places both lone pairs in equatorial positions, producing the T-shaped molecular structure that is actually observed; panel (c) places one lone pair axial and one equatorial; and panel (d) places both lone pairs in axial positions, the arrangement with the greatest lone-pair–bond-pair repulsion. This figure establishes that lone pairs preferentially occupy the more spacious equatorial positions — where 120° bond angles reduce repulsion — and that this preference uniquely determines the experimentally observed T-shaped geometry of ClF3 within VSEPR theory.

**Interactions**

- Click the axial or equatorial label in panel (a): highlight all axial or all equatorial bond positions across panels (b) through (d) simultaneously
- Toggle between panels (b), (c), and (d): cycle through increasing fluorine substitution on the ClFx molecules and observe how lone pairs preferentially occupy equatorial positions

### 9. `CNX_Chem_07_06_Dipolfield`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 7
- **reference image:** `images/chemistry/3d/CNX_Chem_07_06_Dipolfield.jpg`
- **caption:** (a) Molecules are always randomly distributed in the liquid state in the absence of an electric field. (b) When an electric field is applied, polar molecules like HF will align to the dipoles with the field direction.

**Input prompt**

This figure contains two panels, (a) and (b), comparing the orientations of polar HF molecules in the absence and presence of an external electric field. In panel (a), five HF molecules — each depicted as a large green fluorine sphere carrying a δ− partial charge bonded to a smaller white hydrogen sphere carrying a δ+ partial charge — are shown between two uncharged gray plates in random, disordered orientations, reflecting the thermally averaged state when no aligning force is present. In panel (b), an electric field is applied between a negatively charged left plate (labeled −) and a positively charged right plate (labeled +), and five HF molecules are now all uniformly aligned with the δ+ hydrogen end directed toward the negative plate and the δ− fluorine end directed toward the positive plate, demonstrating that the dipole responds to the field direction. This figure illustrates the physical mechanism by which polar molecules align in an electric field and provides the molecular-level basis for understanding how polarity governs intermolecular interactions and the "like dissolves like" principle in solvent chemistry.

**Interactions**

- Toggle between no electric field (panel a) and applied electric field (panel b): watch randomly oriented HCl molecules snap into alignment with delta-plus ends toward the negative plate
- Animate the alignment process: show molecules rotating from random orientations to ordered alignment as the field switches on
- Slider for field strength: show partial alignment at low field strength and near-complete alignment at high field strength

### 10. `CNX_Chem_08_02_sp3Geom`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 8
- **reference image:** `images/chemistry/3d/CNX_Chem_08_02_sp3Geom.jpg`
- **caption:** The hybridization of an s orbital (blue) and three p orbitals (red) produces four equivalent sp 3 hybridized orbitals (yellow) oriented at 109.5° with respect to each other.

**Input prompt**

This figure illustrates the sp3 hybridization process as a stepwise transformation, moving from four distinct atomic orbitals on the left to four equivalent hybrid orbitals on the right and finally to the tetrahedral arrangement they collectively produce at the bottom. The upper-left section shows the four pre-hybridization atomic orbitals drawn individually on Cartesian axes: a spherical s orbital (blue), a px orbital (two-lobed, red and blue, oriented along the x-axis), a py orbital (two-lobed, oriented along the y-axis), and a pz orbital (two-lobed, oriented along the z-axis). A rightward arrow labeled "Hybridization" leads to four equivalent sp3 hybrid orbitals, each rendered as a prominent orange lobe with a small back-lobe, shown individually pointing in different directions; a downward arrow then labeled "Gives a tetrahedral arrangement" leads to a final diagram in which all four sp3 orbitals appear simultaneously, with their large lobes directed symmetrically toward the four corners of a tetrahedron at 109.5° with respect to each other. This figure demonstrates how the mathematical mixing of one s and three p orbitals destroys the original orbital distinctions and produces four energetically and geometrically equivalent sp3 hybrids that underpin the tetrahedral bond angles observed in molecules such as CH4, NH3, and H2O.

**Interactions**

- Toggle individual atomic orbital contributions (s, px, py, pz) on and off: isolate each orbital and see its role in forming the tetrahedral hybrid

### 11. `CNX_Chem_08_02_sp3d`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 8
- **reference image:** `images/chemistry/3d/CNX_Chem_08_02_sp3d.jpg`
- **caption:** (a) The five regions of electron density around phosphorus in PCl 5 require five hybrid sp 3 d orbitals. (b) These orbitals combine to form a trigonal bipyramidal structure with each large lobe of the hybrid orbital pointing at a vertex. As before, there are also small lobes pointing in the opposite direction for each orbital (not shown for clarity).

**Input prompt**

This figure contains two panels, (a) and (b), illustrating sp3d hybridization in phosphorus pentachloride (PCl5) at the molecular and orbital levels. Panel (a) shows a ball-and-stick model of PCl5 with an orange phosphorus atom at the center covalently bonded to five green chlorine atoms directed toward the vertices of a trigonal bipyramid: two axial Cl atoms situated above and below the central P atom along a vertical axis, and three equatorial Cl atoms arranged symmetrically in the horizontal plane. Panel (b) depicts the five sp3d hybrid orbitals that account for these five bonds, each shown as a large orange lobe radiating from a central black dot representing the phosphorus nucleus, labeled "sp3d," and arranged in the same trigonal bipyramidal pattern with dashed lines connecting the lobe tips to outline the geometry; small back-lobes are omitted for clarity. This figure establishes sp3d hybridization — derived from mixing one 3s, three 3p, and one 3d orbital of phosphorus — as the valence-bond explanation for the five equivalent bonding regions in PCl5 and connects orbital theory directly to the observed trigonal bipyramidal molecular structure.

**Interactions**

- Toggle between the ball-and-stick molecular model (panel a) and the sp3d hybrid orbital lobe diagram (panel b): compare the physical geometry of bonds to the underlying orbital shapes
- Click any hybrid orbital lobe in panel (b): highlight the corresponding bond direction in the molecular model panel (a)

### 12. `CNX_Chem_08_04_Gouy`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 8
- **reference image:** `images/chemistry/3d/CNX_Chem_08_04_Gouy.jpg`
- **caption:** A Gouy balance compares the mass of a sample in the presence of a magnetic field with the mass with the electromagnet turned off to determine the number of unpaired electrons in a sample.

**Input prompt**

This figure illustrates a Gouy balance apparatus used to measure magnetic susceptibility, showing a vertically suspended sample tube positioned between two cylindrical electromagnets and counterbalanced on a traditional beam balance against calibrated reference weights. The sample tube, labeled "Sample," hangs from one arm of the balance beam down into the gap between the two poles labeled "Electromagnets," while the opposite arm holds a pan carrying calibrated masses; the label "Magnetic field" with a line points to the region inside the gap, where curved purple arrows radiate outward in concentric arcs representing the inhomogeneous field lines diverging from the magnet poles. Because a paramagnetic sample containing unpaired electrons is drawn into the stronger-field region of the gap, it experiences a net downward force that makes it appear heavier, shifting the beam, while a diamagnetic sample with all electrons paired is weakly repelled and appears slightly lighter. The change in apparent mass — measured by adding or removing calibrated weights until the beam re-levels — is proportional to the number of unpaired electrons in the sample, providing a direct experimental count of those electrons. This figure introduces the Gouy balance as the key instrument for determining magnetic susceptibility and motivates its use to reveal that O2 possesses two unpaired electrons, a fact the Lewis-structure model fails to predict.

**Interactions**

- Toggle between a paramagnetic sample and a diamagnetic sample: watch the balance tip toward the magnet or away from it and update the sign of the magnetic susceptibility
- Slider for magnetic field strength: observe proportional deflection of the balance arm and read off the corresponding susceptibility value
- Animate the weighing procedure: show the sample tube being drawn into or repelled from the magnetic field region as the electromagnets energize

### 13. `CNX_Chem_09_01_Manometer`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 9
- **reference image:** `images/chemistry/2d/CNX_Chem_09_01_Manometer.jpg`
- **caption:** A manometer can be used to measure the pressure of a gas. The (difference in) height between the liquid levels ( h ) is a measure of the pressure. Mercury is usually used because of its large density.

**Input prompt**

This figure shows three U-tube manometer configurations that together cover every possible relationship between gas pressure and atmospheric pressure, each labeled with the corresponding pressure equation below. The left panel depicts a closed-end manometer whose sealed arm contains a vacuum, making the height difference h the sole determinant of pressure so that P_gas = hρg. The middle panel shows an open-end manometer in which the gas-side liquid stands higher than the open (atmospheric) side, indicating the gas is below atmospheric pressure and P_gas = P_atm − hρg. The right panel reverses that situation — the open-arm liquid is higher — indicating the gas exceeds atmospheric pressure so that P_gas = P_atm + hρg. This figure introduces the manometer as a practical pressure-measuring instrument and establishes the three distinct cases that determine which formula relates the liquid-column height h to the unknown gas pressure.

**Interactions**

- Toggle between the three manometer configurations (closed-end vacuum, open-end gas lower, open-end gas higher): highlight the applicable P_gas formula below each panel
- Slider for gas pressure P_gas: watch the mercury column height h respond in real time for whichever configuration is active
- Click the h arrow in any panel: display a step-by-step derivation of the pressure equation for that manometer type

### 14. `CNX_Chem_09_04_Diffusion`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 9
- **reference image:** `images/chemistry/2d/CNX_Chem_09_04_Diffusion.jpg`
- **caption:** (a) Two gases, H 2 and O 2 , are initially separated. (b) When the stopcock is opened, they mix together. The lighter gas, H 2 , passes through the opening faster than O 2 , so just after the stopcock is opened, more H 2 molecules move to the O 2 side than O 2 molecules move to the H 2 side. (c) After a short time, both the slower-moving O 2 molecules and the faster-moving H 2 molecules have distributed themselves evenly on both sides of the vessel.

**Input prompt**

This figure contains three panels labeled (a), (b), and (c) that illustrate the process of gaseous diffusion as two initially separated gases mix after a connecting stopcock is opened. In panel (a), 'Stopcock closed,' all small white dots representing H2 molecules are confined to the left bulb and all red dots representing O2 molecules are densely packed in the right bulb, with the closed stopcock valve preventing any exchange. In panel (b), 'Stopcock open,' a small number of white H2 molecules have already dispersed into the O2-side bulb while fewer red O2 molecules have crossed to the H2 side, reflecting the faster diffusion rate of the lighter, less massive H2 gas. In panel (c), 'Some time after Stopcock open,' both white and red dots are distributed approximately uniformly across both bulbs, indicating that the concentration gradients have largely equalized through continued random molecular motion. This figure demonstrates that diffusion is driven by concentration gradients and that lighter gases diffuse more rapidly than heavier ones, motivating the quantitative relationship described by Graham's law of effusion.

**Interactions**

- Animate the diffusion process: advance through stopcock-closed to just-opened to equilibrium, watching white H2 particles and red O2 particles redistribute between the two flasks
- Slider for elapsed time: move molecules gradually between the three snapshots to show intermediate particle distributions
- Toggle to color-code by molecular mass: emphasize how lighter H2 spreads faster than heavier O2 by showing the H2 side emptying more quickly

### 15. `CNX_Chem_10_02_Testtubeoi_img`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 10
- **reference image:** `images/chemistry/3d/CNX_Chem_10_02_Testtubeoi_img.jpg`

**Input prompt**

This figure contains four tall graduated cylinders arranged side by side on a common base labeled "Oil viscosity (SAE)," each filled with motor oil of a different SAE grade — 20, 30, 40, and 50 from left to right — and each holding a metal sphere dropped simultaneously from the top so that its position at a single elapsed moment reveals the oil's resistance to flow. The oils range progressively in color from pale yellow (SAE 20) to a deeper orange-red (SAE 50), and the position of the sphere descends less and less as the SAE grade increases: the sphere has fallen to the lower portion of the tube in grade 20, slightly higher in grade 30, noticeably higher in grade 40, and only to slightly above the midpoint of the column in grade 50. Because a more viscous fluid exerts a greater drag force on the sphere, slowing it to a lower terminal velocity, the shorter distance traveled in a fixed time directly encodes the ranking of viscosity across grades. The side-by-side format at a single instant converts viscosity — an intrinsic property — into a visually comparable positional difference, removing any need for stopwatches or calculations. This figure demonstrates viscosity as a rank-orderable physical property and establishes that higher SAE-grade oils offer greater internal resistance to the motion of an object moving through them.

**Interactions**

- Animate all four spheres dropping simultaneously: compare falling speeds across SAE 20, 30, 40, and 50 oils to visually rank viscosity from lowest to highest
- Slider for oil SAE grade (20 to 50): watch a single ball's drop rate slow continuously as viscosity increases
- Toggle to display terminal velocity labels on each ball once each sphere reaches steady descent speed

### 16. `CNX_Chem_10_06_CubUntCll`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 10
- **reference image:** `images/chemistry/3d/CNX_Chem_10_06_CubUntCll.jpg`
- **caption:** Cubic unit cells of metals show (in the upper figures) the locations of lattice points and (in the lower figures) metal atoms located in the unit cell.

**Input prompt**

This figure presents six diagrams of the three cubic unit cell types — simple cubic, body-centered cubic (BCC), and face-centered cubic (FCC) — arranged in two rows of three: a top row titled "Lattice point locations" showing schematic dot-and-line cube diagrams, and a bottom row titled "Cubic unit cells" showing space-filling sphere models, with each column sharing a label (Simple cubic, Body-centered cubic, Face-centered cubic) at the bottom. In the top-row schematic diagrams, the simple cubic cell has black dots only at the eight corners; the BCC cell adds one red dot at the body center; and the FCC cell adds red dots at the center of each face while retaining black dots at all corners. In the bottom-row space-filling models, the simple cubic unit cell shows gray corner spheres touching along cube edges with no central atom; the BCC model highlights the single body-center atom in orange, showing it in contact with all eight gray corner atoms; and the FCC model shows multiple orange face-centered atoms contacting both the gray corner atoms and neighboring face atoms along face diagonals. By pairing each abstract lattice-point diagram directly above its corresponding space-filling model, the figure makes explicit how lattice geometry translates into actual atomic packing and allows the number of atoms per unit cell to be counted for each type. This figure introduces the three cubic unit cells as the fundamental repeating units of metallic crystal lattices and establishes the atom-counting framework needed to calculate density and relate crystal structure to bulk properties.

**Interactions**

- Toggle between simple cubic, body-centered cubic, and face-centered cubic: update both the lattice point diagram (top row) and the space-filling sphere model (bottom row) simultaneously
- Click any atom in the space-filling model: highlight its fractional contribution (1/8 for corner, 1/2 for face, 1 for body center) and display the total atoms per unit cell

### 17. `CNX_Chem_11_02_electrolyt`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 11
- **reference image:** `images/chemistry/3d/CNX_Chem_11_02_electrolyt.jpg`
- **caption:** Solutions of nonelectrolytes such as ethanol do not contain dissolved ions and cannot conduct electricity. Solutions of electrolytes contain ions that permit the passage of electricity. The conductivity of an electrolyte solution is related to the strength of the electrolyte.

**Input prompt**

This figure shows three side-by-side electrolytic conductivity setups, each consisting of a beaker with two plate electrodes labeled − and + immersed in solution and wired in series with a light bulb and a wall power source, used to compare the electrical conductivities of a nonelectrolyte, a strong electrolyte, and a weak electrolyte. In the left panel (labeled "ethanol / No conductivity"), the bulb remains completely dark and the solution contains only neutral green molecular clusters drifting randomly with no ions and no directed movement, indicating zero free charge carriers. In the middle panel (labeled "KCl / High conductivity"), the bulb glows brightly, and numerous green spheres marked with + and − symbols are shown migrating in opposite directions toward their respective electrodes — cations toward the negative plate and anions toward the positive plate — representing complete dissociation of a strong electrolyte. In the right panel (labeled "acetic acid solution / Low conductivity"), the bulb glows dimly, and only a few labeled ions with directional arrows appear alongside undissociated molecule clusters, reflecting the partial dissociation characteristic of a weak electrolyte. The brightness of the light bulb serves as a qualitative, visually intuitive indicator of ion concentration and degree of dissociation across all three panels. This figure introduces the experimental distinction among nonelectrolytes, strong electrolytes, and weak electrolytes by connecting the microscopic presence of dissolved ions to the macroscopic observation of electrical conductance.

**Interactions**

- Toggle between the three solutions (ethanol, KCl, acetic acid): watch the light bulb brightness change to reflect no conductivity, high conductivity, and low conductivity respectively
- Animate ion motion inside each beaker: show full ion migration for KCl, sparse partial migration for acetic acid, and no ion movement for ethanol
- Slider for solute concentration: observe how light bulb brightness and ion density in the beaker scale with the amount of dissolved electrolyte

### 18. `CNX_Chem_12_07_Enzyme`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 12
- **reference image:** `images/chemistry/2d/CNX_Chem_12_07_Enzyme.jpg`
- **caption:** (a) According to the lock-and-key model, the shape of an enzyme’s active site is a perfect fit for the substrate. (b) According to the induced fit model, the active site is somewhat flexible, and can change shape in order to bond with the substrate.

**Input prompt**

This figure compares two competing models of enzyme–substrate binding through four sequential diagrams arranged in two panels: panel (a) for the lock-and-key model and panel (b) for the induced fit model. In panel (a), the left diagram shows a green enzyme with a rigid, pre-formed active site cavity labeled 'Active site is proper shape,' with two complementary-shaped purple substrate molecules (labeled 'Substrates') positioned above it ready to fit precisely into the cleft; the right diagram shows the resulting 'Substrate complex formed' with the substrates seated snugly in the geometrically unchanged active site. In panel (b), the left diagram shows the enzyme with a more open and flexible active site labeled 'Active site changes to fit,' indicating a conformational adjustment upon substrate approach; the right diagram shows the 'Substrate complex formed' after the enzyme has reshaped itself to wrap tightly around the substrate. Both models account for substrate specificity — only a structurally compatible molecule can bind the active site — but differ in whether that specificity arises from a rigid pre-formed pocket or from an adaptive conformational change induced by substrate binding. This figure introduces enzyme active-site specificity at the molecular level and sets up the comparison of lock-and-key versus induced-fit mechanisms as competing explanations for how enzymes selectively bind and catalyze reactions with particular substrates.

**Interactions**

- Toggle between the lock-and-key model (left pair) and the induced-fit model (right pair): observe the rigid versus flexible active site as the substrate approaches and binds
- Animate substrate binding: show the substrate docking into the active site for each model, highlighting the conformational change in the induced-fit case but not in the lock-and-key case

### 19. `CNX_Chem_12_07_HetCats-230a`  (3d)

- **source:** OpenStax Chemistry 2e, chapter 12
- **reference image:** `images/chemistry/3d/CNX_Chem_12_07_HetCats-230a.jpg`
- **caption:** Mechanism for the Ni-catalyzed reaction C 2 H 4 + H 2 ⟶ C 2 H 6 . (a) Hydrogen is adsorbed on the surface, breaking the H–H bonds and forming Ni–H bonds. (b) Ethylene is adsorbed on the surface, breaking the C–C π-bond and forming Ni–C bonds. (c) Atoms diffuse across the surface and form new C–H bonds when they collide. (d) C 2 H 6 molecules desorb from the Ni surface.

**Input prompt**

This figure illustrates the four-step heterogeneous catalytic mechanism for the Ni-catalyzed hydrogenation of ethylene (C2H4 + H2 → C2H6) using ball-and-stick molecular models positioned above a green lattice representing the nickel surface. In panel (a), white spheres representing hydrogen atoms are shown adsorbed across the Ni surface after H–H bond cleavage, forming Ni–H bonds. Panel (b) shows an ethylene molecule (black carbon atoms double-bonded, white hydrogen atoms) descending onto the surface, with downward arrows and the label "Ethylene adsorbed on surface breaking π bonds" indicating that the C–C π-bond breaks and new Ni–C bonds form. Panel (c) depicts the surface-diffusion step, with curved arrows on the two carbon atoms showing H atoms migrating across the surface to collide with and bond to the adsorbed carbon atoms, forming new C–H bonds. Panel (d) shows the fully saturated ethane molecule (C2H6) departing upward from the now mostly bare Ni surface via a single upward arrow, representing desorption of the product. This figure establishes the mechanistic basis for heterogeneous catalysis by showing how the Ni surface facilitates bond breaking and formation at each discrete step of the hydrogenation reaction.

**Interactions**

- Animate the four-step heterogeneous catalytic cycle: H2 adsorbs and dissociates on Ni (a), ethylene approaches and adsorbs breaking its pi bond (b), hydrogen atoms add to each carbon (c), ethane desorbs from the surface (d)
- Toggle between steps (a) through (d): examine each mechanistic stage and highlight the bonds forming and breaking at the Ni surface
- Click any surface atom: identify it as Ni and display how the metal surface weakens the adsorbed molecule bonds to enable reaction

### 20. `CNX_Chem_13_01_equilibrium`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 13
- **reference image:** `images/chemistry/2d/CNX_Chem_13_01_equilibrium.jpg`
- **caption:** (a) A sealed tube containing colorless N 2 O 4 darkens as it decomposes to yield brown NO 2 . (b) Changes in concentration over time as the decomposition reaction achieves equilibrium. (c) At equilibrium, the forward and reverse reaction rates are equal.

**Input prompt**

This figure contains three panels that together build a complete mechanistic picture of how the reversible reaction N2O4(g) ⇌ 2NO2(g) approaches chemical equilibrium. Panel (a) shows molecular-scale snapshots of a sealed container at t = 0, pre-equilibrium, and at equilibrium: starting from only large, colorless N2O4 molecules, the mixture progressively gains smaller brown NO2 molecules until a stable proportion of both coexists, mirrored by the color change from colorless to deep orange-brown in the tube icons above. Panel (b) plots concentration versus time, with [N2O4] falling and [NO2] rising along smooth curves that both plateau once the shaded Equilibrium achieved region is entered. Panel (c) plots reaction rates versus time, showing the forward rate k_f[N2O4] decreasing and the reverse rate k_r[NO2]^2 increasing until the two curves merge at a common constant value. Together the three panels demonstrate that equilibrium is a dynamic state defined by equal opposing rates rather than a cessation of reaction, motivating the quantitative equilibrium constant that follows.

**Interactions**

- Drag a vertical time marker along the x-axis of graphs (b) and (c): highlight the corresponding vial color in panel (a) and read off concentrations and reaction rates simultaneously
- Slider for initial N2O4 concentration: shift the equilibrium position and watch the vial color in panel (a), the concentration curves in panel (b), and the rate curves in panel (c) all update together
- Toggle between the concentration graph (b) and the rate graph (c): collapse into a single panel that switches the y-axis quantity

### 21. `CNX_Chem_18_02_DownsCell`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 18
- **reference image:** `images/chemistry/2d/CNX_Chem_18_02_DownsCell.jpg`
- **caption:** Pure sodium metal is isolated by electrolysis of molten sodium chloride using a Downs cell. It is not possible to isolate sodium by electrolysis of aqueous solutions of sodium salts because hydrogen ions are more easily reduced than are sodium ions; as a result, hydrogen gas forms at the cathode instead of the desired sodium metal. The high temperature required to melt NaCl means that liquid sodium metal forms.

**Input prompt**

This figure shows a labeled cross-sectional diagram of a Downs cell, the industrial electrolytic apparatus used to produce pure sodium metal from molten sodium chloride via the reaction 2NaCl(l) → 2Na(l) + Cl2(g). The cell interior contains a bath of molten NaCl, with a cylindrical iron screen separating the electrode compartments; the cathode (−) occupies the outer annular region and the anode (+) projects upward from the bottom center, both connected to an external voltage source at the lower right. Liquid sodium metal, which is less dense than the molten salt, rises and collects in a side reservoir on the right, from which it drains through a labeled Na outlet; simultaneously, Cl2 gas produced at the anode rises through a central green-tinted collector tube and exits through a labeled Cl2 outlet at the upper right, while fresh NaCl is fed continuously through an inlet at the top. The iron screen physically segregates the two products — liquid sodium and gaseous chlorine — preventing their recombination and enabling continuous, separate collection of each. This figure demonstrates the Downs cell as the industrial-scale process for sodium production and explains why aqueous electrolysis cannot substitute for it, since H+ ions are more easily reduced than Na+ ions at any cathode in contact with water.

**Interactions**

- Animate the electrolysis: show Cl- ions migrating toward the central anode and Na+ ions moving to the outer cathode, with Cl2 gas rising through the outlet and liquid sodium collecting at the Na outlet
- Click each electrode region: highlight the half-reaction occurring there and display the balanced half-equation

### 22. `CNX_Chem_18_02_HallHerCell`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 18
- **reference image:** `images/chemistry/2d/CNX_Chem_18_02_HallHerCell.jpg`
- **caption:** An electrolytic cell is used for the production of aluminum. The electrolysis of a solution of cryolite and calcium fluoride results in aluminum metal at the cathode, and oxygen, carbon monoxide, and carbon dioxide at the anode.

**Input prompt**

This figure shows a labeled cross-sectional diagram of a Hall-Héroult electrolytic cell used for the industrial production of aluminum metal from Al2O3 dissolved in molten cryolite (Na3AlF6). The outermost structure consists of a steel shell lined with ceramic insulation; inside, two large rectangular carbon anodes (+) are suspended from above into a green-tinted electrolyte layer representing Al2O3 dissolved in molten Na3AlF6, while a sloped carbon cathode (−) forms the entire floor of the cell. White dots surrounding the anodes represent bubbles of O2, CO, and CO2 that form as the carbon anodes are oxidized during electrolysis, and molten aluminum — reduced from Al3+ at the cathode — collects as a dense liquid layer above the cathode floor; a solid crust of electrolyte forms at the top surface of the melt. Gaseous HF and particulates generated during operation are routed upward through an exhaust line labeled "HF and particulates exhaust to filter plant," reflecting the environmental management demands of the process. This figure establishes the Hall-Héroult cell as the primary industrial route for aluminum smelting, highlighting how dissolving Al2O3 in molten Na3AlF6 lowers the operating temperature below what pure Al2O3 would require and how the simultaneous oxidation of the carbon anodes produces mixed gaseous byproducts.

**Interactions**

- Animate the electrolytic process: show Al3+ ions being reduced at the carbon cathode floor and O2- ions oxidized at the carbon anodes, with bubbles of O2, CO, and CO2 rising around the anodes
- Slider for applied current: watch bubble formation rate increase and the molten aluminum layer thicken

### 23. `CNX_Chem_18_10_FrachMine`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 18
- **reference image:** `images/chemistry/2d/CNX_Chem_18_10_FrachMine.jpg`
- **caption:** The Frasch process is used to mine sulfur from underground deposits.

**Input prompt**

This figure shows a cutaway diagram of the Frasch process for mining elemental sulfur from deep underground deposits, depicting three concentric pipes that simultaneously deliver superheated water and compressed air downward and recover liquid sulfur upward. The diagram is divided into three visible strata: an above-ground surface region, a brown soil layer, and a deep yellow solid sulfur deposit at the bottom, where a pool of liquid sulfur collects after the deposit is melted. Labeled arrows trace each fluid pathway: superheated water (170 °C, 10 atm) travels down the outermost pipe (downward arrows) and melts the surrounding sulfur; compressed air, entering from the upper right, travels down the innermost pipe; and the resulting frothy mixture of liquid sulfur, water, and air is forced up through the middle pipe (upward arrows) and exits at the surface to the upper left, labeled "Sulfur, water, and air." The three concentric pipes terminate at the bottom in a curved manifold that directs hot water outward into the deposit and channels the molten sulfur inward toward the rising middle pipe. This figure introduces the Frasch process as a purely physical extraction method that exploits sulfur's low melting point and low density, requiring no underground mining operations and yielding sulfur of 99.5–99.9% purity directly upon surface cooling.

**Interactions**

- Animate the Frasch process flow: show superheated water descending the outer pipe, melting the solid sulfur deposit, compressed air descending the innermost pipe, and the sulfur-water-air mixture rising through the middle pipes to the surface

### 24. `CNX_Chem_21_04_CritMass`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 21
- **reference image:** `images/chemistry/2d/CNX_Chem_21_04_CritMass.jpg`
- **caption:** (a) In a subcritical mass, the fissile material is too small and allows too many neutrons to escape the material, so a chain reaction does not occur. (b) In a critical mass, a large enough number of neutrons in the fissile material induce fission to create a chain reaction.

**Input prompt**

This figure contains two side-by-side circular diagrams, labeled (a) Sub-critical mass and (b) Critical mass, contrasting how sample size determines whether a nuclear fission chain reaction can become self-sustaining. In panel (a), a small blue circle contains a sparse arrangement of gold starburst symbols representing individual fission events, and the majority of the black arrows representing emitted neutrons point outward beyond the boundary of the circle, indicating that most neutrons escape the material without inducing further fissions; a single incoming neutron from the upper left initiates the limited sequence. In panel (b), a significantly larger blue circle is densely populated with many more fission-event starbursts, and the neutron arrows predominantly stay within the boundary and terminate at other fission sites, demonstrating that neutrons are captured and productive rather than lost; only a few arrows exit the periphery, and again one initiating neutron enters from the upper left. The visual contrast in circle size and in the fraction of escaping versus captured neutrons directly encodes the critical threshold: below the critical mass, neutron leakage prevents a sustained reaction, while at or above it, each fission event generates enough captured neutrons to propagate the chain indefinitely. This figure introduces the concept of critical mass as the minimum quantity of fissile material at which the rate of neutron production equals the combined rate of neutron absorption and escape, enabling a self-sustaining chain reaction.

**Interactions**

- Toggle between sub-critical mass (panel a) and critical mass (panel b): highlight the size difference and annotate what fraction of neutrons escape versus trigger further fission in each case
- Animate the neutron chain reaction in panel (b): fire one neutron and watch it cascade into 2, 4, 8 fission events across the larger mass
- Slider for fissile material mass: scale the circle from sub-critical to critical size and show how the neutron-escape fraction decreases as the radius grows

### 25. `CNX_Chem_21_04_Fission1`  (2d)

- **source:** OpenStax Chemistry 2e, chapter 21
- **reference image:** `images/chemistry/2d/CNX_Chem_21_04_Fission1.jpg`
- **caption:** When a slow neutron hits a fissionable U-235 nucleus, it is absorbed and forms an unstable U-236 nucleus. The U-236 nucleus then rapidly breaks apart into two smaller nuclei (in this case, Ba-141 and Kr-92) along with several neutrons (usually two or three), and releases a very large amount of energy.

**Input prompt**

This figure illustrates the two-step sequence of neutron-induced fission of uranium-235, rendered as a left-to-right progression of nuclear space-filling/sphere-cluster models. A slow neutron strikes a U-235 nucleus, which absorbs it to form the short-lived intermediate U-236, depicted as an elongated, pinched nucleus outlined in red to convey its instability. The unstable nucleus rapidly splits into two smaller daughter nuclei — Ba-141 and Kr-92 — while simultaneously ejecting three neutrons and releasing a large burst of energy shown as a gold starburst labeled Energy. The balanced nuclear equation at the bottom confirms conservation of both mass number and atomic number across both steps. This figure introduces nuclear fission as a chain-reaction-capable process in which a single neutron absorption triggers the release of multiple secondary neutrons alongside an enormous quantity of energy, establishing the basis for both nuclear reactors and weapons.

**Interactions**

- Animate the step-by-step fission sequence: neutron strikes U-235, U-236 forms as a deformed nucleus, then splits releasing Kr-92, Ba-141, three neutrons, and an energy burst
- Click any product nucleus or particle: display its symbol, atomic number, mass number, and its role in sustaining a chain reaction
- Slider for chain reaction step: start from one fission event and show the three released neutrons each triggering additional fissions

---

## cs

### 26. `11.3`  (2d)

- **source:** Introduction to Algorithms, Figure 11.3
- **reference image:** `images/cs/2d/11.3.png`

**Input prompt**

This figure illustrates a hash table T that uses chaining to resolve collisions, showing the complete mapping from the universe of keys to table slots and their linked-list chains. On the left, two concentric circles represent the key space: the outer dark gray ring is the universe U of all possible keys and the inner light circle is the set K of actual keys stored in the table; eight actual keys k₁ through k₈ are marked as filled black dots within K. The center of the figure shows the hash table T as a vertical column of slots; empty slots are indicated by diagonal hatching, while non-empty slots are white rectangles with arrows pointing right to their chains. On the right, four doubly linked list chains hang off the non-empty slots of T: the first chain contains k₁ and k₄, the second chain contains k₅, k₂, and k₇, the third chain contains k₃ alone, and the fourth chain contains k₈ and k₆. Each list node is drawn as a three-cell box with a left-pointer cell, a key-label cell, and a right-pointer cell; null pointers are indicated by a diagonal slash. Arrows from the keys in K cross to the corresponding slot in T, making the hash function h visible as the mapping that sends multiple keys to the same slot when a collision occurs. This figure introduces chaining as a collision resolution strategy, showing how h partitions the actual keys into groups that share a slot, each group stored as a doubly linked list.

**Interactions**

- code editing: learner writes a hash function h(k) as a one-line JS expression (e.g. "k % 9") where k is the numeric key; the figure reroutes all arrows from the K circle to hash table slots in real time — collisions stack into chains, empty slots stay nil; a poor hash immediately shows long chains — teaches that h(k) alone determines chain structure and collision frequency

### 27. `19.2`  (2d)

- **source:** Introduction to Algorithms, Figure 19.2
- **reference image:** `images/cs/2d/19.2.png`

**Input prompt**

This figure contains two panels, (a) and (b), showing the same Fibonacci heap H in two complementary representations. Panel (a) uses an abstract tree view: five min-heap-ordered trees share a circular root list whose five root nodes — 23, 7, 3, 17, and 24 — are connected by a horizontal dashed line; an H.min pointer above points down to the minimum root node 3. The tree rooted at 3 has three children: 18, 52, and 38; node 18 has one child 39, and node 38 has one child 41. The tree rooted at 24 has children 26 and 46, where 26 has one child 35. The tree rooted at 17 has one child 30. Nodes 18, 39, and 26 are drawn as filled black circles with white numerals, indicating they are marked. Panel (b) shows the same heap with an explicit pointer diagram: each node is still a circular node and both the root list and each sibling list of children are represented as circular doubly linked lists with pairs of directed arrows indicating forward and backward pointers. The H.min pointer and the marked nodes (18, 39, 26) are identical to those in panel (a). This figure establishes the two-level representation of a Fibonacci heap, contrasting the abstract tree view with the concrete pointer structure, and identifies marked nodes as those that have lost one child since last becoming a root.

**Interactions**

- Toggle between panel (a) (abstract tree view) and panel (b) (explicit pointer diagram): switch the rendering between tree edges and bidirectional linked-list arrows to show how the same Fibonacci heap is represented at two levels of abstraction
 - Click any node to highlight its four pointer fields — parent, child, left sibling, and right sibling — in the panel (b) diagram, showing the doubly linked structure both within the root list and within each child list
 - Animate a FIB-HEAP-INSERT: add a new node, splice it into the doubly linked root list in O(1), and update the H.min pointer if the new key is smaller than node 3, showing the constant-time insertion

### 28. `2.2`  (2d)

- **source:** Introduction to Algorithms, Figure 2.2
- **reference image:** `images/cs/2d/2.2.png`

**Input prompt**

This figure contains six panels (a)–(f) illustrating the operation of insertion sort on an array of six integers. Each panel shows a horizontal array of six cells indexed 1 through 6 above the cells. Gray cells to the left of the current key represent the already-sorted subarray; the current key is shown in a black cell with white text; white cells to the right remain unsorted. Curved arrows below the array indicate element movements: a bold black arrow points to the slot where the key will be inserted, while lighter gray arrows indicate elements shifting one position to the right to make room. Panel (a) shows the initial array [5, 2, 4, 6, 1, 3] with key 2 at position 2 moving left past 5. Panel (b) shows key 4 at position 3 being inserted into sorted subarray [2, 5]. Panel (c) shows key 6 at position 4 requiring no movement as it is already the largest element in the sorted prefix. Panel (d) shows key 1 at position 5 shifting four elements rightward to reach position 1. Panel (e) shows key 3 at position 6 shifting three elements rightward to reach its correct position. Panel (f) shows the final sorted array [1, 2, 3, 4, 5, 6] with no black cell and no arrows. This figure illustrates the insertion sort algorithm step by step, demonstrating how each key is extracted and inserted into its correct position within the growing sorted subarray to its left.

**Interactions**

- code editing: learner implements insertion sort with primitives compare(i, j) (returns true if A[i] > A[j]) and shift(i) (moves element at index i one position left); the array [5, 2, 4, 6, 1, 3] is pre-loaded as labeled boxes; running the code animates each compare and shift call, highlighting the active element in black and the sorted prefix in gray, driving the display from panel (a) to (f); a reference solution is revealable after a failed attempt

### 29. `24.4`  (2d)

- **source:** Introduction to Algorithms, Figure 24.4
- **reference image:** `images/cs/2d/24.4.png`

**Input prompt**

This figure contains five panels (a)–(e) tracing the execution of the Bellman-Ford algorithm on a directed weighted graph with five vertices s, t, x, y, and z and ten directed edges with weights 6, 7, 5, 8, −4, −2, −3, 9, 7, and 2. The same graph layout is used in all five panels: vertex s appears at the left, t and y in the center-left region, and x and z at the right; each vertex circle displays the current shortest-path estimate d[v] inside it. Panel (a) shows the initial state with d[s] = 0 and d[v] = ∞ for all other vertices, and all edges drawn as thin black arrows labeled with their weights. Panels (b) through (e) each show the graph after one additional relaxation pass; bold gray arrows highlight the edges whose relaxation improved a distance estimate in that pass, and updated d[v] values appear inside the affected vertex circles. After pass 1 (panel b), d[t] = 6 and d[y] = 7. After pass 2 (panel c), d[x] = 4 and d[z] = 2. After pass 3 (panel d), d[t] = 2 and d[z] = −2. Panel (e) shows the final shortest-path estimates d[s] = 0, d[t] = 2, d[x] = 4, d[y] = 7, d[z] = −2, with bold arrows forming the shortest-path tree along the path s → y → x → t → z. This figure demonstrates the Bellman-Ford algorithm's iterative relaxation process, showing how negative-weight edges cause distance estimates to decrease over successive passes until convergence.

**Interactions**

- code editing: learner implements relax(u, v, w) that sets dist[v] = dist[u] + w when dist[u] + w < dist[v], using the provided dist object (dist.s=0, all others Infinity) and pred object; running calls relax on each edge across 4 passes in the order shown, animating updated distance labels inside vertex circles and shading newly relaxed edges in gray, driving the graph from panel (a) to (e); a counter shows how many distances changed each pass

### 30. `6.3`  (2d)

- **source:** Introduction to Algorithms, Figure 6.3
- **reference image:** `images/cs/2d/6.3.png`

**Input prompt**

This figure shows the operation of the BUILD-MAX-HEAP procedure on a 10-element input array A = ⟨4, 1, 3, 2, 16, 9, 10, 14, 8, 7⟩ across six panels (a)–(f). At the top of the figure, the input array A is displayed as a horizontal row of ten labeled cells. Each panel shows the heap as a rooted binary tree in which every node is labeled with its array index (small numeral outside the circle) and its current key value (numeral inside the circle); light gray nodes are unmodified and the single dark gray node labeled i marks the root of the subtree currently being processed by MAX-HEAPIFY. Panel (a) shows the initial tree before any heapification, with i = 5 (value 16) — the first call to MAX-HEAPIFY starting from index ⌊n/2⌋ = 5. Panel (b) shows the state with i = 4 (value 2), after MAX-HEAPIFY has been applied at index 5. Panel (c) shows i = 3 (value 3), with the subtree at index 4 already corrected to place 14 above 2 and 8. Panel (d) shows i = 2 (value 1). Panel (e) shows i = 1 (value 4), the final call, where the root must be sifted down. Panel (f) shows the completed max-heap with root 16, in which no dark node appears and every parent holds a value greater than or equal to its children. This figure illustrates how BUILD-MAX-HEAP constructs a max-heap in place by calling MAX-HEAPIFY on each internal node from index ⌊n/2⌋ down to index 1.

**Interactions**

- code editing: learner implements maxHeapify(i, heapSize) with primitives left(i), right(i), swap(i, j), and value(i); the array [4, 1, 3, 2, 16, 9, 10, 14, 8, 7] is shown as both the array bar and the tree diagram; running animates the sift-down, shading the current node i in dark gray and drawing comparison arrows to children, driving the tree from panel (a) to the correct max-heap in (f); a "Run BUILD-MAX-HEAP" button calls the learner's maxHeapify in the correct bottom-up order across all nodes

### 31. `Conv1DChannels`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/Conv1DChannels.png`

**Input prompt**

This figure depicts a three-dimensional schematic of a 1D convolutional layer with multiple channels, rendered in a 3D perspective with labeled axes for Channels, Width, and Height. The input layer H and output layer H' are shown as two 3D volumetric grids of white circles with black outlines and thin strokes, each circle representing a feature value at a specific (channel, position) coordinate; the two grids are positioned side by side with spatial offset to convey depth. Between the input and output grids, the weight tensor Omega is represented as a smaller 3D grid of circles, and two operator symbols in terracotta color (#b46d59) — a circled-cross (otimes, indicating convolution) and a circled-plus (oplus, indicating bias addition) — are placed between the input, weights, and output to denote the two arithmetic steps. Dark slate (#424b4f) arrows connect the input volume to the weight tensor and from there to the output volume, showing the flow of computation; additional terracotta triangle-tipped arrows indicate the direction of individual connections between feature channels. This figure demonstrates how a 1D convolution with multiple input and output channels operates as a weighted linear combination across channel and spatial dimensions, extending the single-channel 1D convolution to multi-channel feature maps.

**Interactions**

- Slider for channel index: step through output channels in H', highlighting the corresponding filter slice in the weights Ω and showing how each input channel of H contributes to that output
- Click an output channel in H': the contributing input-channel slices and matching weight slices in ? highlight together, showing how each output channel aggregates across the input channels.
- Slider for kernel width: vary the convolution kernel size along the Width axis and show how the receptive field span changes in the input H and how the output H' dimensions update accordingly

### 32. `Conv2D`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/Conv2D.png`

**Input prompt**

This figure contains four panels (a, b, c, and d) illustrating 2D convolution by showing the kernel stepping across a 2D input grid to compute successive output values. Each panel presents three 3D-perspective grids side by side — two grids of small circles (the input X and hidden layer H_1) and one grid of square cells (the weights Omega): on the left, the input array X with cells labeled x_ij; in the center, the weight (kernel) array Omega with cells labeled omega_ij; and on the right, the hidden layer H_1 with cells labeled h_ij. Within the input grid, the active input patch involved in the current computation is shaded with solid labels while the remaining cells stay white with faint gray labels, distinguishing the active receptive field from the rest of the array; the weight array Omega is drawn as a grid of square cells (not circles), and the currently computed output cell in H_1 is highlighted the same way. In panels (c) and (d), explicit 0 entries appear outside the input border, showing the zero padding used when the kernel overlaps the array edge. A terracotta circled-cross (otimes) between the input and weight grids denotes the element-wise multiplication, and a terracotta circled-plus (oplus) between the weight and output grids denotes the summation that accumulates the dot product. Across the four panels, the shaded highlighted region shifts to different positions within the input, and correspondingly a different output cell h_ij is computed, showing the sliding-window nature of the convolution. This figure demonstrates how a 2D convolutional layer systematically applies a fixed kernel at each spatial position of a 2D feature map to produce one scalar output per position.

**Interactions**

- Drag the kernel window across the input grid: animate the 3×3 filter sliding from one position to the next over the x_ij input cells, highlighting the active receptive field and updating the corresponding h_ij output cell in real time
- Click on an output cell h_ij: highlight the matching 3×3 patch of x_ij inputs and display the element-wise products x_ij × ω_ij summed to produce that output value
- Slider for stride: change the step size between kernel positions and show how the number of output cells h_ij changes and which input elements are skipped

### 33. `ConvAlex`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/ConvAlex.png`

**Input prompt**

This figure illustrates the AlexNet convolutional neural network architecture using a 3D volume diagram viewed in perspective. A left-to-right flow begins with a sheared input photograph representing the 224×224×3 input image, followed by a sequence of three-dimensional feature map volumes rendered as parallelogram-faced blocks in light teal (#d3edeb) for the main face and darker teal (#a0d9d3) for the depth layers, while orange (#d18362) and dark orange (#773c23) parallelogram blocks represent convolutional filter kernels applied at each stage. The feature map volumes progressively shrink in spatial resolution while increasing in depth, with labeled dimensions 55×55×96, 27×27×256, and 13×13×384 corresponding to the first three convolutional stages of AlexNet. Ellipsis (…) markers appear within the teal volume stacks to indicate that only a representative subset of the channels is depicted. A “Conv 5×5” annotation above one inter-stage region identifies the kernel size of one convolution, and black arrows with arrowheads indicate the forward data flow between stages. This figure introduces the AlexNet architecture, showing how successive convolution and pooling operations reduce spatial resolution while extracting increasingly abstract feature representations.

**Interactions**

- Animate data flow: sequentially highlight each 3D tensor block from input 224×224×3 through 55×55×96 and 27×27×256 to 13×13×384, displaying the spatial dimensions shrinking and channel depth growing at each conv/pool step
- Slider for layer index (1–3): select a convolutional stage, highlight its tensor block, and show an overlay with the Conv 5×5 kernel size and the resulting feature map dimensions
- Toggle receptive-field overlay: a selected activation in each later tensor highlights the input patch and previous-layer region that produced it, showing how spatial extent grows as resolution shrinks.

### 34. `DiffusionUNet`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/DiffusionUNet.png`

**Input prompt**

This figure illustrates the U-Net architecture used as the noise-prediction backbone in a diffusion model. The diagram is organized as an encoder-decoder structure: the left side progressively downsamples a noisy 256×256×3 input image through orange/brown feature-map volumes with labeled resolutions 256×256×128, 128×128×128, 64×64×256, 32×32×256, 16×16×512, and 8×8×512; the right side mirrors this process by progressively upsampling through matching orange/brown feature-map volumes back toward the output image. Long horizontal arrows labeled “Concatenate” connect encoder features to decoder features at matching spatial scales, showing the U-Net skip connections. A circled timestep variable t at the lower left feeds into a time-embedding path along the bottom, with arrows injecting the time embedding into multiple residual blocks throughout the network. The legend indicates two processing types: a plain residual block and a residual block with self-attention. This figure shows how a diffusion U-Net combines multiscale encoder-decoder features, skip connections, residual processing, self-attention at selected scales, and timestep conditioning to predict denoising updates.

**Interactions**

- Animate the encoder-decoder pass: step from the noisy 256×256×3 input down through each smaller resolution to the 8×8×512 bottleneck, then back up through the decoder, pulsing each Concatenate skip connection when its encoder feature is reused
- Slider for timestep t: vary the diffusion timestep and trace the time-embedding path from the circled t node into the residual blocks across the encoder and decoder
- Toggle block type highlighting: distinguish plain residual blocks from residual blocks with self-attention using the legend’s arrow styles, and show where self-attention is applied in the U-Net

### 35. `GanDCGANArch`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/GanDCGANArch.png`

**Input prompt**

This figure shows the complete DCGAN (Deep Convolutional Generative Adversarial Network) architecture as two mirrored pipelines labeled Generator (left) and Discriminator (right), each spanning one half of the figure and delineated by underbrace annotations. The Generator begins with a 100×1 latent variable z, passes it through a “Project and reshape” step to produce a 4×4×1024 feature volume, and then applies a series of fractional (transposed) convolutions with arctan activations that progressively upsample through 8×8×512, 16×16×256, 32×32×128, and finally a 64×64×3 output image. The Discriminator receives either a real image x or a generated image x*, starting at 64×64×3, and uses strided convolutions to downsample through 32×32×128, 16×16×256, 8×8×512, 4×4×1024, before a 4×4 convolution collapses the spatial dimensions to a 1×1 scalar that is passed through a sigmoid activation to produce the probability Pr(real). All feature volumes are rendered as three-dimensional orange-shaded parallelogram blocks, with black arrows indicating data flow. This figure introduces the DCGAN architecture, which replaces fully connected hidden layers with purely convolutional operations to produce and evaluate photorealistic images.

**Interactions**

- Animate the generator forward pass: trace the latent variable z (100×1 noise vector) through Project and reshape, then through fractional convolution stages watching the tensor grow from 4×4×1024 to 8×8×512 to 16×16×256 to 32×32×128 to the final 64×64×3 output image
- Animate the discriminator forward pass: trace a real or generated image x through strided convolution stages from 64×64×3 down to 4×4×1024, then to the 1×1 output and through sigmoid to Pr(real)

### 36. `GanStyleGANArch`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/GanStyleGANArch.png`

**Input prompt**

This figure illustrates the StyleGAN architecture, organized into three labeled vertical columns: the main generative pipeline (center), the noise injection branch (left of center), and the style branch (right). In the style branch, a latent variable z (1×1×512) is passed through a fully connected network to produce an intermediate variable w (1×1×512), which then feeds three separate linear transforms (each outputting 2×1×512) to generate style vectors y₁, y₂, y₃ that apply per-channel scale and offset adjustments at successive resolution levels of the generator. The main generative pipeline begins with a learned constant input (4×4×512) and passes through convolutional blocks that double in spatial resolution from 4×4×512 to 8×8×512, with each block receiving the corresponding style injection. The noise branch contributes three additive perturbations (z₁⊗ψ₁, z₂⊗ψ₂, z₃⊗ψ₃) from thin 4×4×1 or 8×8×1 noise volumes, each scaled and broadcast across all channels to introduce stochastic spatial variation at different resolutions. Underbrace labels at the bottom group the three columns under the headings Main generative pipeline, Noise, and Style. This figure demonstrates how StyleGAN separates high-level content from fine-grained stochastic detail by injecting global style information through adaptive normalization and local noise directly into the feature maps at each scale.

**Interactions**

- Animate the main generative pipeline: trace latent z through the fully connected mapping network to intermediate variable w, then through three linear transforms producing styles y1, y2, y3, and show each style's per-channel scale and offset being applied at the 4×4, 8×8 synthesis blocks
- Slider for noise scale ψ: adjust the noise injection weight and show how the noise terms z1⊗ψ1, z2⊗ψ2, z3⊗ψ3 change magnitude at each resolution level, with the affected channels in the synthesis blocks highlighted

### 37. `GraphAdjoint`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/GraphAdjoint.png`

**Input prompt**

This figure illustrates the step-by-step construction of the line graph (also called the edge graph or adjoint graph) of an undirected graph, presented in three labeled sub-panels (a, b, c). Panel a), titled ‘Original graph’, shows a 6-node undirected graph whose nodes are filled orange-colored circles labeled 1 through 6, connected by thin black undirected edges. Panel b) shows the intermediate transformation step, annotated with the instruction ‘Add new node at each original edge’: a new teal circle is placed at the position of each edge of the original graph, with the original 6 nodes still visible. Panel c), titled ‘Edge graph’, shows the resulting line graph, in which each new node is labeled by the pair of original endpoint nodes it represents (e.g., ‘2/3’, ‘1/4’, ‘4/6’, ‘1/6’, ‘4/5’, ‘2/5’, ‘1/3’), and the annotation ‘Connect new nodes if original edges shared node’ explains the rule for drawing new edges between them. All graph nodes across panels use the same teal fill color (#a0d9d3) and thin black outlines, while edges are drawn as plain black lines without arrowheads. This figure introduces the adjoint or line graph transformation, in which each edge of the original graph becomes a node in the new graph, a construct used in edge-centric graph neural network architectures.

**Interactions**

- Animate the adjoint graph construction step by step: first place a new node at each original edge, then draw edges between new nodes whenever the corresponding original edges shared a node
- Click an edge in the original graph to highlight the corresponding node in the edge graph and show the shared-node connections it generates
- Toggle between the Original graph and Edge graph panels to compare the structure before and after the adjoint transformation

### 38. `GraphNodeEdgeAdjacency`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/GraphNodeEdgeAdjacency.png`

**Input prompt**

This figure contains four sub-panels (a through d) showing the different matrix representations used to encode a graph for graph neural networks. Panel a) depicts a 6-node undirected graph with nodes labeled 1 through 6, connected by edges whose identities are marked by the pair of endpoint node labels (e.g., ‘1\3’, ‘1\4’, ‘2\3’, ‘3\4’, ‘3\6’, ‘4\5’, ‘5\6’). Panel b) shows the adjacency matrix A (N × N), a square binary matrix encoding which pairs of nodes are connected by edges. Panel c) shows the node feature matrix X (D × N), in which each column stores the D-dimensional feature vector associated with one of the N nodes. Panel d) shows the edge feature matrix E (Dᴷ × E), in which each column stores the Dᴷ-dimensional feature vector associated with one of the E edges, with edges ordered to match the labeled pairs in panel a). Labels for each matrix include its name, symbol, and dimensions. This figure introduces the three standard data structures—adjacency matrix, node feature matrix, and edge feature matrix—that together fully represent a graph with node and edge attributes in a deep learning context.

**Interactions**

- Click a node (1–6) in the graph diagram to highlight its row and column in the adjacency matrix A and its column in the node data matrix X
- Click an edge between two nodes to highlight the corresponding entry in the edge data matrix E and the two nodes it connects
- Toggle between panels a–d to compare the visual graph, the N×N adjacency matrix, the D×N node data, and the D_E×E edge data representations

### 39. `LossLogisticSigmoid`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/LossLogisticSigmoid.png`

**Input prompt**

This figure shows the logistic sigmoid function sig[z] plotted as a single smooth curve over the range z ∈ [−5, 5]. The horizontal axis is labeled z with tick marks at −5.0, 0.0, and 5.0, and the vertical axis is labeled sig[z] with tick marks at 0.0 and 1.0. A smooth orange S-shaped curve rises monotonically from near zero on the left to near one on the right, with its steepest slope occurring at z = 0 where the function equals exactly 0.5. Gray dashed lines indicate the horizontal asymptote at sig[z] = 1.0 and mark a vertical reference at z = 0, emphasizing the function’s symmetry and its asymptotic approach to both bounds. This figure introduces the logistic sigmoid as a differentiable, bounded activation function that squashes any real-valued input into the interval (0, 1), motivating its use for modeling probabilities in binary classification.

**Interactions**

- Drag a point along the sigmoid curve to display the exact coordinate pair (z, sig[z]) at that position
- Slider for a probability threshold: draw a horizontal line at the chosen value and mark the corresponding z intercept where the sigmoid crosses it

### 40. `PerfSmoothness`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/PerfSmoothness.png`

**Input prompt**

This figure contains six panels (a through f) arranged in a 3×2 grid, each showing the scalar output y of a trained shallow one-hidden-layer neural network as a function of a scalar input x ∈ [0, 1]. The panels correspond to networks with increasing numbers of hidden units — 6, 7, 8, 10, and 50, plus one additional configuration — with each panel’s title indicating the hidden unit count. Each panel has a horizontal axis labeled “Input, x” and a vertical axis labeled “Output, y”; the y-axis range spans approximately [0, 1] or [−1, 1] depending on the panel. With more hidden units the output function is relatively simple and smooth, while as the hidden unit count decreases the function develops more oscillations and finer local structure. This figure illustrates how the capacity of a shallow neural network — and hence the complexity and expressiveness of the functions it can represent — scales with the number of hidden units.

**Interactions**

- Slider for number of hidden units (6 → 7 → 8 → 10 → 50): animate the fitted regression curve transitioning between panels, showing how the function becomes smoother and more detailed as capacity increases
- Click a panel (a–f) to zoom in on that specific hidden unit count and compare the fit against the data points
- Toggle between an underfitting panel (6 hidden units) and an overfit panel (50 hidden units) to contrast rough versus overly smooth approximations

### 41. `ReinforceMDPLoop`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/ReinforceMDPLoop.png`

**Input prompt**

This figure shows the agent–environment interaction loop in reinforcement learning, depicted as a closed directed cycle between two rounded rectangular boxes filled with light teal. The upper box is labeled “Agent” with the policy π[a_t | s_t] inscribed inside, and the lower, larger box is labeled “Environment” with the state transition probability Pr(s_{t+1} | s_t, a_t) inscribed inside. Orange arrows with arrowheads form the loop: one arrow routes from the Agent box rightward and downward into the Environment box, carrying the action a_t; a second arrow returns from the Environment to the Agent carrying the current state s_t, while a third routes the next state s_{t+1} back around; additional arrow paths carry rewards r_t and r_{t+1}, and a label identifies the reward function Pr(r_{t+1} | s_t, a_t). Small white-background rectangles along the arrow paths isolate variable labels — State, Action, and Reward — for readability. This figure introduces the Markov Decision Process (MDP) framework at the core of reinforcement learning, showing how the agent observes a state, selects an action according to its policy, and receives a reward and next state from the environment in a repeating closed loop.

**Interactions**

- Animate one full MDP time step: sequentially highlight state s_t leaving the Environment → entering the Agent → action a_t flowing back → reward r_{t+1} and next state s_{t+1} returned from the Environment
- Click the Agent box to highlight the policy π[a_t|s_t] and the action arrow a_t pointing toward the environment
- Click the Environment box to highlight both the state transition Pr(s_{t+1}|s_t,a_t) and the reward function Pr(r_{t+1}|s_t,a_t) labels

### 42. `ResidualNormTypes`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/ResidualNormTypes.png`

**Input prompt**

This figure contains five panels (a–e), each depicting a different normalization method using a 3D cube diagram with three labeled axes: position (spatial dimensions), batch index, and channel. Within each cube, orange-shaded regions indicate the set of activations that are jointly normalized together (i.e., the cells over which mean and variance statistics are computed), while gray regions indicate un-normalized cells. Panel (a) shows BatchNorm, where one horizontal slab spanning all batch instances and all spatial positions within a single channel is highlighted, reflecting normalization across the batch and spatial dimensions per channel. Panel (b) shows GhostNorm, where a region covering all batch instances and all channels but not spatial position is highlighted. Panel (c) shows LayerNorm, where all channels and spatial positions within a single batch instance are highlighted, reflecting per-sample normalization across all features. Panel (d) shows GroupNorm, where a subset of channels at all spatial positions within one batch instance is highlighted, reflecting normalization over a fixed group of channels per sample. Panel (e) shows InstanceNorm, where all spatial positions for a single channel within a single batch instance are highlighted, reflecting per-channel per-sample spatial normalization. This figure introduces and contrasts the major normalization strategies used in deep networks, illustrating how they differ in which axes they aggregate statistics over.

**Interactions**

- Select a normalization type: click BatchNorm, GhostNorm, LayerNorm, GroupNorm, or InstanceNorm to highlight the orange cells that share one mean and variance estimate, while gray cells remain excluded from the statistic
- Animate statistic aggregation: sweep across the highlighted region in the selected cube and show which axes are being pooled over — position, batch index, channel, or a subset of channels — before applying normalization to those activations
- Compare normalization scopes: toggle between the five panels to see how BatchNorm pools across batch and position per channel, GhostNorm uses a restricted batch grouping, LayerNorm pools all features within one sample, GroupNorm pools a channel group within one sample, and InstanceNorm pools spatial positions for one channel within one sample

### 43. `ResidualResnet2`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/ResidualResnet2.png`

**Input prompt**

This figure illustrates the architecture of a deep residual network (ResNet) at two levels of detail. The main diagram traces the flow of feature tensors through successive stages of the network, with labeled spatial and channel dimensions at each stage: a 7x7 convolution produces 112x112x64 feature maps, which are then processed through four residual stages yielding progressively smaller but deeper tensors — 56x56x256, 28x28x512, 14x14x1024, and 7x7x2048 — before a final average pooling and fully connected (AvgPool + FC) layer. Between stages, Subsample blocks reduce spatial resolution while increasing channel depth; within each stage, repeated ResBlocks (indicated by ellipses and annotations such as '24 blocks total' and '36 blocks total') apply the same transformation many times. An inset zooms into the internal structure of a single ResBlock, showing the sequence: Conv 1x1 (bottleneck squeeze), Batch Normalization (BN), ReLU, Conv 3x3 (spatial convolution), BN, ReLU, and Conv 1x1 (channel expansion), with a skip connection bypassing these layers and adding the input directly to the output. The figure introduces the residual (skip-connection) design that allows very deep networks to be trained effectively by ensuring gradients can flow directly from later to earlier layers.

**Interactions**

- Animate the residual block forward pass: trace the signal through the main path and simultaneously along the parallel 1×1 skip connection, then show the element-wise addition (⊕) combining both paths at the block output
- Slider for ResNet depth (24 blocks / 36 blocks): update the number of residual blocks shown per stage and the total block-count label, while the tensor dimensions at each stage (112×112×64 through 7×7×2048) remain constant
- Click on a stage's tensor block: zoom in to display the bottleneck detail with Conv 1×1 channel compression, Conv 3×3 spatial processing, and Conv 1×1 expansion, with the specific channel counts (e.g., 64 bottleneck, 256 output) labeled for that stage

### 44. `ShallowHyperplanes`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/ShallowHyperplanes.png`

**Input prompt**

This figure illustrates how individual neurons in a shallow neural network define hyperplane decision boundaries in input spaces of increasing dimension, across three side-by-side panels labeled a), b), and c). Panel a) shows a one-dimensional input space with a horizontal number line labeled x_1 and a single point (the origin dot) marking where the linear threshold function crosses zero, representing a hyperplane as a point in 1D. Panel b) shows a two-dimensional input space with axes x_1 and x_2 and two colored lines passing through the origin: a vertical teal line and a horizontal orange-terracotta line, each representing a separate hyperplane boundary that divides the 2D plane into two half-spaces. Panel c) shows a three-dimensional input space with axes x_1, x_2, and x_3, rendered as a perspective cube with a light gray front face and teal side face, where the flat face of the cube represents a plane slicing through 3D space — the hyperplane in 3D. The figure demonstrates how the linear pre-activation of a neuron defines a hyperplane that separates input space into two regions, with the dimensionality of the hyperplane being one less than the input dimensionality.

**Interactions**

- Slider for weight w: tilt the orientation of a selected hyperplane by adjusting one weight component and watch the shaded positive/negative classification regions update in the plot
- Drag an input point (x1, x2, x3): move the point through the 3D feature space and show which side of each neuron's hyperplane it falls on, with the final output class updating to reflect the combined decisions

### 45. `ShallowNet`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/ShallowNet.png`

**Input prompt**

This figure contains two panels (a and b), each showing a diagram of a shallow neural network with one input node x, three hidden units h_1, h_2, h_3, and one output node y. In panel (b), two bias nodes labeled 1 are present — one feeding the hidden layer and one feeding the output — and the connections from hidden units to the output are labeled with weights φ_1, φ_2, φ_3 plus a bias weight φ_0; a single representative input-to-hidden weight θ_{11} is also labeled to indicate the notation convention. In panel (a), the weight labeling emphasizes the hidden-layer side: the bias connections to each hidden unit carry weights θ_{10}, θ_{20}, θ_{30}, and the connections from input x carry weights θ_{21} and θ_{31}, making the full first-layer parameterization explicit. Arrows in both panels use black and orange coloring to distinguish the input-side (pre-activation) connections from the output-side (post-activation) connections. This figure introduces the standard parameterization of a shallow network, showing how θ weights govern the input-to-hidden linear transformation and φ weights govern the hidden-to-output linear combination.

**Interactions**

- Click a hidden neuron h_i to highlight its incoming weight from x and bias, plus its outgoing contribution to output y, making the weight labels φ_i and θ_ij visible
- Toggle between panels a and b to compare the clean network diagram with the fully labeled weight view showing all φ and θ parameter names
- Slider for number of hidden units: add or remove neurons from the hidden layer while keeping the single input x and output y fixed

### 46. `SupervisedOpt`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/SupervisedOpt.png`

**Input prompt**

This figure contains two panels (a and b) illustrating the supervised learning optimization landscape for a linear model with parameters phi_0 (intercept) and phi_1 (slope). Panel a) shows a colored contour heatmap of the loss function L[phi] over the two-dimensional parameter space, with the x-axis labeled Intercept, phi_0 (ranging from 0 to 2) and the y-axis labeled Slope, phi_1 (ranging from 0 to 4); the colormap transitions from near-white (low loss) through progressively deeper teals — #b4e1dd, #8bd0c9, #4db7aa, #2f7870 — indicating increasing loss, with a visible minimum region shown as the lightest area. Panel b) shows either a complementary view of the data or a second parameterization of the loss, also labeled with Input, x and Output, y axes (each spanning 0 to 2 with tick marks at 0, 1, 2), with a similar teal gradient colormap. The figure demonstrates how the total supervised training loss varies as a function of the model parameters, establishing the geometric landscape that gradient-based optimization must navigate.

**Interactions**

- Drag the current parameter location on the 2D loss surface L[φ] to simultaneously update the fitted line in the data scatter panel, showing intercept φ_0 and slope φ_1 changing together
- Slider for intercept φ_0 (–1 to 2): shift the fitted line up or down in the data panel while the marker moves vertically on the loss surface
- Slider for slope φ_1 (0 to 4): rotate the fitted line in the data panel while the marker moves horizontally on the loss surface

### 47. `SupervisedSurface`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/SupervisedSurface.png`

**Input prompt**

This figure contains two panels, labeled a) and b), each showing a three-dimensional surface plot of the supervised learning loss L[phi] as a function of two model parameters: the slope phi_1 (ranging from approximately -1.0 to 1.0) and the intercept phi_0 (ranging from approximately 0.0 to 2.0), with the vertical loss axis extending from 0 to 70. Panel a) renders the bowl-shaped quadratic loss landscape as a shaded 3D mesh surface, while panel b) shows the corresponding top-down 2D heatmap with contour lines over the same (phi_0, phi_1) plane; three circular markers (one pale gray-white, one light cyan, one teal) mark the same example parameter settings in both panels, and the minimum of the bowl — corresponding to the optimal parameter values — is visible in both views. The surface exhibits the characteristic smooth, convex shape of a least-squares regression loss, with the loss rising steeply as parameters deviate from the optimum in either direction. The figure introduces the loss landscape of a supervised linear model, illustrating that gradient-based optimization reliably converges to the global minimum because the surface has no local minima or saddle points.

**Interactions**

- Sliders for ?0 and ?1: the parameter marker moves on the loss surface and heatmap together while L[?] updates numerically, showing how slope and intercept choices determine training loss.
- Drag the current parameter point on the surface: place (φ0, φ1) at any location on the bowl and trace an animated gradient-descent path of iterative steps descending toward the minimum, displaying the current loss value
- Slider for learning rate: change the step size and animate successive gradient-descent updates on the surface, showing overshooting and oscillation for large rates versus slow convergence for small rates

### 48. `TransformerDecoder`  (2d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/2d/TransformerDecoder.png`

**Input prompt**

This figure illustrates the architecture of an autoregressive transformer decoder, drawn as a horizontal left-to-right pipeline over a sequence of token positions. At the left, a vertical stack of word-embedding vectors represents the input sequence tokens: <start>, It, takes, great, courage, to, and let. These embeddings enter a large block labeled “Transformer with masked attention,” annotated (× K) to indicate K repeated decoder layers. Inside the transformer block, a lower-triangular masked-attention diagram shows that each token position can attend only to itself and earlier positions, preventing access to future tokens during next-token prediction. The block also shows residual/addition nodes and intermediate feature vectors that pass through the repeated masked-attention layers. At the right, each processed token representation feeds into a “Linear + softmax” block, producing a probability distribution over the vocabulary for the corresponding target token. The target-token labels shown on the far right are It, takes, great, courage, to, let, and yourself, illustrating shifted autoregressive training where the model predicts the next token at each position. This figure introduces the decoder-only transformer architecture for sequence generation, emphasizing causal masking and parallel next-token prediction across positions.

**Interactions**

- Slider for K (number of decoder layers): expand the ×K repeated block to show K stacked masked-attention layers, or collapse it back to the compact ×K notation
- Click a processing block (Word embeddings, Transformer with masked attention, residual Add ⊕, Linear + softmax, or Probability of target token) to highlight it and display a tooltip describing its role in next-token prediction
- Animate the prediction of the target word “yourself”: trace the input prefix ending at “let” through the masked-attention block, residual additions, and final Linear + softmax layer to the output probability row labeled “yourself”

### 49. `TransformerSWIN`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/TransformerSWIN.png`

**Input prompt**

This figure shows six panels labeled a) through f) illustrating the hierarchical windowed self-attention partitioning scheme used in the Swin Transformer. Panel a) shows the original photograph as the reference. In the remaining panels the partitions are shown as the photograph cut into slightly separated tiles with thin white gaps between them, each panel drawn with a slight 3D tilt: panels b) and c) show the image divided into 4×4 non-overlapping windows and the same 4×4 grid offset (shifted) by half a window width and height; panels d) and e) show 2×2 windows and their offset variant; and panel f) shows the degenerate 1×1 case in which the entire image is treated as a single attention region (panel captions read '4×4 windows', '4×4 offset windows', '2×2 windows', '2×2 offset windows', '1×1 window'). The figure demonstrates the Swin Transformer's shifted-window strategy: by alternating between regular and offset window partitions across successive transformer layers, the model enables information to flow across window boundaries without the quadratic cost of global self-attention.

**Interactions**

- Slider for window size (1 → 2 → 4): step through panels f (1×1), d (2×2), and b (4×4), refining the partition grid overlaid on the photograph and increasing the number of attention windows
- Toggle between regular and offset windows: shift the grid by half a window in both x and y (switching between panels b↔c or d↔e) and highlight how tokens that were split across a boundary in the regular grid share a single window in the offset grid
- Click on a window tile: highlight all tokens inside that tile and show the self-attention connections confined to those tokens, contrasting with a neighboring tile to illustrate the locality constraint at that window size

### 50. `VAENonLinearLVM`  (3d)

- **source:** Understanding Deep Learning
- **reference image:** `images/cs/3d/VAENonLinearLVM.png`

**Input prompt**

This figure illustrates the nonlinear latent variable model underlying a variational autoencoder (VAE), using two panels connected by a conceptual annotation. The left panel displays the joint distribution Pr(x, z|phi) in a three-dimensional coordinate system with axes x_1, x_2, and z, where a family of curved colored lines — rendered in multiple colors including red, green, blue, black, olive, magenta, cyan, navy, and maroon — represent the distribution of observed data x = (x_1, x_2) conditioned on each particular value of the scalar latent variable z; each color corresponds to a different z slice, and the nonlinear decoder network phi warps the latent axis into a curved manifold in data space. The right panel displays the marginal distribution Pr(x|phi) in the two-dimensional x_1-x_2 plane, obtained by integrating (marginalizing) over all values of the latent variable z; the same multi-colored curves now appear projected onto 2D, forming a complex non-Gaussian distribution that cannot be expressed in closed form. A label reading 'Marginalize over latent variable, z' with a teal arrow connects the two panels, indicating the mathematical operation that links them. The figure introduces the nonlinear latent variable generative model and motivates the need for variational inference, since the marginalization that links the joint distribution to the observable marginal is intractable.

**Interactions**

- Animate marginalization over z: show the joint distribution surface Pr(x, z|φ) in the x1–x2–z space collapsing along the z axis with a sweeping animation to produce the marginal Pr(x|φ) projected onto the x1–x2 plane
- Drag an input point (x1, x2): highlight the posterior distribution Pr(z|x, φ) for that observation on the z axis and show how the uncertainty in the latent variable z varies across different regions of the x1–x2 plane
- Slider for latent variable z value: move z along its axis and update the displayed slice of the joint distribution Pr(x, z|φ), revealing how the conditional Pr(x|z, φ) shifts position and shape across the x1–x2 plane

---

## math

### 51. `1.1.4`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 1.1.4
- **reference image:** `images/math/2d/1.1.4.png`

**Input prompt**

This figure contains two panels, (a) and (b), illustrating the limiting definition of a tangent line. Panel (a): a smooth curve in the xy-plane with a fixed point P and a moveable point Q marked on the curve; multiple pink secant lines through P fan outward, converging toward a limiting position labeled Tangent line, with arrows indicating the rotational approach to the limit. Panel (b): the same construction applied to a circle, showing P and Q on the circle with multiple secant lines rotating toward the tangent line at P. The figure establishes the general definition of a tangent line as the limiting position of secant lines as Q approaches P along the curve, and confirms that this definition agrees with the classical tangent to a circle.

**Interactions**

- Drag point Q along the curve toward fixed point P and watch the secant line rotate to become the tangent line, with the slope value updating in real time
- Toggle between panels (a) and (b) to compare the tangent-as-limit concept on a smooth open curve versus a circle
- Drag point P to a new position on the curve and observe how the tangent line direction changes

### 52. `1.1.7`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 1.1.7
- **reference image:** `images/math/2d/1.1.7.png`

**Input prompt**

This figure contains three panels, (a), (b), and (c), illustrating the approximation of the area under a curve by inscribed rectangles. Panel (a): a smooth curve over the interval [a, b] with the entire region between the curve and the x-axis shaded. Panel (b): the same curve with a small number of wide rectangles inscribed under it, giving a coarse Riemann sum approximation. Panel (c): the same curve with many narrow rectangles filling most of the gap, giving a much closer approximation to the true area. The figure introduces the Riemann sum approach to defining the definite integral as the limit of rectangular area approximations as the number of rectangles increases without bound.

**Interactions**

- Slider for number of rectangles n: watch the bars refine from coarse (panel b) to fine (panel c) and display the running Riemann sum value
- Toggle the three panels into a single animated view to eliminate side-by-side comparison

### 53. `1.6.1`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 1.6.1
- **reference image:** `images/math/2d/1.6.1.png`

**Input prompt**

This figure shows the unit circle with a fixed angle c and a variable angle x measured from the positive horizontal axis, illustrating the continuity of the sine and cosine functions. Point Q(cos c, sin c) is marked in blue at angle c, and point P(cos x, sin x) is marked in red at angle x; an arrow indicates that P moves toward Q as x approaches c. A caption box at the bottom reads: As x approaches c the point P approaches the point Q. The figure provides a geometric motivation for the limits lim_{x->c} sin x = sin c and lim_{x->c} cos x = cos c, establishing that sin and cos are continuous at every point c.

**Interactions**

- Slider for angle x: animate point P along the unit circle toward fixed point Q(cos c, sin c) and watch the shaded sector shrink, illustrating the squeeze theorem setup
- Slider for target angle c: relocate Q and see the sector, radii, and coordinate labels update accordingly
- Animate x approaching c from both sides to show the two-sided limit behavior

### 54. `1.6.4`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 1.6.4
- **reference image:** `images/math/2d/1.6.4.png`

**Input prompt**

This figure illustrates the geometric inequality used to prove that lim_{x->0} sin x / x = 1 via the Squeezing Theorem. On the left, the unit circle is drawn with three labeled points: (1, 0) on the x-axis, (cos x, sin x) on the circle, and (1, tan x) on the vertical tangent at x = 1, with angle x at the origin and the base labeled 1. On the right, three geometric shapes compare areas side-by-side: a large right triangle with height tan x (area tan x / 2), a circular sector of angle x (area x / 2), and a small right triangle with height sin x (area sin x / 2), with the inequalities Area of triangle >= Area of sector >= Area of triangle written below. The figure establishes the sandwiching inequality tan x / 2 >= x / 2 >= sin x / 2 that, after dividing by sin x / 2, yields cos x <= sin x / x <= 1 / cos x, enabling the Squeezing Theorem to conclude the limit equals 1.

**Interactions**

- Slider for angle x (0 to π/2): update the unit circle diagram and all three geometric shapes (outer triangle, sector, inner triangle) simultaneously to show how the two triangles bound the sector as x varies
- Toggle to overlay all three area comparisons onto a single panel, replacing the three static side-by-side diagrams
- Click each panel label (Area of triangle, Area of sector) to highlight the corresponding region and display its formula

### 55. `14.1.3`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.1.3
- **reference image:** `images/math/3d/14.1.3.png`

**Input prompt**

This figure shows a 3D diagram illustrating the Riemann sum approximation used to define the double integral as a volume. A curved surface z = f(x, y) is shown in xyz-space above a region in the xy-plane; the base is gridded to represent a partition into subrectangles. A single representative rectangular parallelepiped is highlighted in orange: its base is a subrectangle with area Delta_Ak and sampling point (x*_k, y*_k) labeled, and its height is f(x*_k, y*_k), giving volume f(x*_k, y*_k) Delta_Ak. Annotations label Height f(x*_k, y*_k), Volume f(x*_k, y*_k) Delta_Ak, and Area Delta_Ak. The figure introduces the double integral as the limit of a Riemann sum of such parallelepiped volumes over all subrectangles as the partition is refined.

**Interactions**

- equation input for f(x, y): one field pre-filled with a simple function (e.g. "2 - x*x - y*y"); learner edits it and the 3D surface z=f(x,y) redraws, the column height f(xk*,yk*) updates, and the displayed volume estimate f(xk*,yk*)·ΔAk refreshes — shows directly how the integrand determines the height of every approximating column
- drag the sample point (xk*, yk*) across the base region to move the column and read off f(xk*, yk*) at that location

### 56. `14.2.10`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.2.10
- **reference image:** `images/math/3d/14.2.10.png`

**Input prompt**

This figure is part of a worked example asking to find the volume of the tetrahedron bounded by the coordinate planes and the plane z = 4 - 4x - 2y using a double integral. The figure contains two linked diagrams. Left: a 3D perspective showing the tetrahedron in xyz-space with vertices at (0, 0, 4), (1, 0, 0), and (0, 2, 0), bounded above by the plane z = 4 - 4x - 2y (labeled on the slanted face) with the base region R labeled. Right (inset): the 2D base region R in the xy-plane, a right triangle with vertices at (0, 0), (1, 0), and (0, 2), bounded by the x-axis, y-axis, and the line y = 2 - 2x; a red vertical strip illustrates the inner integration limits from y = 0 to y = 2 - 2x. An arrow connects the two diagrams. The figure establishes the correspondence between the 3D tetrahedron and the triangular base R over which the iterated double integral is set up.

**Interactions**

- Drag the red vertical integration strip in the 2D base panel and watch the corresponding cross-section highlight on the 3D plane z=4-4x-2y update in real time
- Slider for the slicing-plane height: the triangular cross-section expands or contracts inside the tetrahedron while its vertices stay on the edges, showing how bounds of integration change with the plane.
- Toggle between the 3D and 2D panels to trace how the triangular integration region R projects onto the xy-plane

### 57. `14.2.9`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.2.9
- **reference image:** `images/math/2d/14.2.9.png`

**Input prompt**

This figure is part of a worked example asking to evaluate the double integral of (2x - y^2) over the triangular region R enclosed between y = -x + 1, y = x + 1, and y = 3. The figure shows the triangular region R in the xy-plane with vertices at (-2, 3), (0, 1), and (2, 3); the bounding lines y = 3 (top), y = -x + 1 (lower left), and y = x + 1 (lower right) are labeled. The y-axis divides R into two sub-regions: R1 (shaded blue, left half) and R2 (shaded yellow, right half), each with a red vertical strip indicating the direction of inner integration. The figure illustrates the decomposition of R into two type-I sub-regions required when the lower boundary changes expression across the y-axis.

**Interactions**

- equation_input for the two lower boundary equations: two fields pre-filled with "-x + 1" (left, for R1) and "x + 1" (right, for R2); when the learner edits either, the corresponding boundary line redraws, the shaded sub-regions R1 and R2 update, and the inner integral limits display — shows directly how the lower boundary formula changing expression at x=0 is what forces the decomposition into two sub-integrals

### 58. `14.3.10`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.3.10
- **reference image:** `images/math/2d/14.3.10.png`

**Input prompt**

This figure is part of a worked example asking to evaluate the polar double integral of sin theta over the region R in the first quadrant outside the circle r = 2 and inside the cardioid r = 2(1 + cos theta). The figure shows both curves in polar coordinates: the circle r = 2 (blue) centered at the origin and the cardioid r = 2(1 + cos theta) (purple), which extends further to the right. The shaded region R (light blue) lies in the first quadrant between theta = 0 and theta = pi/2, bounded on the inside by the circle and on the outside by the cardioid; a red radial line at an intermediate angle shows a representative radial strip. The figure establishes the geometry of the integration region R needed to set up the polar iterated integral with inner limits from r = 2 to r = 2(1 + cos theta) and outer limits from theta = 0 to theta = pi/2.

**Interactions**

- equation input for the cardioid boundary: one field pre-filled with "2*(1+cos(theta))"; learner edits r=f(θ) and the curve redraws alongside the fixed circle r=2, the shaded integration region updates, and the intersection angle recomputes — shows how the curve formula determines where the two boundaries meet and the size of the region
- slider for θ from 0 to π/2: sweep the radial line tracing the boundary between the two curves and shading the enclosed region

### 59. `14.3.3`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.3.3
- **reference image:** `images/math/2d/14.3.3.png`

**Input prompt**

This figure shows a polar rectangle R, the fundamental building block for polar double integration. The region R is bounded by two circular arcs r = 1.5 and r = 2 (solid blue curves) and two rays theta = pi/6 and theta = pi/4 (dashed red lines), forming a curved quadrilateral shaded in light blue and labeled R. The figure introduces the polar rectangle as the analogue of the Cartesian rectangle for setting up double integrals in polar coordinates, showing how its curved sides arise from the constant-r and constant-theta boundary conditions.

**Interactions**

- Sliders for r1 and r2 (pre-filled 1.5 and 2): stretch or shrink the two bounding arcs and watch the curved quadrilateral R resize between them while the angular bounds stay fixed
- Sliders for θ1 and θ2 (pre-filled π/6 and π/4): rotate the two bounding rays and watch R sweep through the new angular extent while the radial bounds stay fixed
- Toggle to overlay a straight-sided Cartesian rectangle of the same Δr × Δθ dimensions at the same corner — shows why R is only an "analogue" of a rectangle: two of its sides are curved because r is held constant on a circular arc rather than a straight line

### 60. `14.4.5`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.4.5
- **reference image:** `images/math/3d/14.4.5.png`

**Input prompt**

This figure illustrates how constant-parameter lines in the uv-parameter domain map to curves on a parametric surface in 3D space. Left panel: the uv-plane showing a vertical orange line labeled u constant and a horizontal purple line labeled v constant. Right panel: a smooth curved parametric patch in xyz-space, with a constant u-curve highlighted in orange and a constant v-curve highlighted in purple on the surface; families of such curves form the curvilinear coordinate grid covering the surface. An arrow connects the two panels to indicate the mapping. The figure establishes that fixing one parameter in a parametric surface equation produces a curve on the surface, and that families of u-curves and v-curves together form the natural coordinate grid on a parametric surface.

**Interactions**

- equation input for the parametric surface: three fields for x(u,v), y(u,v), z(u,v) pre-filled with a simple example (e.g. x=u*cos(v), y=u*sin(v), z=u); when the learner edits any component the 3D surface redraws and the constant-u and constant-v grid curves update — shows how the algebraic form of r(u,v) determines the surface geometry and the shape of the parameter curves
- sliders for u and v: sweep the highlighted constant-u (orange) and constant-v (pink) curves across the surface

### 61. `14.6.7`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.6.7
- **reference image:** `images/math/3d/14.6.7.png`

**Input prompt**

This figure shows a spherical wedge in 3D, the volume element used for triple integration in spherical coordinates. The wedge is a small solid (shown with orange, yellow, and green faces) bounded by six surfaces: two spherical shells at radii rho1 and rho2 (marked along the z-axis), two vertical half-planes at azimuthal angles theta1 and theta2 (shown in the horizontal plane near the base), and two cones at polar angles phi1 and phi2 (measured from the z-axis and indicated by arcs). The bounding surfaces are rendered transparently to reveal the wedge's position inside the overall spherical sector. The figure defines the spherical wedge as the three-dimensional analogue of the polar rectangle and identifies its six bounding surfaces in terms of the spherical coordinates rho, theta, and phi.

**Interactions**

- Sliders for ρ₁ and ρ₂: expand or contract the radial bounds of the wedge and watch the volume element resize within the spherical shell
- Sliders for θ₁/θ₂ and φ₁/φ₂: sweep the azimuthal and polar angle bounds and observe the colored wedge element rotate and tilt through the shell
- Sliders for ??, ??, and ??: each spherical-coordinate increment stretches only its corresponding edge of the wedge and updates the volume factor ?? sin ? ?? ?? ??.

### 62. `14.7.5`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 14.7.5
- **reference image:** `images/math/2d/14.7.5.png`

**Input prompt**

This figure illustrates the change-of-variables transformation T for double integrals by showing a rectangular region in parameter space and its curved image in the xy-plane. Left panel: the uv-plane with a rectangular region S bounded by the lines u = u0, u = u0 + Delta_u (vertical) and v = v0, v = v0 + Delta_v (horizontal); the corner (u0, v0) and side lengths Delta_u and Delta_v are labeled. Right panel: the xy-plane with the image region R, a curved quadrilateral resembling a distorted parallelogram; each of the four boundary lines of S maps to a correspondingly labeled curve (Image of u = u0, Image of v = v0, etc.). A large arrow connects the two panels to indicate the transformation. The figure motivates the Jacobian as the factor relating the area of the rectangle S to the area of its curved image R under the transformation.

**Interactions**

- equation input for the transformation: two fields for x(u,v) and y(u,v) pre-filled with a simple example (e.g. x=u*cos(v), y=u*sin(v)); learner edits either formula and the curved region R in the xy-plane redraws in real time while the rectangle S stays fixed — teaches that the Jacobian ∂(x,y)/∂(u,v) measures how much the formula stretches area at each point
- drag the corners of rectangle S in the uv-plane and watch the image region R deform accordingly

### 63. `15.2.12`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 15.2.12
- **reference image:** `images/math/2d/15.2.12.png`

**Input prompt**

This figure is part of a worked example that evaluates the line integral of F = cos(x) i + sin(x) j along two different oriented curves. The figure contains two panels (a) and (b), each showing the same vector field F drawn over a green-shaded background with the note Vectors not to scale. Panel (a): the oriented curve C is a short vertical red line segment at x = -pi/2, directed downards from y = 2 to y = 1. Panel (b): the oriented curve C is a parabolic arc from (-1, 1) to (2, 4), directed first down, then upward and to the right. The figure shows the two distinct integration paths for parts (a) and (b) of the example, making visible how each curve's geometry and alignment relative to the field vectors determines the computed line integral. Note that the two parts of the image are differently scaled.

**Interactions**

- Drag the endpoints of curve C to reshape the integration path through the vector field and watch the line integral value update in real time
- Toggle between the two panels (short vertical path vs. long curved path) to compare how path shape and length affect the line integral value over the same field
- Slider for parameter t: animate a moving point along C and display the field vector and its dot product with the tangent at each step

### 64. `15.2.2`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 15.2.2
- **reference image:** `images/math/2d/15.2.2.png`

**Input prompt**

This figure illustrates the partition construction used to define the line integral of a scalar function along a curve in 3D space. On the left, a curve from P = P0 to Q = Pn is divided into n arcs by partition points P1, P2, P3, ..., Pn-1, with the kth arc of length Delta_sk and mass Delta_Mk highlighted and a zoom arrow pointing to the right. On the right, the kth arc is isolated, spanning from P_{k-1} to Pk, with arc length Delta_sk labeled and the sampling point P*_k(x*_k, y*_k, z*_k) shown as a red dot on the arc. A formula box at the bottom reads Delta_Mk approx f(x*_k, y*_k, z*_k) Delta_sk. The figure introduces the Riemann sum approximation for the line integral by showing how the mass of each arc segment is approximated using the density value at a chosen sample point.

**Interactions**

- Slider for number of partition segments n: increase n and watch the sample points multiply along the curve, with the Riemann sum ΣΔMₖ converging to the true line integral
- Drag the zoom inset sample point Pₖ* within its arc segment to show that any choice of sample point within the segment yields an approximation to ΔMₖ

### 65. `15.2.7`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 15.2.7
- **reference image:** `images/math/3d/15.2.7.png`

**Input prompt**

This figure is part of a worked example asking to evaluate the line integral of (xy + z^3) ds from (1, 0, 0) to (-1, 0, pi) along a helix. The figure shows a 3D rectangular bounding box with x ranging from -1 to 1, y from -1 to 1, and z from 0 to pi. A single helical curve C spirals inside the box from the labeled starting point (1, 0, 0) at the bottom to the endpoint (-1, 0, pi) at the top, with a directional arrow indicating the orientation of traversal. The figure shows the geometry of the helix C in xyz-space, establishing the path and its orientation for setting up the arc-length line integral using the parametric equations x = cos t, y = sin t, z = t for t in [0, pi].

**Interactions**

- Slider for parameter t (0 to π): animate a point tracing along the 3D curve from (1, 0, 0) to (-1, 0, π), displaying the current coordinates and arc-length increment in real time
- Slider for sample point along the helix: the current t, coordinates, integrand value, and local ds segment highlight together, connecting the path geometry to the line-integral sum.

### 66. `15.4.5`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 15.4.5
- **reference image:** `images/math/2d/15.4.5.png`

**Input prompt**

This figure contains two panels, (a) and (b), illustrating the extension of Green's Theorem to a multiply connected region with one hole. Panel (a): a blob-shaped region R with a hole; the outer boundary C1 is oriented counterclockwise and the inner boundary C2 surrounding the hole is oriented clockwise, illustrating the positive orientation convention for a multiply connected region. Panel (b): the same region with two horizontal cuts introduced, dividing R into two simply connected sub-regions R' and R''; arrows along the cuts show the opposing orientations (right-pointing on one side, left-pointing on the other) which cancel in the sum, while C1 and C2 retain their original orientations. The figure shows how introducing cuts reduces a multiply connected region to simply connected parts, allowing Green's Theorem to be applied to each piece separately and then combined to give the extended result.

**Interactions**

- Drag the inner hole boundary C₂ to resize or reposition it, and watch the region R, orientation arrows, and cut in panel (b) update accordingly
- Toggle between panels (a) and (b) to animate the introduction of the cut, showing how it converts the doubly-connected region into two simply-connected sub-regions R' and R''

### 67. `15.6.9`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 15.6.9
- **reference image:** `images/math/3d/15.6.9.png`

**Input prompt**

This figure shows a single curved surface patch sigma_k in 3D space, illustrating the geometric meaning of the integrand in the surface flux integral. The patch sigma_k is depicted as a curved tile (teal) with its area labeled Delta_Sk; a unit normal vector n (purple arrow, pointing upward) is drawn at the center of the patch, and black arrows along the sides indicate the direction of fluid flow passing through the surface. A caption box connected to the patch reads: The volume of fluid crossing sigma_k in the direction of n per unit of time. The figure illustrates that the quantity F(x*_k, y*_k, z*_k) dot n(x*_k, y*_k, z*_k) Delta_Sk approximates the volume of fluid passing through the patch in the normal direction per unit time, motivating the Riemann sum definition of the flux integral.

**Interactions**

- Drag the surface patch σₖ to different locations on the full surface and watch the outward normal vector n reorient and the patch area ΔSₖ update
- Slider for flow velocity magnitude: show how the volume of fluid crossing the patch in the direction of n per unit time scales proportionally

### 68. `15.8.6`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 15.8.6
- **reference image:** `images/math/3d/15.8.6.png`

**Input prompt**

This figure shows a physical analogy for the curl of a vector field at a point. At the center is a labeled point P0, around which concentric dashed blue arcs indicate a circular fluid flow pattern. Four paddle-like rectangular surfaces (salmon-colored) radiate outward from P0 like propeller blades. A vertical spindle passes through P0, and the vector Curl F(P0) labels an upward arrow along the spindle, with a curved arrow showing the direction of rotation. The figure provides the physical interpretation that a small paddle wheel immersed in the fluid at P0 rotates most rapidly when its spindle is aligned with curl F(P0), establishing the connection between the curl vector and the direction of maximum circulation density.

**Interactions**

- Drag point P₀ to a new location and display the updated Curl F(P₀) vector, showing how curl magnitude and direction vary across the field
- Slider for rotation rate: animate the paddle-wheel spinning and show how the curl vector magnitude corresponds to the angular speed of rotation
- Slider for local field strength: the paddle-wheel spin indicator and curl vector length update together, showing how stronger circulation produces a larger curl magnitude.

### 69. `5.2.17`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.2.17
- **reference image:** `images/math/3d/5.2.17.png`

**Input prompt**

This figure is part of a worked example asking to find the volume of the solid generated when the region under y = x^2 over [0, 2] is rotated about the line y = -1. The figure contains two linked views. Left (2D): the xy-plane showing the region R bounded above by the parabola y = x^2 and below by the x-axis between x = 0 and x = 2; the axis of revolution y = -1 is drawn as a horizontal red line, with a rotation arrow indicating revolution about it, and a representative washer cross-section at position x is sketched in gray. Right (3D): the resulting solid of revolution shown in perspective, with a visible central hole (from the inner radius of 1) and the parabolic outer surface. The figure illustrates the washer method: at each x, the cross-section is a washer with outer radius x^2 + 1 and inner radius 1, giving area pi((x^2 + 1)^2 - 1^2) = pi(x^4 + 2x^2), and the volume is computed by integrating this expression from 0 to 2.

**Interactions**

- equation_input for the generating curve and axis: one field pre-filled with "x^2" for f(x) and one field pre-filled with "-1" for the axis of rotation y=c; learner edits either and the 2D region R redraws, the washer cross-section updates (outer radius = f(x)-c, inner radius = 0-c), and the 3D solid reshapes — shows how the function and axis together determine the washer dimensions at every x
- slider for x in [0, 2]: sweep the washer cross-section along the axis and display outer radius, inner radius, and washer area π(R²-r²) at that position

### 70. `5.2.6`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.2.6
- **reference image:** `images/math/3d/5.2.6.png`

**Input prompt**

This figure illustrates the slicing method for computing the volume of a solid of known cross-sectional area. Left panel: a solid S extending along the x-axis from x = a to x = b, divided into n slabs S1, S2, ..., Sn by partition points a = x0, x1, ..., x_{n-1}, b = xn marked along the base axis; one slab is highlighted in blue. Right panel (zoom): the kth slab Sk is isolated and shown as a right prism with width Delta_xk along the x-axis; a caption reads The cross section here has area A(x*_k). An arrow connects the two views. The figure sets up the Riemann sum sum A(x*_k) Delta_xk as an approximation for the total volume, whose limit gives the definite integral V = integral from a to b of A(x) dx.

**Interactions**

- Slider for number of slabs n: increase n and watch the partition of the solid S multiply from coarse to fine, with the volume sum ΣA(xₖ*)Δxₖ converging
- Drag the zoom inset to select different slab positions, displaying the cross-sectional area A(xₖ*) and slab volume for that slice

### 71. `5.2.8`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.2.8
- **reference image:** `images/math/3d/5.2.8.png`

**Input prompt**

This figure titled Some Familiar Solids of Revolution shows four side-by-side pairs (a)-(d), each consisting of a 2D plane region and the 3D solid it generates when revolved about an axis of revolution. Panel (a): a rectangle revolves to produce a right circular cylinder. Panel (b): a semicircle revolves to produce a solid sphere. Panel (c): a right triangle revolves to produce a solid cone. Panel (d): a rectangle separated from the axis revolves to produce a hollowed right circular cylinder. Each pair shows the 2D region at top with the axis of revolution marked as a horizontal line and a rotation arrow, and the resulting 3D solid below. The figure catalogs familiar 3D solids as examples of solids of revolution, motivating the general method of computing volumes by revolving a plane region about an axis.

**Interactions**

- Click each of the four solid types (cylinder, sphere, cone, hollowed cylinder) to focus on that panel and highlight the 2D generating region and its 3D result
- Toggle to animate the rotation of each 2D profile about its axis of revolution, showing how each familiar solid is formed
- Drag each 3D solid to rotate it and inspect its interior geometry from any viewpoint

### 72. `5.2.9`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.2.9
- **reference image:** `images/math/3d/5.2.9.png`

**Input prompt**

This figure contains two panels, (a) and (b), illustrating the disk method for computing the volume of a solid of revolution. Panel (a): the 2D xy-plane showing region R bounded above by the curve y = f(x), below by the x-axis, and between x = a and x = b; a rotation arrow at x = b indicates revolution about the x-axis. Panel (b): a 3D perspective of the resulting solid; at a generic position x along the axis, a circular disk cross-section is highlighted in blue with radius f(x) labeled, showing that each cross-section perpendicular to the x-axis is a disk of area pi[f(x)]^2. The figure derives the disk method formula V = integral from a to b of pi[f(x)]^2 dx by identifying the cross-sectional area at each x and integrating along the axis of revolution.

**Interactions**

- equation_input for f(x) and the interval: one field pre-filled with "sqrt(x)" and two fields for bounds a and b; learner edits the function or bounds and the 2D region R redraws, the disk cross-section updates, and the 3D solid of revolution reshapes — teaches that the disk radius at each x equals f(x), so the solid's profile is determined entirely by the formula
- slider for x in [a, b]: sweep the disk cross-section and display radius f(x) and disk area π[f(x)]² at the current position

### 73. `5.3.4`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.3.4
- **reference image:** `images/math/3d/5.3.4.png`

**Input prompt**

This figure contains two panels, (a) and (b), illustrating the shell method for computing volumes of solids of revolution about the y-axis. Panel (a): the 2D xy-plane showing a decreasing curve with a single rectangular strip Rk spanning from x_{k-1} to xk approximating the kth vertical strip of the region; a rotation arrow near the y-axis indicates revolution about that axis. Caption: Rectangle approximating the kth strip. Panel (b): a 3D view of the cylindrical shell Sk generated by revolving the rectangle about the y-axis, shown as a hollow cylindrical ring. Caption: Cylindrical shell generated by the rectangle. The figure introduces the shell method by showing how each thin vertical rectangle, when revolved, produces a cylindrical shell whose volume approximates the corresponding tubular portion of the solid.

**Interactions**

- Slider for strip index k: select the kth rectangle in panel (a) and simultaneously highlight the corresponding cylindrical shell Sₖ in panel (b), displaying its radius, height, and volume
- Slider for number of strips n: increase n and watch the shells become thinner, with the total shell volume sum converging to the true solid volume
- Toggle shell formula factors: radius, height, circumference, and thickness highlight one at a time on the selected shell, showing where 2?r h ?x comes from.

### 74. `5.7.13`  (3d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.7.13
- **reference image:** `images/math/3d/5.7.13.png`

**Input prompt**

This figure is part of a worked example asking to use Pappus' Theorem to find the volume of the torus generated by revolving a circular region of radius b about an axis at distance a from the center of the circle. The figure shows a 3D torus in perspective with the vertical axis of revolution passing through its central hole; the distance a from the axis to the center of the circular cross-section and the radius b of the cross-section are labeled, with the cross-section highlighted as a small circle on the right side of the torus. A red dashed ellipse traces the circular path traveled by the centroid, with direction arrows, and a caption box reads The centroid travels a distance 2pi a. The figure shows that by Pappus' Theorem the volume V = (2 pi a)(pi b^2) = 2 pi^2 a b^2, since the centroid traverses a full circle of circumference 2 pi a as the region revolves.

**Interactions**

- Sliders for major radius a and tube radius b: reshape the torus in real time and display the updated volume (2π²ab²) and surface area (4π²ab) via Pappus's theorem
- Animate the generating circle of radius b revolving around the axis to show how the torus is formed and trace the red centroid path of length 2πa
- Toggle Pappus components: the generating circle, centroid path, major radius a, and tube radius b highlight in sequence while the volume and surface-area formulas update.

### 75. `5.8.4`  (2d)

- **source:** Anton, Bivens, and Davis. Calculus, 10th Edition, Figure 5.8.4
- **reference image:** `images/math/2d/5.8.4.png`

**Input prompt**

This figure contains three panels, (a), (b), and (c), illustrating the derivation of the integral formula for fluid force on a submerged vertical surface. Panel (a): a cross-section of a fluid environment showing a blob-shaped surface submerged vertically, with the depth axis pointing downward; depth bounds a and b are marked with dashed red lines, depth h(x) is labeled from the fluid surface to the current level x, and width w(x) is shown as a horizontal segment across the surface at depth x. Panel (b): the same surface divided into n horizontal strips A1, A2, ..., An by partition points a = x0, x1, ..., x_{n-1}, b = xn along the depth axis. Panel (c): a close-up of the kth strip showing the sampling point x*_k between x_{k-1} and xk, with the strip approximated as a rectangle of width w(x*_k) and height Delta_xk, and depth h(x*_k) labeled. The figure sets up the Riemann sum F approx sum rho h(x*_k) w(x*_k) Delta_xk whose limit yields the fluid force integral F = integral from a to b of rho h(x) w(x) dx.

**Interactions**

- Slider for strip index k: highlight the corresponding strip in the partitioned diagram (panel b) and display the depth h(xₖ*) and width w(xₖ*) in the detail view (panel c)
- Slider for number of strips n: increase n in panel (b) and watch the pressure force approximation refine toward the true integral value
- Toggle the three panels into a single animated panel showing the strip construction and accumulated pressure sum

---

## physics

### 76. `ames_room_description`  (2d)

- **source:** visionbook/3d_scene_understanding_single_view.qmd
- **reference image:** `images/physics/2d/ames_room_description.png`

**Input prompt**

This figure illustrates the geometric principle behind the Ames room illusion using a top-down floor plan. The actual room floor plan is a large trapezoid, while the perceived room floor plan — the square shape the observer infers when looking through the pinhole at the bottom right — is a much smaller rectangle. Two equal-sized gray circles represent the same physical object at two different positions in the actual room: one placed in the far left corner (which is distant and to one side of the trapezoidal space) and one placed in the near right corner; red sight lines from the pinhole show that both subtend the same visual angle, so the brain interprets both as equidistant objects at different sizes. The dashed circle labeled Perceived object marks where the left-corner object is incorrectly localized in the perceived square room. This figure motivates the role of homography in constructing the Ames room, showing how a non-rectangular floor plan can be made to appear rectangular by exploiting the ambiguity of projective geometry seen from a single viewpoint.

**Interactions**

- Drag the pinhole position along the bottom edge to reposition the projection point, watching the red rays update and the gap between the perceived object (dashed circle) and the actual object shift
- Slider for room skew angle: widen the trapezoidal actual floor plan asymmetry and see the apparent size difference between the two objects grow as the perceived rectangular room assumption diverges further from reality
- Toggle between "actual floor plan" and "perceived floor plan" overlays to contrast the true trapezoidal shape with the rectangular room the viewer assumes when looking through the pinhole

### 77. `basic_motion_point`  (3d)

- **source:** visionbook/2d_motion_from_3d.qmd
- **reference image:** `images/physics/3d/basic_motion_point.png`

**Input prompt**

This figure illustrates how the 3D motion of a point projects into 2D motion on the image plane under a pinhole camera model. A 3D point P moves through space with instantaneous velocity Ṗ, and the green line from the camera center O through P shows the projection ray, which pierces the image plane at the corresponding 2D image point p. The red arrow at P labeled Ṗ marks the point's 3D velocity, while the red arrow at p labeled ṗ marks the resulting instantaneous velocity of its 2D projection; the dashed line traces where the displaced 3D point projects, making clear that the 2D velocity is the projection of the 3D velocity rather than a simple rescaling of it. This figure motivates the perspective-projection relations x = fX/Z and y = fY/Z, and their time derivatives, as the mathematical link between a point's 3D velocity Ṗ = (Ẋ, Ẏ, Ż) in world coordinates and its observed 2D optical flow ṗ = (ẋ, ẏ) in the camera plane.

**Interactions**

- Drag the 3D point P along its trajectory and watch the 2D projection p move on the image plane
- Sliders for velocity components (X-dot, Y-dot, Z-dot) to show how each affects the 2D optical flow vector

### 78. `boats`  (2d)

- **source:** visionbook/3d_scene_understanding_stereo.qmd
- **reference image:** `images/physics/2d/boats.png`

**Input prompt**

This figure contains two side-by-side panels illustrating geometric methods for estimating the distance of a boat from the coast. Left panel: a single-observer method, where the observer uses their known height above the water surface and the horizon line as a geometric reference to infer the boat distance. Right panel: a two-observer method, where measurements taken from two distinct vantage points enable triangulation of the boat distance. This figure introduces depth estimation from geometry as a precursor to stereo vision and binocular parallax.

**Interactions**

- Slider for observer height (left method): update the geometric diagram to show how the estimated distance changes
- Slider for observer separation (right method): show triangulation changing
- Toggle between the two methods in a single unified diagram, removing the need for two separate panels

### 79. `brdf`  (3d)

- **source:** visionbook/imaging.qmd
- **reference image:** `images/physics/3d/brdf.png`

**Input prompt**

This figure illustrates the Bidirectional Reflectance Distribution Function (BRDF) as a surface interaction model. An incoming light ray strikes a green surface at a point, where the surface normal n points upward and two ray vectors p and q define the local surface coordinate frame. Multiple outgoing arrows emanating in a hemisphere of directions represent the scattered radiance, and the governing equation shows that the reflected intensity depends on the incident radiance, surface orientation, wavelength, and surface material properties. The spread of outgoing rays captures the fact that real surfaces scatter light across many directions rather than reflecting it specularly into a single one. This figure motivates the BRDF as the general mathematical model that describes how a surface converts incoming irradiance into outgoing radiance across all viewing angles.

**Interactions**

- Model the BRDF live: a hemisphere of outgoing arrows above the surface point whose lengths encode reflected radiance, recomputed continuously from the current incoming direction and material
- Drag the incoming ray ℓ_in around the hemisphere: the outgoing radiance lobe re-renders in real time with the equation labels tracking

### 80. `cross_ratio_description2`  (2d)

- **source:** visionbook/3d_scene_understanding_single_view.qmd
- **reference image:** `images/physics/2d/cross_ratio_description2.png`

**Input prompt**

This figure illustrates the cross-ratio, a projective invariant used in single-view 3D scene understanding. It shows sets of collinear points P, Q, and R related by the cross-ratio, projected from a center of projection O. The point R1 lies at infinity because the line connecting the R points is parallel to the line passing through O, P1, and Q1. The figure demonstrates how if two sets of points, related by a projection, have the same ordering, then their cross ratio will be preserved.

**Interactions**

- Drag points P, Q, R along their respective lines and watch the cross-ratio value displayed in real time, demonstrating it stays invariant under projection
- Drag the projection center O to show the invariance holds for any center

### 81. `endpoint_error`  (2d)

- **source:** visionbook/motion_estimation.qmd
- **reference image:** `images/physics/2d/endpoint_error.png`

**Input prompt**

This figure contains two 2D vectors emanating from a common origin, illustrating the geometric definition of endpoint error in optical flow evaluation. The vector labeled (u, v) represents the ground truth flow vector, while the vector labeled (u-hat, v-hat) represents the predicted flow vector; both share the same base point but point in slightly different directions and have different magnitudes. A red line segment connects the tips (endpoints) of the two vectors, and this segment is labeled Endpoint error, making explicit that the loss is the Euclidean distance between the endpoint of the prediction and the endpoint of the ground truth. This figure establishes endpoint error as a vector-space distance metric, clarifying why it is sensitive to both directional and magnitude errors in the predicted flow field.

**Interactions**

- Drag the estimated vector tip (û,v̂) in any direction and see the red endpoint error segment stretch or shrink in real time as the distance between the two vector tips updates
- Drag the ground-truth vector tip (u,v) to set a new reference flow direction and magnitude, watching the red error segment reposition accordingly
- Toggle between endpoint error (straight-line distance between vector tips) and angular error (angle between the two vectors) metrics, highlighting which geometric quantity each measures in the diagram

### 82. `epipolar_geometry`  (3d)

- **source:** visionbook/3d_scene_understanding_stereo.qmd
- **reference image:** `images/physics/3d/epipolar_geometry.png`

**Input prompt**

This figure illustrates the core geometric relationships in a stereo camera pair. Two cameras with centers O1 and O2 face inward, each with its own image plane; a 3D point P projects to image points p1 and p2 on the respective planes, and the three points O1, P, O2 together define the epipolar plane. The baseline connecting O1 and O2 intersects each image plane at the epipoles e1 and e2, and the intersections of the epipolar plane with each image plane produce the labeled epipolar lines, which pass through the epipoles and through the respective image projections p1 and p2. This constraint means that if p1 is known, the corresponding point p2 must lie somewhere on the epipolar line in the second image, reducing stereo correspondence from a 2D search to a 1D one. The figure establishes the epipolar geometry as the fundamental constraint that links projections across two views, motivating the essential and fundamental matrices.

**Interactions**

- Build the two-camera rig as one live model: the epipolar plane, epipoles e1/e2, and both epipolar lines are recomputed from O1, O2, and P every frame
- Drag the 3D point P: watch p1, p2, the epipolar plane, and both epipolar lines track it continuously
- Drag or rotate camera 2 (sliders for baseline and rotation): the epipoles slide along the image planes and the epipolar lines re-orient, showing the constraint depends only on relative pose

### 83. `flatland_camera_linear`  (2d)

- **source:** visionbook/camera_as_linsys.qmd
- **reference image:** `images/physics/2d/flatland_camera_linear.png`

**Input prompt**

This figure shows a one-dimensional imaging system in flatland, a simplified 2D world used to build intuition for camera modeling. The scene is represented as a line of varying light intensities at a fixed depth, and the sensor axis is reversed relative to the scene, consistent with pinhole geometry. The figure sets up the linear algebra framework for treating cameras as linear systems, where the camera maps a world intensity vector to a sensor measurement vector.

**Interactions**

- Drag scene albedo values along the 1D scene line and see the sensor measurement vector update in real time
- Toggle to flip the sensor axis and highlight the reversal relative to scene coordinates

### 84. `flying_bird`  (3d)

- **source:** visionbook/2d_motion_from_3d.qmd
- **reference image:** `images/physics/3d/flying_bird.png`

**Input prompt**

This figure illustrates the concept of vanishing points arising when a static camera observes an object translating at constant velocity. A bird flies away from camera center O along a straight receding path, depicted as a sequence of silhouettes with equal-length red velocity arrows labeled V (the bird's constant 3D velocity); it is the projected image-plane velocity arrows that grow shorter as the bird recedes. Green projection rays from O through the image plane to each successive bird position show that as the bird recedes, its image on the plane converges toward a single point labeled Vanishing point, and the image-plane velocity arrows shrink and all point toward that same location. The lower portion of the figure shows the corresponding image-plane view, where the bird projected positions collapse toward the vanishing point and the image velocity approaches zero. This figure demonstrates that for pure constant-velocity translation, the image positions and velocities converge toward the vanishing point of the motion direction — the focus of expansion — whose location encodes the direction of translation.

**Interactions**

- Animate the phenomenon on a loop: the bird flies along its straight path at constant velocity V while its projection, projected path, and image-velocity arrows are recomputed live on the image plane
- The vanishing point / focus of expansion is drawn as a fixed marker: watch the projected bird converge toward it with shrinking image velocity as it recedes
- Drag the bird's velocity direction: the vanishing point relocates to the image of the new direction, demonstrating that the FOE encodes the translation direction
- Slider to scrub the animation: bird position advances along its straight path while projected path, image-plane position, and image-velocity arrows update together, showing how the same 3D motion induces a changing 2D image velocity.

### 85. `geometry_reconstruction_12`  (3d)

- **source:** visionbook/3d_learning.qmd
- **reference image:** `images/physics/3d/geometry_reconstruction_12.png`

**Input prompt**

This figure illustrates the two-frame geometry of 3D point reconstruction from a moving camera. Two image planes are shown — a reference frame and a target frame — with a 3D point P visible from both; the image point p on the target frame is lifted back to 3D via P = zK⁻¹p using the intrinsic calibration matrix K and depth z. The two camera frames are related by an extrinsic rigid-body transformation parameterized by rotation R and translation T (the loop P' = MP at the 3D point), and the transformed point is projected onto the reference frame as p' = KP. This figure sets up the two-view reconstruction pipeline in which known or estimated camera motion and intrinsic calibration K together determine the 3D location of a scene point from its projected image correspondences across frames.

**Interactions**

- Live two-view model: the back-projected ray P = zK⁻¹p, the rigid transform P' = MP, and the reprojection p' = KP are recomputed continuously from the current geometry
- Slider for depth z along the ray through p: the 3D point slides along the ray and both image projections update together, showing the depth ambiguity a single view leaves
- Sliders for the relative pose (R, T) of the second camera: watch p' move in the reference frame while p stays fixed, visualizing how motion parameters determine where the correspondence lands

### 86. `homogeneousAndHeteregeneous_VS3`  (3d)

- **source:** visionbook/homogeneous_coordinates.qmd
- **reference image:** `images/physics/3d/homogeneousAndHeteregeneous_VS3.png`

**Input prompt**

This figure illustrates the geometric relationship between heterogeneous (standard 2D) and homogeneous (projective) coordinate representations of the same 2D point. On the left, a point (x, y) exists in the standard Euclidean plane with axes x and y; on the right, the homogeneous coordinate space introduces a third axis w, and the canonical embedding of (x, y) is the point (x, y, 1) on the w=1 plane. A dashed ray extends from the origin through (x, y, 1) out to the general scalar multiple (lambda*x, lambda*y, lambda), showing that the entire ray through the origin corresponds to a single heterogeneous point, making scale irrelevant. This figure introduces the equivalence-class interpretation of homogeneous coordinates, which is the geometric foundation that allows projective transformations such as homographies to be expressed as linear matrix multiplications.

**Interactions**

- Drag the 2D point (x, y) in the left plane and watch the corresponding 3D homogeneous ray in the right panel rotate through the origin while the canonical point (x, y, 1) stays pinned to the w=1 plane
- Slider for w: move the selected homogeneous representative along the right-panel ray and display the recovered heterogeneous coordinates (x/w, y/w) back on the left-panel point
- Toggle linked-view mode: highlight the left 2D point, the right canonical point (x, y, 1), and several scaled equivalents such as (2x, 2y, 2) as one shared equivalence class

### 87. `homography_plane_geometry2`  (3d)

- **source:** visionbook/homography.qmd
- **reference image:** `images/physics/3d/homography_plane_geometry2.png`

**Input prompt**

This figure illustrates the geometry of projecting a planar 3D surface onto a camera image plane. A world coordinate frame is placed with its origin on the planar surface and the Z-axis perpendicular to the plane, so every surface point has the degenerate form (X, Y, 0); a single world point at (X, Y, 0) is projected by rays from the camera center through the image plane to the image point (x, y). Because all scene points lie on the Z=0 plane, the depth dimension vanishes and the full 3x4 camera projection collapses to a 3x3 matrix — the homography H — that directly maps (X, Y) to (x, y). This figure motivates the derivation of the homography by showing that planarity of the scene eliminates the depth degree of freedom, establishing a direct and invertible 2D-to-2D linear mapping between the world plane and the image.

**Interactions**

- Drag the camera center around the planar scene and watch the image-plane projection of the world point update while the homography matrix H changes in real time
- Tilt or rotate the world plane away from the camera and show how the projected grid becomes increasingly foreshortened while the Z=0 plane constraint is preserved
- Toggle between full 3D projection and collapsed 2D-to-2D homography view: first show rays from the camera to the plane, then flatten the same mapping into paired source and image-plane coordinates

### 88. `no_picture_on_a_wall_aina`  (3d)

- **source:** visionbook/imaging.qmd
- **reference image:** `images/physics/3d/no_picture_on_a_wall_aina.png`

**Input prompt**

This figure contains two panels, (a) and (b), contrasting image formation without and with a pinhole aperture. In panel (a), multiple rays from different parts of a tree converge onto just two points on a bare wall, showing that without any aperture restriction every wall point receives light from many different scene directions simultaneously, preventing any coherent image from forming. In panel (b), a black opaque barrier with a single pinhole is placed between the scene and the wall; now each wall point receives light from exactly one scene direction through the pinhole, and an inverted, spatially distinct projection appears. The figure motivates the pinhole camera model by demonstrating that aperture restriction is the essential mechanism establishing a one-to-one correspondence between scene points and image locations.

**Interactions**

- Toggle the figure between no wall opening to pinhole opening and watch panel (a) transform into panel (b), linking the mixed ray bundle on the blank wall to the restricted ray bundle that forms the image
- Toggle side-by-side ray comparison: highlight one wall location in both panels and show that it receives many scene directions without a pinhole but only one dominant direction through the pinhole
- Slider for pinhole size, which increases the image blurriness when size increases and vice versa

### 89. `orthogonal_projection`  (3d)

- **source:** visionbook/imaging.qmd
- **reference image:** `images/physics/3d/orthogonal_projection.png`

**Input prompt**

This figure illustrates orthographic projection of a 3D box onto a 2D projection plane within a labeled world coordinate frame with X, Y, and Z axes. The two-step staircasesolid, whose faces are color-coded red, green, and cyan, is positioned along the Z-axis, and dashed lines parallel to Z connect each corner of the box to the projection plane, showing that projection rays travel perpendicular to the plane with no angular convergence. The resulting projected shape on the plane preserves the lateral dimensions and color-face layout of the box exactly, with no foreshortening based on depth. The figure introduces orthographic projection as a distance-independent mapping that retains parallelism and metric lengths in the plane perpendicular to the projection axis, contrasting it with the depth-scaling behavior of perspective projection.

**Interactions**

- Slider for object depth: move the box toward or away from the projection plane while the orthographic footprint keeps its scale, showing that parallel projection removes depth-dependent size changes.
- Slider blending orthographic to perspective projection: compare constant-size depth-independent projection against perspective foreshortening as objects move along Z
- Toggle depth guides: display equal-length lateral measurements at different depths to show why x = X and y = Y under orthographic projection but not under perspective projection

### 90. `pinhole_and_sensor`  (3d)

- **source:** visionbook/imaging_geometry.qmd
- **reference image:** `images/physics/3d/pinhole_and_sensor.png`

**Input prompt**

This figure illustrates the complete image formation chain from a 3D scene point P to a discrete pixel location on a physical sensor. The camera coordinate frame is defined by axes Xc, Yc, and the optical axis Zc, with the camera center (pinhole) at the origin; a virtual image plane with local x and y axes sits at focal length f in front, while the physical sensor sits at distance f behind the camera center. The sensor is rendered as a discrete M-by-N pixel grid, and both a continuous projected point and its snapped pixel-grid location are visible, emphasizing the discretization from continuous coordinates to integer pixel indices. The figure establishes all geometric quantities — focal length f, pixel size, and the principal point offset (ox, oy) — required to assemble the full camera intrinsic matrix K.

**Interactions**

- Drag the 3D point P in camera coordinates and watch both the continuous projection on the virtual image plane and the snapped pixel location on the sensor grid update together
- Sliders for focal length, sensor width, and pixel resolution: update field of view, pixel size, and the intrinsic matrix entries so the tradeoff between geometry and sampling is visible
- Toggle coordinate readout modes: switch between camera-plane coordinates (x, y), sensor-centered coordinates, and image pixel indices (n, m), highlighting the principal point offset

### 91. `pinhole_geometry2`  (3d)

- **source:** visionbook/imaging.qmd
- **reference image:** `images/physics/3d/pinhole_geometry2.png`

**Input prompt**

This figure contains two panels, (a) and (b), that together establish the coordinate geometry of the pinhole camera model. Panel (a) shows the 3D world-coordinate setup with axes X, Y, and Z: a scene point P projects through the pinhole at the origin, with red arrows marking the focal length f on both sides — the physical projection plane at distance f behind the pinhole carries an inverted image, while the virtual camera plane at distance f in front carries an upright image, demonstrating why the virtual plane convention avoids image inversion. Panel (b) zooms into the virtual camera plane and shows the two 2D coordinate systems that coexist on it: the camera coordinate frame centered at the principal point with axes x and y, and the image coordinate frame with integer pixel axes n and m whose origin sits at the image corner. The figure motivates the need to account for the principal point offset when converting between continuous camera coordinates and discrete pixel indices in the projection equations.

**Interactions**

- Drag the 3D point P in panel (a) and show its matching coordinate location in panel (b), linking the 3D ray projection to the 2D camera-coordinate and image-coordinate conversion
- Slider for focal length f: move both real and virtual camera planes in panel (a) while panel (b) updates the projected coordinate scale and principal-point offset
- Toggle real-versus-virtual projection: compare the inverted physical sensor point in panel (a) with the upright virtual-plane convention, then trace how that same point is expressed as pixel coordinates in panel (b)

### 92. `pinhole_names2`  (3d)

- **source:** visionbook/imaging.qmd
- **reference image:** `images/physics/3d/pinhole_names2.png`

**Input prompt**

This figure illustrates the named components and coordinate geometry of the pinhole camera model. A box representing the camera body is shown in 3D, with the pinhole/camera center marked as a black dot on its rear face. From this center, three axes extend: Z along the optical axis pointing forward, Y pointing upward, and X pointing laterally, forming a right-handed coordinate frame. The projection plane is labeled on the front face of the box, and the focal length f is indicated in red as the distance from that plane back to the pinhole. This figure establishes the standard naming conventions — optical center, optical axis, projection plane, and focal length — that underpin all subsequent formulations of perspective projection.

**Interactions**

- Toggle camera-coordinate labels: X, Y, Z, optical axis, image plane, and projection center highlight in sequence, making the naming convention and right-handed frame explicit.
- Toggle between right-handed and left-handed coordinate conventions: flip the affected axis and display how the sign convention changes the interpretation of image coordinates
- Click each labeled component, such as optical center, optical axis, projection plane, or focal length, to highlight it in the diagram and show its role in the pinhole projection equations

### 93. `plenoptic_function`  (2d)

- **source:** visionbook/nerf.qmd
- **reference image:** `images/physics/2d/plenoptic_function.png`

**Input prompt**

This figure shows a slice of the plenoptic function sampled at four spatial locations: two in free space and two inside a pinhole camera. At each location, the plenoptic function encodes the intensity of light rays passing through that point from every direction. The locations inside the pinhole camera show that most directional values are zero, with only specific directions carrying non-zero intensity due to the camera aperture. The figure introduces the plenoptic function as a complete representation of all light in a scene, motivating its use in neural radiance fields (NeRFs).

**Interactions**

- Click to move the sampling point anywhere in the scene; display the angular light distribution at that point
- Toggle between free-space and inside-camera locations to contrast the dense vs sparse plenoptic function

### 94. `reprojection_error`  (3d)

- **source:** visionbook/imaging_geometry.qmd
- **reference image:** `images/physics/3d/reprojection_error.png`

**Input prompt**

This figure illustrates the concept of reprojection error in the context of camera parameter estimation. Three 3D points form a triangle in the scene and project through the camera onto the image plane as observed image points p1, p2, and p3. Adjacent to each observed point is a corresponding reprojected point computed by projecting the same 3D points using estimated (rather than true) camera parameters; short red line segments connect each observed point to its reprojected counterpart, visualizing the per-point error. The figure motivates reprojection error as the measurable 2D residual between observed image locations and those predicted by the estimated camera model, which serves as the objective function for camera calibration.

**Interactions**

- Drag an observed image point or its reprojected estimate and watch the red reprojection error vector update in length, direction, and numeric residual value
- Sliders for camera pose and intrinsic parameters K, R, and T: perturb the estimated camera model and show all reprojected points shifting relative to their observed counterparts
- Toggle aggregate error mode: display individual residuals for each point or the total sum-of-squared reprojection error used as the nonlinear optimization objective

### 95. `sampling_reconstruction2`  (2d)

- **source:** visionbook/sampling_and_aliasing.qmd
- **reference image:** `images/physics/2d/sampling_reconstruction2.png`

**Input prompt**

This figure illustrates the reconstruction of a continuous signal from its discrete samples via convolution, presented as a three-part equation. The left panel shows the discrete sample sequence as blue impulse arrows at regular intervals labeled -T_s, 0, T_s, and 2T_s along the time axis t. The middle panel shows the reconstruction kernel — a sinc-like function with peak value 1 that decays with oscillations — which acts as an interpolation filter. The right panel, separated by an equals sign, shows the convolution result: each blue sample arrow generates a scaled copy of the green kernel (shown as dashed green curves), and all shifted, scaled copies sum together to produce the reconstructed continuous signal (solid red curve) that passes through every sample point. This figure demonstrates that ideal signal reconstruction is a linear superposition process, connecting discrete samples back to the continuous domain through sinc interpolation.

**Interactions**

- Slider for sampling interval T_s: decrease it to show well-separated green sinc copies and a clean red reconstructed envelope; increase it past the Nyquist limit to show overlapping sinc copies and aliasing distortion in the red envelope
- Toggle individual sinc copies (dashed green curves in the right panel) on and off to reveal how each sample contributes its own scaled sinc and how they sum to form the red reconstructed signal
- Animate the convolution sweep: step the sinc filter across each sample position one by one, incrementally building up the cumulative red envelope from left to right

### 96. `similar_triangles2`  (3d)

- **source:** visionbook/imaging.qmd
- **reference image:** `images/physics/3d/similar_triangles2.png`

**Input prompt**

This figure illustrates the geometric derivation of the perspective projection equations using similar triangles. A 3D world point lies at depth Z, and a dashed ray connects it through the pinhole at the origin to the projected image point on the image plane, which is positioned at focal distance f. The cyan and green shaded planes highlight the two cross-sectional triangles — one in the X-Z plane and one in the Y-Z plane — whose proportional sides directly yield the relations x/f = X/Z and y/f = Y/Z. Image coordinates x and y are labeled in green on the projection plane, and the 3D axes X, Y, Z are shown emanating from the pinhole. The figure demonstrates how collinearity of the 3D point, optical center, and image point forces the similar-triangle relationships that are the geometric foundation of the pinhole projection model.

**Interactions**

- Drag the 3D point P and update both colored similar-triangle cross sections together, linking the X-Z triangle that gives x/f = X/Z with the Y-Z triangle that gives y/f = Y/Z
- Slider for focal length f: move the image plane and show both projected coordinates x and y scaling from the same depth Z
- Toggle correspondence labels: highlight matching sides across the cyan and green triangle pairs so the two projection equations are visibly derived from the same ray geometry

### 97. `snellcropped`  (2d)

- **source:** visionbook/lenses.qmd
- **reference image:** `images/physics/2d/snellcropped.png`

**Input prompt**

This figure shows the geometry of light refraction at a planar interface between two optical media, as described by Snell's law. A horizontal black line divides the scene into an upper region with refractive index n1 and a lower region with refractive index n2; a thick blue line traces the ray direction as it strikes the interface and continues into the second medium. A thin vertical line marks the surface normal at the point of incidence, with a small right-angle square confirming its perpendicularity to the interface; the angle theta_1 is measured between the incoming ray and the normal above the interface, and theta_2 is measured between the refracted ray and the normal below. The ray bends toward or away from the normal depending on the relative magnitudes of n1 and n2, embodying the relationship n1 sin theta_1 = n2 sin theta_2. This figure introduces refraction geometry as the physical basis for how lenses bend light and form images.

**Interactions**

- Drag the incident ray to change θ₁ and watch θ₂ update in real time according to n₁ sin θ₁ = n₂ sin θ₂, with both angle arc labels refreshing as the ray rotates about the interface point
- Sliders for refractive indices n₁ and n₂: show how increasing n₂ relative to n₁ bends the refracted ray closer to the surface normal, and vice versa
- Increase n₁ above n₂ and drag θ₁ past the critical angle to trigger total internal reflection, showing the refracted ray disappear below the interface and a reflected ray appear symmetrically above it

### 98. `telescope2`  (2d)

- **source:** visionbook/lenses.qmd
- **reference image:** `images/physics/2d/telescope2.png`

**Input prompt**

This figure shows a two-lens telescope system consisting of a convex objective lens (lens 1, on the left) and a concave eyepiece lens (lens 2, on the right), with the distances f1 and f2 indicated by horizontal brackets beneath the optical axis. Two parallel input rays enter from the left at a small angle δᵢ relative to the optical axis; lens 1 bends them toward the objective focal point to the right of lens 2, and lens 2 then diverges the rays so they exit as a parallel bundle at a larger angle δₒ. The blue vertical marker d shows the offset of the shared focal point from the optical axis in the shown Galilean afocal geometry, where the objective focal point aligns with the eyepiece focal point. This figure demonstrates how a Galilean-style telescope achieves angular magnification equal to the ratio f1/f2 by manipulating ray angles through the two-lens arrangement.

**Interactions**

- Sliders for focal lengths f₁ and f₂: update all ray paths through both lenses and display the angular magnification ratio δₒ/δᵢ = f₁/f₂ in real time, with the lens separation adjusting to maintain the shown Galilean afocal configuration
- Drag the input ray angle δᵢ to change the angle of the two parallel input rays and see the output angle δₒ change proportionally, with ray traces updating through both lenses
- Drag lens 2 along the optical axis to deviate from the shown afocal separation (f₁ - f₂, using the positive bracketed distances), showing the exit beam become converging or diverging and the blue focal-point offset d shift relative to lens 2

### 99. `translations`  (2d)

- **source:** visionbook/homogeneous_coordinates.qmd
- **reference image:** `images/physics/2d/translations.png`

**Input prompt**

This figure contains two side-by-side panels illustrating 2D translation as a geometric transformation in the xy-plane. In the left panel, an orange square at the origin is displaced to an upper-right position by a translation vector t, shown as a red arrow; the transformed square sits at coordinates (t_x, t_y) relative to the original. In the right panel, two successive translations are depicted: the square first moves by vector t to an intermediate position, then by vector s to a final position, with individual red arrows labeled t and s; a third red arrow labeled t+s connects the original square directly to the final position, demonstrating that the composition of two translations equals their vector sum. This figure establishes the additive composition rule for 2D translations, motivating their representation in homogeneous coordinates where composition reduces to matrix multiplication.

**Interactions**

- Drag to set the translation vector (tx, ty) and see both the geometric result and the homogeneous matrix update
- Chain a second translation and show the composed matrix, replacing the two static sub-panels

### 100. `yaw_pitch_roll`  (3d)

- **source:** visionbook/2d_motion_from_3d.qmd
- **reference image:** `images/physics/3d/yaw_pitch_roll.png`

**Input prompt**

This figure illustrates the decomposition of 3D camera rotation into three Euler angles about the principal coordinate axes. A right-handed coordinate system is anchored at the origin, with Y pointing up, X pointing laterally, and Z pointing forward along the optical axis. Red curved arrows indicate the three rotation types: yaw (theta_Y) as rotation about Y, pitch (theta_X) as rotation about X, and roll (theta_Z) as rotation about Z. A tilted image plane with local axes x and y contains an image point p, and a dashed line connects it to a 3D world point P, illustrating the overall projection geometry that the rotation parameters affect. The figure sets up the Euler-angle parameterization used to construct the full 3D rotation matrix R, which relates the world and camera coordinate frames.

**Interactions**

- Individual sliders for yaw, pitch, and roll: rotate the camera/image plane about Y, X, and Z axes and show the compounded orientation after each Euler-angle step
- Toggle rotation order, such as yaw-pitch-roll versus roll-pitch-yaw, to demonstrate non-commutativity by ending at different final camera orientations from the same angle values
- Animate one rotation at a time with the active axis highlighted, updating the image point p and dashed projection ray so the effect of each angle on the viewing geometry is visible
