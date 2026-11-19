import type { Club, SharedDrive, Story, Vehicle } from './types';

/** Demo content (fictional profiles). Real data comes from `cars`, `clubs`, `stories` and public `trips` once signed in. */
export const DEMO_VEHICLES: Vehicle[] = [
  { id: 'v1', owner: 'Mantas K.', make: 'BMW', model: 'M550i', year: 2024, color: 'red', fuel: 'Petrol', seats: 5, power: '530 hp', transmission: 'Automatic', engine: '4.4 V8', rating: 4.9, reviews: 112, mods: ['Akrapovič exhaust', 'KW coilovers', 'Carbon lip'], km: 18420, club: 'Klaipėda M-Club' },
  { id: 'v2', owner: 'Greta V.', make: 'Audi', model: 'RS3', year: 2022, color: 'silver', fuel: 'Petrol', seats: 5, power: '400 hp', transmission: 'Automatic', engine: '2.5 I5', rating: 4.8, reviews: 76, mods: ['Milltek downpipe', 'Stage 1 tune'], km: 31200, club: 'Baltic Quattro' },
  { id: 'v3', owner: 'Tomas R.', make: 'Toyota', model: 'GR86', year: 2023, color: 'blue', fuel: 'Petrol', seats: 4, power: '234 hp', transmission: 'Manual', engine: '2.4 H4', rating: 4.9, reviews: 58, mods: ['Bride seats', 'Sway bars'], km: 9800, club: 'Coast Cruisers' },
  { id: 'v4', owner: 'Ieva S.', make: 'Porsche', model: '911 Carrera', year: 2019, color: 'black', fuel: 'Petrol', seats: 4, power: '385 hp', transmission: 'PDK', engine: '3.0 F6 turbo', rating: 5.0, reviews: 41, mods: ['Stock + PPF'], km: 24150 },
  { id: 'v5', owner: 'Darius P.', make: 'Mercedes-AMG', model: 'C63 S', year: 2018, color: 'white', fuel: 'Petrol', seats: 5, power: '510 hp', transmission: 'Automatic', engine: '4.0 V8 biturbo', rating: 4.7, reviews: 93, mods: ['Armytrix exhaust'], km: 67200, club: 'AMG Baltics' },
  { id: 'v6', owner: 'Lukas B.', make: 'Volkswagen', model: 'Golf R', year: 2021, color: 'blue', fuel: 'Petrol', seats: 5, power: '320 hp', transmission: 'DSG', engine: '2.0 I4 turbo', rating: 4.8, reviews: 64, mods: ['Intake', 'H&R springs'], km: 42310, club: 'Coast Cruisers' },
];

export const DEMO_CLUBS: Club[] = [
  { id: 'c1', name: 'Coast Cruisers', city: 'Klaipėda', members: 214, blurb: 'Sunday sunset drives along the Curonian Spit.', color: '#F04349' },
  { id: 'c2', name: 'Klaipėda M-Club', city: 'Klaipėda', members: 168, blurb: 'M-cars only. Monthly meets at Akropolis.', color: '#2F6BFF' },
  { id: 'c3', name: 'Baltic Quattro', city: 'Vilnius', members: 342, blurb: 'Audi owners across the Baltics.', color: '#0E0F13' },
  { id: 'c4', name: 'Via Baltica Crew', city: 'Kaunas', members: 97, blurb: 'Weekend road trips, Riga ↔ Tallinn runs.', color: '#F2B33D' },
  { id: 'c5', name: 'Old Town Classics', city: 'Palanga', members: 76, blurb: 'Youngtimers and classics. Coffee first.', color: '#118A4E' },
];

export const DEMO_STORIES: Story[] = [
  { id: 's1', user: 'Mantas', initials: 'MK', car: 'BMW M550i', caption: 'Sunrise at Giruliai', color: '#F04349', hoursAgo: 1 },
  { id: 's2', user: 'Greta', initials: 'GV', car: 'Audi RS3', caption: 'Fresh wash ✨', color: '#7D838C', hoursAgo: 3 },
  { id: 's3', user: 'Tomas', initials: 'TR', car: 'Toyota GR86', caption: 'Spit run with the crew', color: '#2F6BFF', hoursAgo: 5 },
  { id: 's4', user: 'Ieva', initials: 'IS', car: 'Porsche 911', caption: 'Coffee stop in Nida', color: '#0E0F13', hoursAgo: 8 },
  { id: 's5', user: 'Darius', initials: 'DP', car: 'AMG C63 S', caption: 'New exhaust, new sound', color: '#B9BEC6', hoursAgo: 11 },
  { id: 's6', user: 'Lukas', initials: 'LB', car: 'Golf R', caption: 'Meet at Akropolis tonight', color: '#2F6BFF', hoursAgo: 14 },
];

export const DEMO_DRIVES: SharedDrive[] = [
  { id: 'd1', user: 'Mantas K.', initials: 'MK', title: 'Old Town → Giruliai sunrise loop', km: 24.6, minutes: 38, newHexes: 12, car: 'BMW M550i', hoursAgo: 2, likes: 48 },
  { id: 'd2', user: 'Tomas R.', initials: 'TR', title: 'Curonian Spit full length', km: 96.2, minutes: 118, newHexes: 41, car: 'Toyota GR86', hoursAgo: 6, likes: 131 },
  { id: 'd3', user: 'Greta V.', initials: 'GV', title: 'Kaunas evening loop', km: 31.4, minutes: 52, newHexes: 7, car: 'Audi RS3', hoursAgo: 20, likes: 37 },
];
