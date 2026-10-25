export type GridSpec = {
  lonMin: number; lonMax: number; latMin: number; latMax: number; step: number;
};

export type FieldGrid = { nx: number; ny: number; n: number; lonMin: number; latMin: number; step: number };
export type FieldMeta = { offset: number; scale: number; min: number; max: number; grid?: FieldGrid };

export interface Manifest {
  version: number;
  build_id?: string;
  generated_at: string;
  source: string;
  source_url: string;
  license: string;
  grid: GridSpec;
  lonCount: number;
  latCount: number;
  pointCount: number;
  frameCount: number;
  fields: Record<string, FieldMeta>;
  fieldOrder: string[];
  times: string[];
  binary: string;
  bytes: number;
  range?: string;
  stepHours?: number;
  atmosphereOnly?: boolean;
}

export type LayerMode = 'fill' | 'line' | 'flow';

export type GroupId = 'flow' | 'thermo' | 'moisture' | 'dynamics' | 'ground';

export type Palette = Array<[number, string]>;

export type DerivedId =
  | 'adv_temp' | 'adv_moist' | 'div10' | 'ptend3' | 't2m_trend' | 'sm_trend' | 'dtd';

export interface LayerDef {
  id: string;
  label: string;
  short: string;
  sub?: string;
  group: GroupId;
  kind: 'scalar' | 'flow' | 'derived';
  unit: string;
  decimals: number;
  palette: Palette;
  oceanPalette?: Palette;
  range: [number, number];
  contour?: number;
  contourColor?: string;
  pattern?: number;
  mask?: 'land' | 'ocean';
  field?: string;
  dirField?: string;
  derived?: DerivedId;
  lineOnly?: boolean;
  defaultOpacity: number;
  description: string;
  read: string;
  glyph: GlyphId;
  alt?: string;
}

export type GlyphId =
  | 'wind' | 'jet' | 'temp' | 'temp-high' | 'surface' | 'rh' | 'dew' | 'vpd'
  | 'rain' | 'cloud' | 'pressure' | 'tendency' | 'advection' | 'convergence'
  | 'cape' | 'omega' | 'height' | 'soil' | 'soil-deep' | 'soil-temp' | 'et'
  | 'snow' | 'solar' | 'dtd';
