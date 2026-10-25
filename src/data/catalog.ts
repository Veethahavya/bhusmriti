import type { GroupId, LayerDef, Palette } from './types';

export const T = {
  bg: '#03080b',
  accent: '#5eead4',
  warm: '#ffb26b',
  cool: '#74b9ff',
  ink: '#e8f6f3',
  dim: '#8aa8a6',
};

const P: Record<string, Palette> = {
  wind: [
    [0, '#4cc9c0'], [0.2, '#7ee8dc'], [0.4, '#c8fff8'], [0.6, '#ffffff'],
    [0.78, '#c7b8ff'], [0.9, '#e39cff'], [1, '#ff7ad9'],
  ],
  current: [
    [0, '#0a2f5c'], [0.2, '#12649a'], [0.4, '#1aa3b8'], [0.58, '#3fe0c8'],
    [0.74, '#a8f0d6'], [0.88, '#f5d98c'], [1, '#ff8f5e'],
  ],
  temp: [
    [0, '#2b1b4d'], [0.14, '#34558f'], [0.28, '#3c86a8'], [0.42, '#4fb39a'],
    [0.56, '#8cc97a'], [0.7, '#e0cf6a'], [0.84, '#e39a5c'], [1, '#b8434d'],
  ],
  sst: [
    [0, '#0a2458'], [0.2, '#115e8a'], [0.4, '#1d9aa8'], [0.6, '#4fd1b5'],
    [0.78, '#f0d98c'], [0.9, '#f08a5d'], [1, '#b52f2f'],
  ],
  humidity: [
    [0, '#4a2f14'], [0.2, '#8a5a26'], [0.4, '#c9a55a'], [0.55, '#a7c97a'],
    [0.7, '#4fbfa0'], [0.85, '#2b8cbe'], [1, '#204a9e'],
  ],
  precip: [
    [0, 'rgba(7,20,26,0)'], [0.06, 'rgba(20,61,92,0.5)'], [0.2, '#1f6f9e'],
    [0.38, '#22a6b3'], [0.55, '#6fd68a'], [0.7, '#f4d35e'], [0.85, '#f28e2b'], [1, '#e23b3b'],
  ],
  cloud: [
    [0, 'rgba(160,190,205,0)'], [0.3, 'rgba(150,175,190,0.2)'],
    [0.6, 'rgba(200,215,225,0.4)'], [1, 'rgba(245,250,255,0.66)'],
  ],
  soil: [
    [0, '#5c3a1e'], [0.18, '#8a6136'], [0.36, '#c3a46b'], [0.52, '#a9b86a'],
    [0.68, '#5e9c6e'], [0.82, '#2e7f8a'], [1, '#144a6b'],
  ],
  soilTrend: [
    [0, '#b45309'], [0.35, '#f59e0b'], [0.5, 'rgba(10,20,25,0)'],
    [0.65, '#34d399'], [1, '#059669'],
  ],
  et: [
    [0, 'rgba(20,10,40,0)'], [0.2, '#3b1f63'], [0.4, '#7a3b8a'],
    [0.6, '#c25f7c'], [0.78, '#f08a5d'], [1, '#ffe29a'],
  ],
  cape: [
    [0, 'rgba(10,15,20,0)'], [0.2, '#3a2a6b'], [0.4, '#8a3a8f'],
    [0.6, '#d6456f'], [0.78, '#ff8c42'], [0.9, '#ffd166'], [1, '#fff3b0'],
  ],
  phase: [
    [0, '#7b2cbf'], [0.35, '#a56cc1'], [0.5, 'rgba(10,20,25,0)'],
    [0.65, '#f2c14e'], [1, '#ff9f1c'],
  ],
  advection: [
    [0, '#2d7dd2'], [0.3, '#6fb3e0'], [0.5, 'rgba(10,20,25,0)'],
    [0.7, '#f4a582'], [1, '#d7191c'],
  ],
  divergence: [
    [0, '#b45309'], [0.3, '#7c4a1e'], [0.5, 'rgba(8,18,22,0)'],
    [0.7, '#1f7a68'], [1, '#4ade80'],
  ],
  omega: [
    [0, '#3b82f6'], [0.4, '#60a5fa'], [0.5, 'rgba(8,18,22,0)'],
    [0.6, '#fb923c'], [1, '#dc2626'],
  ],
  vpd: [
    [0, '#1d4ed8'], [0.3, '#38bdf8'], [0.5, '#a3e635'],
    [0.7, '#f59e0b'], [0.85, '#ef4444'], [1, '#991b1b'],
  ],
  snow: [
    [0, 'rgba(200,240,255,0)'], [0.3, '#cfeffd'], [0.7, '#eaf9ff'], [1, '#ffffff'],
  ],
  solar: [
    [0, 'rgba(20,15,40,0)'], [0.3, '#3b1f63'], [0.6, '#b06ab3'],
    [0.8, '#f6c177'], [1, '#fff6c2'],
  ],
};

