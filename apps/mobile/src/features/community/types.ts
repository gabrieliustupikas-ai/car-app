import type { MapDriver, RoadReportKind } from '@/components/map/types';

export type { RoadReportKind };

export interface RoadReport {
  id: string;
  kind: RoadReportKind;
  lng: number;
  lat: number;
  confirms: number;
  createdAt: number;
  expiresAt: number;
  mine?: boolean;
}

export interface OnlineDriver extends MapDriver {
  car?: string;
  level?: number;
  club?: string;
  demo?: boolean;
}

export interface CruiseInvite {
  id: string;
  toId: string;
  toName: string;
  message: string;
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined';
}

export interface Vehicle {
  id: string;
  owner: string;
  make: string;
  model: string;
  year: number;
  color: 'red' | 'silver' | 'black' | 'white' | 'blue';
  fuel: string;
  seats: number;
  power: string;
  transmission: string;
  engine: string;
  rating: number;
  reviews: number;
  mods: string[];
  km: number;
  club?: string;
  photo?: string;
}

export interface Club {
  id: string;
  name: string;
  city: string;
  members: number;
  blurb: string;
  color: string;
  joined?: boolean;
}

export interface Story {
  id: string;
  user: string;
  initials: string;
  car: string;
  caption: string;
  color: string;
  hoursAgo: number;
}

export interface SharedDrive {
  id: string;
  user: string;
  initials: string;
  title: string;
  km: number;
  minutes: number;
  newHexes: number;
  car: string;
  hoursAgo: number;
  likes: number;
}
