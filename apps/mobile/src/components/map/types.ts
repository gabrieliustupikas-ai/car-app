export interface RoadMapProps {
  /** native only: follow the device's GPS position */
  follow?: boolean;
  /** follow a given coordinate ([lng, lat]) — used for simulated drives */
  followCoord?: [number, number] | null;
  interactive?: boolean;
  bounds?: { ne: [number, number]; sw: [number, number] } | null;
  pitch?: number;
  showUser?: boolean;
  compact?: boolean;
  /** web: keep the map attribution clear of bottom overlays (px) */
  controlsBottomInset?: number;
}

export interface MapDriver {
  id: string;
  name: string;
  carColor: 'silver' | 'black' | 'red';
  lng: number;
  lat: number;
  heading: number;
}

export interface MapPlace {
  id: string;
  title: string;
  category: string;
  lng: number;
  lat: number;
}

export type RoadReportKind = 'police' | 'hidden_police' | 'checkpoint';

export interface MapReport {
  id: string;
  kind: RoadReportKind;
  lng: number;
  lat: number;
}