const LINE_W = 'rgba(255,255,255,0.4)';

export const GROUPS: Array<{ id: GroupId; label: string; hint: string }> = [
  { id: 'flow', label: 'Circulation', hint: 'where the air is going' },
  { id: 'thermo', label: 'Heat', hint: 'temperature & its drift' },
  { id: 'moisture', label: 'Moisture', hint: 'water in the air' },
  { id: 'dynamics', label: 'Dynamics', hint: 'lift, pressure & instability' },
  { id: 'ground', label: 'Ground', hint: 'soil, evapotranspiration & snow' },
];

export const LAYERS: LayerDef[] = [
  // ── circulation ────────────────────────────────────────────────────────────
  {
    id: 'wind10', label: 'Surface wind', short: 'Wind 10 m', sub: '10 m', group: 'flow', kind: 'flow',
    unit: 'km/h', decimals: 0, palette: P.wind, range: [0, 120], field: 'wind_speed_10m', dirField: 'wind_direction_10m',
    defaultOpacity: 1, pattern: 0, glyph: 'wind', alt: 'surface',
    description: 'The flow you feel. Streamlines advect with the analysed wind field; colour is speed.',
    read: 'Watch convergence lines, coastlines and terrain edges. Where streams bunch together, air is rising.',
  },
  {
    id: 'wind850', label: 'Low-level flow', short: 'Wind 850', sub: '850 hPa · ≈1.5 km', group: 'flow', kind: 'flow',
    unit: 'km/h', decimals: 0, palette: P.wind, range: [0, 150], field: 'wind_speed_850hPa', dirField: 'wind_direction_850hPa',
    defaultOpacity: 1, pattern: 0, glyph: 'wind', alt: '≈1.5 km',
    description: 'The low-level jet and warm-air conveyor. This is the layer that feeds storms.',
    read: 'A strong, moist low-level jet running into a front is a classic heavy-rain setup.',
  },
  {
    id: 'wind500', label: 'Mid-level flow', short: 'Wind 500', sub: '500 hPa · ≈5.5 km', group: 'flow', kind: 'flow',
    unit: 'km/h', decimals: 0, palette: P.wind, range: [0, 240], field: 'wind_speed_500hPa', dirField: 'wind_direction_500hPa',
    defaultOpacity: 1, pattern: 0, glyph: 'wind', alt: '≈5.5 km',
    description: 'Steering flow. Weather systems ride these currents; troughs here drive surface development.',
    read: 'Look for a sharp trough or a jet streak: rising motion is strongest on its equatorward flank.',
  },
  {
    id: 'wind250', label: 'Jet stream', short: 'Jet 250', sub: '250 hPa · ≈10.5 km', group: 'flow', kind: 'flow',
    unit: 'km/h', decimals: 0, palette: P.wind, range: [0, 340], field: 'wind_speed_250hPa', dirField: 'wind_direction_250hPa',
    defaultOpacity: 1, pattern: 0, glyph: 'jet', alt: '≈10.5 km',
    description: 'The polar-front jet. Its ribbons of fast wind steer cyclones and organise storm tracks.',
    read: 'Jet streaks and sharp curvature are where the atmosphere is being stretched and lift is generated.',
  },

  {
    id: 'ocean_current', label: 'Ocean surface current', short: 'Ocean flow', sub: 'surface · km/h', group: 'flow', kind: 'flow',
    unit: 'km/h', decimals: 1, palette: P.current, range: [0, 12], field: 'ocean_current_velocity', dirField: 'ocean_current_direction',
    defaultOpacity: 1, pattern: 0, glyph: 'wind',
    description: 'The surface ocean current. In the atlas it is a flow layer; in EARTH it drives the translucent, temperature-shaded water.',
    read: 'Western boundary currents are narrow and fast; eddies and convergence zones concentrate marine heat and nutrients.',
  },
  {
    id: 'gusts', label: 'Wind gusts', short: 'Gusts', sub: '10 m · max gust', group: 'flow', kind: 'scalar',
    unit: 'km/h', decimals: 0, palette: P.wind, range: [0, 180], contour: 20,
    contourColor: 'rgba(255,255,255,0.28)', field: 'wind_gusts_10m', defaultOpacity: 0.78,
    pattern: 1, glyph: 'wind',
    description: 'Peak gust speed over the hour. The gusty edge of the flow.',
    read: 'Gusts well above the mean wind signal a turbulent, unstable boundary layer or a strong front.',
  },

  // ── heat ──────────────────────────────────────────────────────────────────
  {
    id: 'temp2m', label: 'Air temperature', short: 'Temp 2 m', sub: '2 m', group: 'thermo', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.temp, range: [-45, 50],
    field: 'temperature_2m', defaultOpacity: 0.78, glyph: 'temp',
    description: 'Screen-level heat as a smooth thermal wash. Switch to LINES for isotherms.',
    read: 'Tight isotherms mean a strong front. Follow the gradient with the wind: that is temperature advection.',
  },
  {
    id: 'temp850', label: 'Lower-troposphere heat', short: 'Temp 850', sub: '850 hPa · ≈1.5 km', group: 'thermo', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.temp, range: [-45, 35],
    field: 'temperature_850hPa', defaultOpacity: 0.76, glyph: 'temp-high',
    description: 'The thermal ridge or trough steering surface weather.',
    read: 'Warm advection at 850 hPa ahead of a trough is a strong signal of approaching uplift.',
  },
  {
    id: 'temp500', label: 'Mid-troposphere heat', short: 'Temp 500', sub: '500 hPa · ≈5.5 km', group: 'thermo', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.temp, range: [-65, 15],
    field: 'temperature_500hPa', defaultOpacity: 0.76, glyph: 'temp-high',
    description: 'Cold pools aloft make the air unstable; warm ridges cap convection.',
    read: 'A cold pool moving over warm, moist low levels is the classic severe-storm ingredient.',
  },
  {
    id: 'surface', label: 'Surface temperature', short: 'Skin temp', sub: 'land + ocean', group: 'thermo', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.temp, oceanPalette: P.sst, range: [-45, 50],
    field: 'surface_temperature',
    defaultOpacity: 0.78, glyph: 'surface',
    description: 'Radiative skin temperature: warm land, cool water, and the sea-surface pattern.',
    read: 'Land heats and cools fast; water is the flywheel. The contrast builds sea breezes and coastal convergence.',
  },
  {
    id: 'sst', label: 'Sea-surface temperature', short: 'SST', sub: 'ocean skin', group: 'thermo', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.sst, range: [-2, 35], contour: 2,
    contourColor: 'rgba(190,245,255,0.3)', field: 'sea_surface_temperature', mask: 'ocean',
    defaultOpacity: 0.72, glyph: 'surface',
    description: 'The ocean surface thermostat — the slow flywheel of the atmosphere.',
    read: 'Warm water fuels tropical systems; sharp SST gradients anchor fronts and sea breezes.',
  },
  {
    id: 'dtd', label: 'Dew-point depression', short: 'T−Td', sub: '2 m', group: 'thermo', kind: 'derived',
    unit: '°C', decimals: 1, palette: P.vpd, range: [0, 20], contour: 2, contourColor: LINE_W,
    derived: 'dtd', defaultOpacity: 0.8, glyph: 'dtd',
    description: 'How far the air is from saturation. Low values mean fog, low cloud and drizzle.',
    read: 'Under 2 °C with light wind: fog or low stratus likely. Above 15 °C: dry, deep visibility.',
  },

  // ── moisture ──────────────────────────────────────────────────────────────
  {
    id: 'rh2m', label: 'Relative humidity', short: 'RH 2 m', sub: '2 m', group: 'moisture', kind: 'scalar',
    unit: '%', decimals: 0, palette: P.humidity, range: [0, 100], contour: 10,
    contourColor: 'rgba(170,240,255,0.3)', field: 'relative_humidity_2m', defaultOpacity: 0.78, glyph: 'rh',
    description: 'Moisture saturation near the surface.',
    read: 'A sharp RH gradient often traces a front or a dryline. Rising RH with falling pressure is a wet signal.',
  },
  {
    id: 'rh850', label: 'Low-level moisture', short: 'RH 850', sub: '850 hPa · ≈1.5 km', group: 'moisture', kind: 'scalar',
    unit: '%', decimals: 0, palette: P.humidity, range: [0, 100], contour: 10,
    contourColor: 'rgba(170,240,255,0.28)', field: 'relative_humidity_850hPa', defaultOpacity: 0.76, glyph: 'rh',
    description: 'The moisture reservoir feeding clouds and precipitation.',
    read: 'A moist 850 hPa plume aimed at a front or mountain barrier is a heavy-rain signature.',
  },
  {
    id: 'dewpoint', label: 'Dew point', short: 'Dew point', sub: '2 m', group: 'moisture', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.humidity, range: [-45, 32], contour: 5,
    contourColor: 'rgba(190,245,255,0.3)', field: 'dew_point_2m', defaultOpacity: 0.8, glyph: 'dew',
    description: 'The absolute moisture content expressed as a temperature.',
    read: 'Dew point is conservative: a rising dew point means moist air is arriving, not just cooling.',
  },
  {
    id: 'pw', label: 'Precipitable water', short: 'Precip water', sub: 'whole column', group: 'moisture', kind: 'scalar',
    unit: 'kg/m²', decimals: 1, palette: P.humidity, range: [0, 80], contour: 10,
    contourColor: 'rgba(170,240,255,0.3)', field: 'total_precipitable_water',
    defaultOpacity: 0.8, glyph: 'rh',
    description: 'The total water vapour in a column from surface to space.',
    read: 'High PW is the fuel reservoir for heavy rain. Watch it stream poleward ahead of a trough.',
  },
  {
    id: 'vpd', label: 'Vapour pressure deficit', short: 'VPD', sub: '2 m', group: 'moisture', kind: 'scalar',
    unit: 'kPa', decimals: 2, palette: P.vpd, range: [0, 6], contour: 1,
    contourColor: 'rgba(255,255,255,0.28)', field: 'vapour_pressure_deficit', defaultOpacity: 0.8, glyph: 'vpd',
    description: 'The drying power of the air — the gap between saturation and reality.',
    read: 'High VPD pulls moisture from soil and plants; low VPD favours fog, dew and slow evaporation.',
  },
  {
    id: 'adv_moist', label: 'Moisture advection', short: 'Moisture flux', sub: '2 m · %/h', group: 'moisture', kind: 'derived',
    unit: '%/h', decimals: 1, palette: P.advection, range: [-25, 25], contour: 5, contourColor: LINE_W,
    derived: 'adv_moist', defaultOpacity: 0.8, glyph: 'advection',
    description: 'How fast wind is carrying moisture into or out of a place.',
    read: 'Blue = moistening (often ahead of a trough); red = drying. Combine with convergence to find rain.',
  },
  {
    id: 'precip', label: 'Precipitation rate', short: 'Precip', sub: 'mm/h', group: 'moisture', kind: 'scalar',
    unit: 'mm/h', decimals: 2, palette: P.precip, range: [0, 10], field: 'precipitation',
    defaultOpacity: 0.9, pattern: 2, glyph: 'rain',
    description: 'Instantaneous precipitation rate, with an animated rain texture.',
    read: 'Follow the motion: rain areas usually drift with the 850–700 hPa flow, not the surface wind.',
  },
  {
    id: 'cloud', label: 'Cloud cover', short: 'Cloud', sub: 'total', group: 'moisture', kind: 'scalar',
    unit: '%', decimals: 0, palette: P.cloud, range: [0, 100], field: 'cloud_cover',
    defaultOpacity: 0.7, pattern: 5, glyph: 'cloud',
    description: 'Total cloud fraction, rendered as a soft drifting veil.',
    read: 'Cloud streets align with the wind; expanding sheets ahead of a warm front signal approaching rain.',
  },

  // ── dynamics ──────────────────────────────────────────────────────────────
  {
    id: 'mslp', label: 'Mean sea-level pressure', short: 'Pressure', sub: 'isobars · 8 hPa', group: 'dynamics', kind: 'scalar',
    unit: 'hPa', decimals: 0, palette: P.phase, range: [960, 1050], contour: 8,
    contourColor: 'rgba(150,235,220,0.62)', field: 'pressure_msl', lineOnly: true,
    defaultOpacity: 1, glyph: 'pressure',
    description: 'Isobars every 8 hPa, with highs and lows marked. The skeleton of the weather map.',
    read: 'Tight isobars = strong wind. Falling pressure = approach of a low or trough. Ridges suppress rain.',
  },
  {
    id: 'ptend3', label: 'Pressure tendency', short: 'ΔP 3 h', sub: 'last 3 h', group: 'dynamics', kind: 'derived',
    unit: 'hPa/3h', decimals: 1, palette: P.phase, range: [-6, 6], contour: 2, contourColor: LINE_W,
    derived: 'ptend3', defaultOpacity: 0.82, glyph: 'tendency',
    description: 'Pressure change over the last three hours.',
    read: 'Purple = falling (weather deteriorating). Amber = rising (clearing). A sharp fall is the strongest short-term signal.',
  },
  {
    id: 'adv_temp', label: 'Temperature advection', short: 'Thermal flux', sub: '2 m · K/h', group: 'dynamics', kind: 'derived',
    unit: 'K/h', decimals: 1, palette: P.advection, range: [-3, 3], contour: 0.5, contourColor: LINE_W,
    derived: 'adv_temp', defaultOpacity: 0.8, glyph: 'advection',
    description: 'Warm-air advection (red) and cold-air advection (blue), computed from wind × temperature gradient.',
    read: 'Warm advection aloft ahead of a trough is a classic precursor to ascent and precipitation.',
  },
  {
    id: 'div10', label: 'Wind convergence', short: 'Divergence', sub: '10 m · 10⁻⁵ s⁻¹', group: 'dynamics', kind: 'derived',
    unit: '10⁻⁵ s⁻¹', decimals: 1, palette: P.divergence, range: [-8, 8], contour: 2, contourColor: LINE_W,
    derived: 'div10', defaultOpacity: 0.82, glyph: 'convergence',
    description: 'Where surface air piles up (green) or spreads apart (brown).',
    read: 'Convergence concentrates moisture and forces ascent. It often precedes showers by a few hours.',
  },
  {
    id: 'cape', label: 'Convective energy', short: 'CAPE', sub: 'J/kg', group: 'dynamics', kind: 'scalar',
    unit: 'J/kg', decimals: 0, palette: P.cape, range: [0, 5000], contour: 500,
    contourColor: 'rgba(255,220,150,0.34)', field: 'cape', defaultOpacity: 0.8, pattern: 4, glyph: 'cape',
    description: 'Convective available potential energy: the fuel available to thunderstorms.',
    read: 'High CAPE is fuel, not ignition. Look for a trigger: convergence, a front, or a jet streak overhead.',
  },
  {
    id: 'omega', label: 'Vertical motion', short: 'Omega 500', sub: '500 hPa · Pa/s', group: 'dynamics', kind: 'scalar',
    unit: 'Pa/s', decimals: 2, palette: P.omega, range: [-0.6, 0.6], contour: 0.1,
    contourColor: 'rgba(255,255,255,0.3)', field: 'vertical_velocity_500hPa', defaultOpacity: 0.8, glyph: 'omega',
    description: 'Large-scale rising (blue) and sinking (orange) motion at mid-levels.',
    read: 'Persistent blue is the engine of cloud and rain; orange is subsidence, clearing and capping.',
  },
  {
    id: 'geo500', label: '500 hPa height', short: 'Z500', sub: 'contours · 60 m', group: 'dynamics', kind: 'scalar',
    unit: 'm', decimals: 0, palette: P.phase, range: [5000, 6000], contour: 60,
    contourColor: 'rgba(150,220,255,0.34)', field: 'geopotential_height_500hPa', lineOnly: true,
    defaultOpacity: 1, glyph: 'height',
    description: 'The shape of the mid-tropospheric flow: ridges, troughs and cut-offs.',
    read: 'Troughs favour ascent and cooling aloft; ridges favour subsidence and warmth. Watch the tilt.',
  },

  // ── ground ────────────────────────────────────────────────────────────────
  {
    id: 'soil0', label: 'Surface soil moisture', short: 'Soil 0–7', sub: '0–7 cm', group: 'ground', kind: 'scalar',
    unit: 'm³/m³', decimals: 2, palette: P.soil, range: [0, 0.6], contour: 0.05,
    contourColor: 'rgba(235,245,205,0.3)', field: 'soil_moisture_0_to_7cm', mask: 'land',
    defaultOpacity: 0.84, pattern: 3, glyph: 'soil',
    description: 'Water in the topsoil — the fast-responding reservoir for evaporation and runoff.',
    read: 'Wet soil + strong heating = efficient evaporation and a better chance of afternoon storms.',
  },
  {
    id: 'soil1', label: 'Root-zone soil moisture', short: 'Soil 7–28', sub: '7–28 cm', group: 'ground', kind: 'scalar',
    unit: 'm³/m³', decimals: 2, palette: P.soil, range: [0, 0.6], contour: 0.05,
    contourColor: 'rgba(235,245,205,0.28)', field: 'soil_moisture_7_to_28cm', mask: 'land',
    defaultOpacity: 0.84, pattern: 4, glyph: 'soil',
    description: 'The root-zone reservoir that sustains vegetation between rain events.',
    read: 'A dry root zone can keep the boundary layer hot and deep even when the air above is moist.',
  },
  {
    id: 'soil2', label: 'Deep soil moisture', short: 'Soil 28–100', sub: '28–100 cm', group: 'ground', kind: 'scalar',
    unit: 'm³/m³', decimals: 2, palette: P.soil, range: [0, 0.6], contour: 0.05,
    contourColor: 'rgba(235,245,205,0.26)', field: 'soil_moisture_28_to_100cm', mask: 'land',
    defaultOpacity: 0.84, pattern: 4, glyph: 'soil-deep',
    description: 'Slow memory of past rainfall, important for drought and flood persistence.',
    read: 'Deep saturation means new rain becomes runoff; deep dryness means it can be absorbed.',
  },
  {
    id: 'soil3', label: 'Groundwater-zone moisture', short: 'Soil 100–255', sub: '100–255 cm', group: 'ground', kind: 'scalar',
    unit: 'm³/m³', decimals: 2, palette: P.soil, range: [0, 0.6], contour: 0.05,
    contourColor: 'rgba(235,245,205,0.24)', field: 'soil_moisture_100_to_255cm', mask: 'land',
    defaultOpacity: 0.84, pattern: 4, glyph: 'soil-deep',
    description: 'The deepest modelled layer: the slowest hydrological memory in the column.',
    read: 'Compare with the surface layers to see whether water is percolating down or being pulled up.',
  },
  {
    id: 'soil_temp', label: 'Soil temperature', short: 'Soil temp', sub: '0–7 cm', group: 'ground', kind: 'scalar',
    unit: '°C', decimals: 1, palette: P.temp, range: [-30, 45], contour: 5,
    contourColor: 'rgba(255,255,255,0.26)', field: 'soil_temperature_0_to_7cm', mask: 'land',
    defaultOpacity: 0.8, pattern: 3, glyph: 'soil-temp',
    description: 'Ground heat — the lower boundary condition for the boundary layer.',
    read: 'Warm, wet soil injects both heat and moisture into the air above it.',
  },
  {
    id: 'et0', label: 'Reference evapotranspiration', short: 'ET₀', sub: 'mm/h', group: 'ground', kind: 'scalar',
    unit: 'mm/h', decimals: 2, palette: P.et, range: [0, 1.2], contour: 0.2,
    contourColor: 'rgba(255,225,170,0.3)', field: 'et0_fao_evapotranspiration', mask: 'land',
    defaultOpacity: 0.8, pattern: 6, glyph: 'et',
    description: 'Evaporative demand from a reference crop: the atmosphere’s pull on surface water.',
    read: 'High ET over wet soil pumps a large moisture flux into the boundary layer.',
  },
  {
    id: 'snow', label: 'Snow depth', short: 'Snow', sub: 'metres', group: 'ground', kind: 'scalar',
    unit: 'm', decimals: 2, palette: P.snow, range: [0, 2], contour: 0.2,
    contourColor: 'rgba(230,250,255,0.3)', field: 'snow_depth', mask: 'land',
    defaultOpacity: 0.82, pattern: 3, glyph: 'snow',
    description: 'Modelled snow on the ground.',
    read: 'Snow cover reflects sunlight and locks moisture away from the atmosphere until melt.',
  },
  {
    id: 'solar', label: 'Shortwave radiation', short: 'Solar', sub: 'W/m²', group: 'ground', kind: 'scalar',
    unit: 'W/m²', decimals: 0, palette: P.solar, range: [0, 1000], contour: 100,
    contourColor: 'rgba(255,240,190,0.24)', field: 'shortwave_radiation',
    defaultOpacity: 0.7, glyph: 'solar',
    description: 'Downwelling solar energy — the driver of the whole diurnal engine.',
    read: 'The day/night terminator is the deepest driver of the fluxes you are watching.',
  },
];

export const LAYER_BY_ID: Record<string, LayerDef> = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

export const DEFAULT_LAYERS = {
  fill: 'temp2m',
  lines: ['mslp'],
  flow: 'wind10',
  selected: 'temp2m',
};

export function formatValue(def: LayerDef, v: number, windUnit: 'kmh' | 'ms' | 'kt' = 'kmh'): string {
  if (!Number.isFinite(v)) return '—';
  if (def.kind === 'flow') {
    if (windUnit === 'ms') return `${(v / 3.6).toFixed(1)} m/s`;
    if (windUnit === 'kt') return `${(v / 1.852).toFixed(0)} kt`;
  }
  if (def.unit === '°C' || def.unit === 'K' || def.unit === 'K/h') return `${v.toFixed(def.decimals)} ${def.unit}`;
  if (def.unit === 'hPa' || def.unit === 'hPa/3h') return `${v.toFixed(def.decimals)} ${def.unit}`;
  if (def.unit === 'm³/m³') return `${v.toFixed(def.decimals)} m³/m³`;
  return `${v.toFixed(def.decimals)} ${def.unit}`;
}
