export interface InstrumentSchematicSpec {
  goalWord: string;
  howToPlay: string;
  controlsHint: string;
  svg: string;
}

const SCHEMATICS: Record<string, InstrumentSchematicSpec> = {
  wave_shaper: {
    goalWord: 'TUNE',
    howToPlay: 'Align your amber carrier wave with the dashed cosmic emission curve.',
    controlsHint: 'DRAG KNOBS / VERNIERS · ARROWS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <line x1="16" y1="42" x2="224" y2="42" stroke="rgba(160,200,230,0.22)" stroke-width="1"/>
      <path d="M 20 42 C 45 12, 70 12, 95 42 C 120 72, 145 72, 170 42 C 195 14, 210 18, 220 42" fill="none" stroke="#7ec8e8" stroke-width="1.4" stroke-dasharray="4 3"/>
      <path d="M 20 42 C 42 18, 66 20, 92 42 C 118 64, 144 64, 172 42 C 196 22, 212 24, 220 42" fill="none" stroke="#ebb062" stroke-width="1.8"/>
      <circle cx="95" cy="42" r="3" fill="#6fd6b6"/>
      <text x="20" y="16" fill="#7ec8e8" font-size="8" font-family="monospace">TARGET WAVE</text>
      <text x="150" y="76" fill="#ebb062" font-size="8" font-family="monospace">PHASE · AMP</text>
    </svg>`,
  },
  constellation_recall: {
    goalWord: 'TRACE',
    howToPlay: 'Watch the reference star sequence flash, then trace the same links in order.',
    controlsHint: 'CLICK / TAP STARS IN ORDER',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <polyline points="42,60 94,24 148,54 198,22" fill="none" stroke="#ebb062" stroke-width="1.4" stroke-dasharray="4 3"/>
      <circle cx="42" cy="60" r="4.5" fill="#ebb062"/><text x="39" y="74" fill="#ebb062" font-size="8" font-family="monospace">1</text>
      <circle cx="94" cy="24" r="4.5" fill="#7ec8e8"/><text x="91" y="14" fill="#7ec8e8" font-size="8" font-family="monospace">2</text>
      <circle cx="148" cy="54" r="4.5" fill="#7ec8e8"/><text x="145" y="70" fill="#7ec8e8" font-size="8" font-family="monospace">3</text>
      <circle cx="198" cy="22" r="5" fill="none" stroke="#6fd6b6" stroke-width="1.5"/><text x="195" y="12" fill="#6fd6b6" font-size="8" font-family="monospace">4</text>
    </svg>`,
  },
  pulsar_echo: {
    goalWord: 'TIME',
    howToPlay: 'Tap or press Space right as the spinning lighthouse beam sweeps each orbiting star.',
    controlsHint: 'SPACE / CLICK ON BEAM CROSSING',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="120" cy="42" r="28" fill="none" stroke="rgba(126,200,232,0.38)" stroke-width="1.2"/>
      <circle cx="120" cy="42" r="4" fill="#ebb062"/>
      <line x1="120" y1="42" x2="176" y2="20" stroke="#ebb062" stroke-width="1.8"/>
      <line x1="120" y1="42" x2="64" y2="64" stroke="rgba(235,176,98,0.45)" stroke-width="1.2" stroke-dasharray="3 3"/>
      <circle cx="146" cy="31" r="5" fill="none" stroke="#6fd6b6" stroke-width="1.6"/>
      <circle cx="146" cy="31" r="2" fill="#6fd6b6"/>
      <text x="164" y="40" fill="#6fd6b6" font-size="8" font-family="monospace">LOCK</text>
    </svg>`,
  },
  lens_focus: {
    goalWord: 'UNWARP',
    howToPlay: 'Rotate the concentric gravitational lens shells until warped starlight streams align.',
    controlsHint: 'DRAG RINGS · SCROLL DEPTH',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="120" cy="42" r="32" fill="none" stroke="#7ec8e8" stroke-width="1.3" stroke-dasharray="14 6"/>
      <circle cx="120" cy="42" r="21" fill="none" stroke="#ebb062" stroke-width="1.5" stroke-dasharray="12 5"/>
      <circle cx="120" cy="42" r="10" fill="none" stroke="#6fd6b6" stroke-width="1.5"/>
      <line x1="82" y1="42" x2="158" y2="42" stroke="rgba(111,214,182,0.65)" stroke-width="1" stroke-dasharray="2 3"/>
      <text x="168" y="28" fill="#ebb062" font-size="8" font-family="monospace">SHEAR RINGS</text>
    </svg>`,
  },
  light_dispersion: {
    goalWord: 'DISPERSE',
    howToPlay: 'Steer the crystal prism or grating to route each wavelength band cleanly past dust.',
    controlsHint: 'DRAG PRISM ANGLE · ARROWS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <line x1="22" y1="44" x2="96" y2="44" stroke="#f5f8fc" stroke-width="1.8"/>
      <polygon points="96,62 120,18 144,62" fill="none" stroke="#7ec8e8" stroke-width="1.5"/>
      <line x1="134" y1="36" x2="212" y2="20" stroke="#7ec8e8" stroke-width="1.4"/>
      <line x1="136" y1="44" x2="212" y2="44" stroke="#6fd6b6" stroke-width="1.4"/>
      <line x1="138" y1="52" x2="212" y2="68" stroke="#ebb062" stroke-width="1.6"/>
      <text x="24" y="34" fill="rgba(220,236,248,0.72)" font-size="8" font-family="monospace">BEAM</text>
      <text x="172" y="16" fill="#7ec8e8" font-size="7.5" font-family="monospace">UV · VIS · IR</text>
    </svg>`,
  },
  blink_spotter: {
    goalWord: 'FORECAST',
    howToPlay: 'Read Epochs 1–3 motion trails and place the Epoch 4 marker where the star arrives.',
    controlsHint: 'CLICK / DRAG EPOCH 4 RING',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <path d="M 32 58 Q 108 50 194 22" fill="none" stroke="#7ec8e8" stroke-width="1.2" stroke-dasharray="3 3"/>
      <circle cx="44" cy="56" r="3" fill="#7ec8e8"/><text x="38" y="72" fill="#7ec8e8" font-size="8" font-family="monospace">E1</text>
      <circle cx="94" cy="48" r="3" fill="#7ec8e8"/><text x="88" y="64" fill="#7ec8e8" font-size="8" font-family="monospace">E2</text>
      <circle cx="144" cy="36" r="3.5" fill="#ebb062"/><text x="138" y="52" fill="#ebb062" font-size="8" font-family="monospace">E3</text>
      <circle cx="194" cy="22" r="6" fill="none" stroke="#6fd6b6" stroke-width="1.6"/><text x="188" y="40" fill="#6fd6b6" font-size="8" font-family="monospace">E4?</text>
    </svg>`,
  },
  gravity_slingshot: {
    goalWord: 'DEFLECT',
    howToPlay: 'Pull back and launch so foreground gravity wells bend the path into the capture ring.',
    controlsHint: 'DRAG LAUNCH VECTOR · RELEASE',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="122" cy="48" r="10" fill="none" stroke="rgba(126,200,232,0.55)" stroke-width="1.2" stroke-dasharray="2 2"/>
      <circle cx="122" cy="48" r="3.5" fill="#7ec8e8"/>
      <path d="M 32 62 C 74 62, 102 22, 198 22" fill="none" stroke="#ebb062" stroke-width="1.6"/>
      <circle cx="32" cy="62" r="3.5" fill="#ebb062"/>
      <circle cx="198" cy="22" r="6" fill="none" stroke="#6fd6b6" stroke-width="1.6"/>
      <text x="112" y="72" fill="#7ec8e8" font-size="8" font-family="monospace">MASS WELL</text>
    </svg>`,
  },
  exoplanet_transit: {
    goalWord: 'MATCH',
    howToPlay: 'Drag planetary orbit radii to reproduce the observed stellar brightness dip curve.',
    controlsHint: 'DRAG ORBIT RINGS · SELECT SIZE',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="52" cy="36" r="14" fill="none" stroke="#ebb062" stroke-width="1.4"/>
      <ellipse cx="52" cy="36" rx="34" ry="10" fill="none" stroke="#7ec8e8" stroke-width="1.1"/>
      <circle cx="64" cy="44" r="3.5" fill="#6fd6b6"/>
      <polyline points="104,24 142,24 150,56 174,56 182,24 224,24" fill="none" stroke="#7ec8e8" stroke-width="1.4" stroke-dasharray="3 2"/>
      <polyline points="104,24 142,24 150,54 174,54 182,24 224,24" fill="none" stroke="#ebb062" stroke-width="1.5"/>
      <text x="128" y="72" fill="#7ec8e8" font-size="8" font-family="monospace">LIGHT CURVE DIP</text>
    </svg>`,
  },
  spectral_prism: {
    goalWord: 'MIX',
    howToPlay: 'Toggle elemental emission lines and tune Doppler shift to match the reference barcode.',
    controlsHint: 'TOGGLE ELEMENTS · DRAG Δλ',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <rect x="24" y="18" width="192" height="18" fill="none" stroke="rgba(160,200,230,0.35)" stroke-width="1"/>
      <line x1="48" y1="19" x2="48" y2="35" stroke="#7ec8e8" stroke-width="2.2"/>
      <line x1="94" y1="19" x2="94" y2="35" stroke="#6fd6b6" stroke-width="2.2"/>
      <line x1="168" y1="19" x2="168" y2="35" stroke="#ebb062" stroke-width="2.2"/>
      <rect x="24" y="46" width="192" height="18" fill="none" stroke="rgba(235,176,98,0.45)" stroke-width="1"/>
      <line x1="56" y1="47" x2="56" y2="63" stroke="#7ec8e8" stroke-width="2.2"/>
      <line x1="102" y1="47" x2="102" y2="63" stroke="#6fd6b6" stroke-width="2.2"/>
      <line x1="176" y1="47" x2="176" y2="63" stroke="#ebb062" stroke-width="2.2"/>
      <text x="24" y="76" fill="#ebb062" font-size="8" font-family="monospace">MATCH EMISSION LINES + SHIFT</text>
    </svg>`,
  },
  radio_triangulation: {
    goalWord: 'TRIANGULATE',
    howToPlay: 'Aim perimeter VLBI radio dishes until their directional beams converge on the beacon.',
    controlsHint: 'DRAG DISH BEAMS · REJECT DECOYS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="120" cy="42" r="32" fill="none" stroke="rgba(160,200,230,0.28)" stroke-width="1"/>
      <line x1="56" y1="22" x2="134" y2="46" stroke="#7ec8e8" stroke-width="1.3" stroke-dasharray="3 3"/>
      <line x1="184" y1="22" x2="134" y2="46" stroke="#ebb062" stroke-width="1.3" stroke-dasharray="3 3"/>
      <line x1="120" y1="74" x2="134" y2="46" stroke="#6fd6b6" stroke-width="1.3"/>
      <circle cx="134" cy="46" r="4" fill="#6fd6b6"/>
      <text x="150" y="68" fill="#7ec8e8" font-size="8" font-family="monospace">VLBI FIX</text>
    </svg>`,
  },
  coronagraph_mask: {
    goalWord: 'OCCULT',
    howToPlay: 'Center the dark mask over star glare until servo lock frees you to tag faint planets.',
    controlsHint: 'DRAG MASK · CLICK EXOPLANETS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <line x1="90" y1="42" x2="150" y2="42" stroke="rgba(235,176,98,0.5)" stroke-width="1"/>
      <line x1="120" y1="12" x2="120" y2="72" stroke="rgba(235,176,98,0.5)" stroke-width="1"/>
      <circle cx="120" cy="42" r="14" fill="#060b12" stroke="#7ec8e8" stroke-width="1.6"/>
      <circle cx="170" cy="28" r="3.5" fill="#6fd6b6"/>
      <circle cx="72" cy="54" r="3" fill="#ebb062"/>
      <text x="154" y="68" fill="#6fd6b6" font-size="8" font-family="monospace">TAG PLANET</text>
    </svg>`,
  },
  polarization_filter: {
    goalWord: 'FILTER',
    howToPlay: 'Rotate the polarized analyzer ring to extinguish dust glare and reveal hidden arcs.',
    controlsHint: 'DRAG POLARIZER RING · ARROWS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="120" cy="42" r="28" fill="none" stroke="#ebb062" stroke-width="1.5"/>
      <line x1="98" y1="24" x2="142" y2="60" stroke="rgba(126,200,232,0.55)" stroke-width="1.2"/>
      <line x1="104" y1="18" x2="148" y2="54" stroke="rgba(126,200,232,0.55)" stroke-width="1.2"/>
      <path d="M 96 54 A 30 30 0 0 1 144 30" fill="none" stroke="#6fd6b6" stroke-width="1.8"/>
      <text x="158" y="66" fill="#6fd6b6" font-size="8" font-family="monospace">ARC EXPOSED</text>
    </svg>`,
  },
  exposure_stacker: {
    goalWord: 'STACK',
    howToPlay: 'Open the shutter and tune the iris aperture to gather signal while dodging streak trails.',
    controlsHint: 'TOGGLE SHUTTER · DRAG IRIS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <polygon points="74,20 98,20 110,42 98,64 74,64 62,42" fill="none" stroke="#7ec8e8" stroke-width="1.5"/>
      <circle cx="86" cy="42" r="10" fill="none" stroke="#ebb062" stroke-width="1.3"/>
      <line x1="56" y1="62" x2="116" y2="20" stroke="#e27880" stroke-width="1.3" stroke-dasharray="3 3"/>
      <polyline points="134,60 156,50 180,32 214,22" fill="none" stroke="#6fd6b6" stroke-width="1.8"/>
      <text x="134" y="74" fill="#6fd6b6" font-size="8" font-family="monospace">PHOTON STACK</text>
    </svg>`,
  },
  binary_mass_scale: {
    goalWord: 'WEIGH',
    howToPlay: 'Balance orbital radius and dark companion mass until the barycenter anchors on center.',
    controlsHint: 'DRAG COMPANION · TUNE MASS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <line x1="48" y1="42" x2="192" y2="42" stroke="#7ec8e8" stroke-width="1.5"/>
      <polygon points="120,44 114,58 126,58" fill="none" stroke="#6fd6b6" stroke-width="1.4"/>
      <circle cx="72" cy="42" r="7" fill="#ebb062"/>
      <circle cx="176" cy="42" r="5" fill="#060b12" stroke="#7ec8e8" stroke-width="1.6"/>
      <text x="86" y="74" fill="#6fd6b6" font-size="8" font-family="monospace">M1·r1 = M2·r2</text>
    </svg>`,
  },
  cepheid_ladder: {
    goalWord: 'CALIBRATE',
    howToPlay: 'Sync pulsation cadence and match Cepheid split-mirror brightness to set Mpc distance.',
    controlsHint: 'DRAG PERIOD & DISTANCE MPC',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="64" cy="40" r="20" fill="none" stroke="#7ec8e8" stroke-width="1.4"/>
      <line x1="64" y1="20" x2="64" y2="60" stroke="#ebb062" stroke-width="1.4"/>
      <polyline points="104,48 118,22 132,48 146,22 160,48" fill="none" stroke="#ebb062" stroke-width="1.5"/>
      <line x1="176" y1="24" x2="216" y2="24" stroke="#6fd6b6" stroke-width="1.5"/>
      <line x1="176" y1="40" x2="216" y2="40" stroke="#7ec8e8" stroke-width="1.5"/>
      <text x="108" y="72" fill="#7ec8e8" font-size="8" font-family="monospace">LMC — VIRGO MPC</text>
    </svg>`,
  },
  supernova_echoes: {
    goalWord: 'REWIND',
    howToPlay: 'Drop tangent ping ripples across glowing dust clouds and rewind wavefronts to t = 0.',
    controlsHint: 'SPACE / CLICK ECHO ORIGIN · REWIND',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="120" cy="42" r="30" fill="none" stroke="#ebb062" stroke-width="1.3" stroke-dasharray="4 3"/>
      <circle cx="120" cy="42" r="18" fill="none" stroke="#7ec8e8" stroke-width="1.3"/>
      <line x1="94" y1="26" x2="120" y2="42" stroke="#6fd6b6" stroke-width="1.2"/>
      <line x1="148" y1="28" x2="120" y2="42" stroke="#6fd6b6" stroke-width="1.2"/>
      <circle cx="120" cy="42" r="3.5" fill="#6fd6b6"/>
      <text x="156" y="72" fill="#ebb062" font-size="8" font-family="monospace">ORIGIN t → 0</text>
    </svg>`,
  },
  horizon_seam_stitcher: {
    goalWord: 'STITCH',
    howToPlay: 'Translate, rotate, and flip opposing sky tiles until identical stars lock across the seam.',
    controlsHint: 'DRAG TILE · ROTATE / FLIP',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <rect x="44" y="18" width="66" height="48" fill="none" stroke="#7ec8e8" stroke-width="1.3"/>
      <rect x="124" y="18" width="66" height="48" fill="none" stroke="#ebb062" stroke-width="1.3" stroke-dasharray="4 3"/>
      <line x1="117" y1="12" x2="117" y2="72" stroke="#6fd6b6" stroke-width="1.6"/>
      <circle cx="96" cy="34" r="2.5" fill="#7ec8e8"/><circle cx="138" cy="34" r="2.5" fill="#ebb062"/>
      <text x="134" y="76" fill="#6fd6b6" font-size="8" font-family="monospace">180° SEAM LOCK</text>
    </svg>`,
  },
  michelson_fringe: {
    goalWord: 'EQUALIZE',
    howToPlay: 'Slide the optical delay mirror rail until blurred interference static snaps into crisp rings.',
    controlsHint: 'DRAG DELAY MIRROR · ARROWS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="72" cy="42" r="20" fill="none" stroke="#7ec8e8" stroke-width="1.3"/>
      <circle cx="72" cy="42" r="12" fill="none" stroke="#6fd6b6" stroke-width="1.4"/>
      <circle cx="72" cy="42" r="4" fill="#ebb062"/>
      <line x1="118" y1="42" x2="212" y2="42" stroke="rgba(160,200,230,0.4)" stroke-width="1.5"/>
      <rect x="162" y="30" width="8" height="24" fill="none" stroke="#ebb062" stroke-width="1.6"/>
      <text x="124" y="70" fill="#ebb062" font-size="8" font-family="monospace">ΔL = 0 DELAY</text>
    </svg>`,
  },
  multiband_loupe: {
    goalWord: 'INSPECT',
    howToPlay: 'Sweep the spectral loupe and switch Optical / IR / X-Ray bands to expose hidden cores.',
    controlsHint: 'MOVE LOUPE · 1/2/3/SPACE BANDS',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <circle cx="104" cy="42" r="26" fill="none" stroke="#7ec8e8" stroke-width="1.6"/>
      <line x1="123" y1="60" x2="140" y2="74" stroke="#7ec8e8" stroke-width="2"/>
      <circle cx="96" cy="36" r="3" fill="#ebb062"/>
      <circle cx="114" cy="48" r="3" fill="#6fd6b6"/>
      <text x="148" y="38" fill="#ebb062" font-size="8" font-family="monospace">OPT · IR · X-RAY</text>
    </svg>`,
  },
  einstein_cross: {
    goalWord: 'LINK',
    howToPlay: 'Audition quasar mirage cadences and link the mirrored images belonging to one source.',
    controlsHint: 'CLICK / LINK SHARED CADENCE',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <ellipse cx="120" cy="42" rx="14" ry="9" fill="none" stroke="#ebb062" stroke-width="1.4"/>
      <circle cx="120" cy="14" r="3.5" fill="#7ec8e8"/>
      <circle cx="120" cy="70" r="3.5" fill="#7ec8e8"/>
      <circle cx="84" cy="42" r="3.5" fill="#6fd6b6"/>
      <circle cx="156" cy="42" r="3.5" fill="#6fd6b6"/>
      <path d="M 84 42 Q 120 14 156 42" fill="none" stroke="rgba(111,214,182,0.55)" stroke-width="1.1" stroke-dasharray="3 3"/>
      <text x="168" y="72" fill="#7ec8e8" font-size="8" font-family="monospace">4× MIRAGE</text>
    </svg>`,
  },
  parallax_depth: {
    goalWord: 'SEPARATE',
    howToPlay: 'Rock the orbital baseline side to side to separate near stars from static background sky.',
    controlsHint: 'DRAG BASELINE · AUTO-ROCK',
    svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
      <line x1="36" y1="64" x2="204" y2="64" stroke="#ebb062" stroke-width="1.4"/>
      <circle cx="88" cy="28" r="4" fill="#7ec8e8"/>
      <line x1="72" y1="28" x2="104" y2="28" stroke="#7ec8e8" stroke-width="1.2" stroke-dasharray="2 2"/>
      <circle cx="164" cy="24" r="2.5" fill="#6fd6b6"/>
      <text x="48" y="78" fill="#ebb062" font-size="8" font-family="monospace">← ORBIT BASELINE →</text>
    </svg>`,
  },
};

const FALLBACK_SCHEMATIC: InstrumentSchematicSpec = {
  goalWord: 'CALIBRATE',
  howToPlay: 'Align optical controls to lock the cosmic signature cleanly.',
  controlsHint: 'DRAG / CLICK INSTRUMENT',
  svg: `<svg class="schematic-svg" viewBox="0 0 240 84" aria-hidden="true">
    <circle cx="120" cy="42" r="24" fill="none" stroke="#7ec8e8" stroke-width="1.4"/>
    <circle cx="120" cy="42" r="8" fill="none" stroke="#ebb062" stroke-width="1.4"/>
  </svg>`,
};

export function getInstrumentSchematic(minigameId: string): InstrumentSchematicSpec {
  return SCHEMATICS[minigameId] ?? FALLBACK_SCHEMATIC;
}
