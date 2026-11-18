/**
 * Demo voice transport. Simulates a half-duplex push-to-talk channel populated by the Klaipėda demo
 * drivers. Phase 4 swaps this for a LiveKit transport (token from an Edge Function, server-side
 * moderation); the Radio screen only talks to this module's functions.
 */
import { DEMO_DRIVERS, demoDriverPosition, haversine, KLAIPEDA_CENTER, type DemoDriver } from '@roadclub/core';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import i18n from '@/i18n';
import { useTracking } from '@/stores/tracking';
import { radioAudio } from './audio';
import { useRadio, type ChannelKind } from './radioStore';

export const MAX_TRANSMIT_S = 30; // rate limit: a single transmission is cut after 30 s

const FRIENDS = ['rokas', 'ieva', 'greta'];
const MY_CLUB = 'Klaipėda Night Cruisers';

export function channelMembers(kind: ChannelKind, radiusKm: number, now = Date.now()): DemoDriver[] {
  const fix = useTracking.getState().lastFix;
  const me = fix ? { lat: fix.lat, lng: fix.lng } : { lng: KLAIPEDA_CENTER[0], lat: KLAIPEDA_CENTER[1] };
  switch (kind) {
    case 'nearby':
      return DEMO_DRIVERS.filter((d) => {
        const p = demoDriverPosition(d, now);
        return p && haversine(me, p) <= radiusKm * 1000;
      });
    case 'friends': return DEMO_DRIVERS.filter((d) => FRIENDS.includes(d.id));
    case 'club': return DEMO_DRIVERS.filter((d) => d.club === MY_CLUB);
    default: return [];
  }
}

const REPLIES: [string, string][] = [['Supratau, ačiū!', 'Copy that, thanks!'], ['Girdžiu gerai.', 'Loud and clear.'], ['Iki susitikimo!', 'See you there!']];
let speakTimer: ReturnType<typeof setTimeout> | null = null;
let levelTimer: ReturnType<typeof setInterval> | null = null;
let txStart = 0;
let txCut: ReturnType<typeof setTimeout> | null = null;

function lineFor(d: DemoDriver, pool?: [string, string][]): string {
  const lines = pool ?? d.lines;
  const l = lines[Math.floor(Math.random() * lines.length)]!;
  return i18n.language === 'lt' ? l[0] : l[1];
}

/** A demo driver keys up and talks. */
export function receiveFrom(d: DemoDriver, pool?: [string, string][]) {
  const r = useRadio.getState();
  if (r.status !== 'idle' || r.muted.includes(d.id)) return;
  const text = lineFor(d, pool);
  const started = Date.now();
  r.set({ status: 'receiving', speaker: { id: d.id, name: d.name, car: d.car } });
  void radioAudio.squelch('open');
  void Haptics.selectionAsync().catch(() => undefined);
  levelTimer = setInterval(() => useRadio.getState().set({ level: 0.25 + Math.random() * 0.65 }), 90);
  // keep each transmission on air for a realistic minimum, even if speech synthesis ends early
  const minMs = 1400 + text.length * 40;
  let done = false;
  const finish = () => {
    if (done) return;
    const wait = started + minMs - Date.now();
    if (wait > 0) { speakTimer = setTimeout(finish, wait); return; }
    done = true;
    if (levelTimer) clearInterval(levelTimer);
    levelTimer = null;
    void radioAudio.squelch('close');
    const s = useRadio.getState();
    s.push({ id: `${started}-${d.id}`, fromId: d.id, fromName: d.name, car: d.car, text, durationS: (Date.now() - started) / 1000, at: started });
    s.set({ status: 'idle', speaker: null, level: 0 });
  };
  if (r.readAloud && radioAudio.supported) setTimeout(() => radioAudio.speak(text, i18n.language, finish), 180);
  else speakTimer = setTimeout(finish, minMs);
}

export async function startTransmit(): Promise<'ok' | 'listen_only'> {
  const r = useRadio.getState();
  if (r.listenOnly) return 'listen_only';
  if (r.status === 'receiving') { // half-duplex: you take the channel
    radioAudio.stopSpeaking();
    if (speakTimer) clearTimeout(speakTimer);
    if (levelTimer) clearInterval(levelTimer);
  }
  txStart = Date.now();
  r.set({ status: 'transmitting', speaker: null, level: 0 });
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  void radioAudio.squelch('open');
  const mic = await radioAudio.startMic((l) => useRadio.getState().set({ level: l }));
  if (!mic) levelTimer = setInterval(() => useRadio.getState().set({ level: 0.2 + Math.random() * 0.5 }), 110);
  txCut = setTimeout(() => void stopTransmit(), MAX_TRANSMIT_S * 1000);
  return 'ok';
}

export async function stopTransmit() {
  const r = useRadio.getState();
  if (r.status !== 'transmitting') return;
  if (txCut) clearTimeout(txCut);
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = null;
  radioAudio.stopMic();
  void radioAudio.squelch('close');
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  const durationS = (Date.now() - txStart) / 1000;
  r.set({ status: 'idle', level: 0 });
  if (durationS < 0.3) return; // accidental tap
  r.push({ id: `${txStart}-me`, fromId: 'me', fromName: i18n.t('radio.you'), durationS, at: txStart });
  // someone on the channel usually answers
  const members = channelMembers(r.channel, r.radiusKm).filter((d) => !r.muted.includes(d.id));
  if (members.length && Math.random() < 0.7) {
    const d = members[Math.floor(Math.random() * members.length)]!;
    setTimeout(() => receiveFrom(d, REPLIES), 1500 + Math.random() * 1500);
  }
}

/** Ambient channel chatter while the radio is open (every 12–25 s). */
export function useDemoChatter(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = (first = false) => {
      t = setTimeout(() => {
        const r = useRadio.getState();
        const members = channelMembers(r.channel, r.radiusKm).filter((d) => !r.muted.includes(d.id));
        if (members.length) receiveFrom(members[Math.floor(Math.random() * members.length)]!);
        schedule();
      }, first ? 3500 : 12_000 + Math.random() * 13_000);
    };
    schedule(true);
    return () => clearTimeout(t);
  }, [enabled]);
}
