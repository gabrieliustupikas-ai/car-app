/**
 * The Radio tab's hardware: a dash-mounted CB-style unit. Brushed-silver faceplate with corner screws,
 * a red-backlit LCD (channel · range · status · signal), a rotary RANGE knob, preset channel keys and a
 * full-width red push-to-talk key. Built from plain views so it scales and themes without image assets.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { ChannelKind, RadioStatus } from '@/features/radio/radioStore';
import { CHROME } from '@/theme/tokens';

const LCD_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });
const LCD_RED = '#FF4136';
const LCD_DIM = 'rgba(255,65,54,0.22)';
const RADII = [1, 2, 5, 10] as const;

export interface RadioUnitProps {
  status: RadioStatus;
  channel: ChannelKind;
  channelLabel: string;
  radiusKm: (typeof RADII)[number];
  level: number;
  inRange: number;
  /** text for the LCD's main line, e.g. "READY", "TX 03.2", "RX ROKAS K." */
  display: string;
  listenOnly: boolean;
  labels: { range: string; ptt: string; presets: Record<'nearby' | 'friends' | 'club', string>; inRange: string };
  onRadius: (km: (typeof RADII)[number]) => void;
  onChannel: (c: ChannelKind) => void;
  onPttIn: () => void;
  onPttOut: () => void;
}

function Screw({ style }: { style: object }) {
  return (
    <View style={[styles.screw, style]}>
      <View style={styles.screwSlot} />
    </View>
  );
}

/** Rotary knob: knurled silver cap; the notch points at the selected range. Tap to step to the next range. */
function RangeKnob({ radiusKm, onNext, label }: { radiusKm: number; onNext: () => void; label: string }) {
  const idx = Math.max(0, RADII.indexOf(radiusKm as (typeof RADII)[number]));
  const rot = useSharedValue(idx);
  useEffect(() => { rot.value = withSpring(idx, { damping: 14, stiffness: 160 }); }, [idx, rot]);
  const cap = useAnimatedStyle(() => ({ transform: [{ rotate: `${-120 + rot.value * 80}deg` }] }));
  return (
    <View style={styles.knobWrap}>
      {RADII.map((r, i) => {
        const a = ((-120 + i * 80 - 90) * Math.PI) / 180;
        return (
          <Text key={r} style={[styles.knobTick, { left: 44 + Math.cos(a) * 52 - 12, top: 44 + Math.sin(a) * 52 - 7, color: i === idx ? '#111' : '#5A5F66' }]}>{r}</Text>
        );
      })}
      <Pressable accessibilityRole="adjustable" accessibilityLabel={`${label} ${radiusKm} km`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={() => onNext()}
        onPress={onNext} style={styles.knobBase}>
        <Animated.View style={[styles.knobCap, cap]}>
          <LinearGradient colors={['#F6F7F9', '#9EA4AC', '#D9DDE2', '#7E848C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {Array.from({ length: 24 }, (_, i) => (
            <View key={i} style={[styles.knurl, { transform: [{ rotate: `${i * 15}deg` }] }]} />
          ))}
          <View style={styles.knobFace} />
          <View style={styles.knobNotch} />
        </Animated.View>
      </Pressable>
      <Text style={styles.engraved}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function RadioUnit(p: RadioUnitProps) {
  const tx = p.status === 'transmitting';
  const rx = p.status === 'receiving';
  const press = useSharedValue(0);
  useEffect(() => { press.value = withTiming(tx ? 1 : 0, { duration: 90 }); }, [tx, press]);
  const pttStyle = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 2 }], opacity: 1 - press.value * 0.04 }));
  const bars = 10;
  const lit = tx || rx ? Math.round(Math.max(0.1, p.level) * bars) : 0;
  const nextRadius = () => {
    void Haptics.selectionAsync();
    p.onRadius(RADII[(RADII.indexOf(p.radiusKm) + 1) % RADII.length]!);
  };

  return (
    <View style={styles.unit}>
      {/* antenna stub on the top-left corner */}
      <View style={styles.antenna} />
      <View style={styles.face}>
        <LinearGradient colors={[...CHROME]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.2 }} style={StyleSheet.absoluteFill} />
        {/* brushed-metal grain */}
        {Array.from({ length: 34 }, (_, i) => (
          <View key={i} style={[styles.grain, { top: 6 + i * 9, opacity: i % 3 === 0 ? 0.16 : 0.07 }]} />
        ))}
        <Screw style={{ top: 9, left: 9 }} />
        <Screw style={{ top: 9, right: 9 }} />
        <Screw style={{ bottom: 9, left: 9 }} />
        <Screw style={{ bottom: 9, right: 9 }} />

        <View style={styles.topRow}>
          {/* LCD */}
          <View style={styles.lcdBezel} accessibilityLiveRegion="polite" accessibilityLabel={`${p.channelLabel}, ${p.display}`}>
            <View style={styles.lcd}>
              <View style={styles.lcdRow}>
                <Text style={[styles.lcdSmall, { flexShrink: 1 }]} numberOfLines={1}>CH {p.channelLabel.toUpperCase()}</Text>
                <View style={[styles.led, { backgroundColor: tx ? LCD_RED : rx ? '#F2B33D' : '#3A1110' }]} />
              </View>
              <Text style={styles.lcdBig} numberOfLines={1} adjustsFontSizeToFit>{p.display}</Text>
              <View style={styles.lcdRow}>
                <Text style={[styles.lcdSmall, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>
                  {p.channel === 'nearby' ? `${String(p.radiusKm).padStart(2, '0')}KM` : '--KM'} · {p.inRange} {p.labels.inRange.toUpperCase()}
                </Text>
                <View style={styles.meter}>
                  {Array.from({ length: bars }, (_, i) => (
                    <View key={i} style={[styles.meterSeg, { height: 4 + i * 1.2, backgroundColor: i < lit ? LCD_RED : LCD_DIM }]} />
                  ))}
                </View>
              </View>
            </View>
          </View>
          <RangeKnob radiusKm={p.radiusKm} onNext={nextRadius} label={p.labels.range} />
        </View>

        {/* preset channel keys */}
        <View style={styles.presets}>
          {(['nearby', 'friends', 'club'] as const).map((c, i) => {
            const on = p.channel === c;
            return (
              <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.labels.presets[c]}
                onPress={() => { void Haptics.selectionAsync(); p.onChannel(c); }} style={[styles.key, on && styles.keyOn]}>
                <Text style={[styles.keyNum, on && { color: '#E3262C' }]}>{i + 1}</Text>
                <Text style={[styles.keyLabel, on && { color: '#111' }]}>{p.labels.presets[c].toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* push-to-talk key */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={p.labels.ptt}
          accessibilityState={{ disabled: p.listenOnly, selected: tx }}
          disabled={p.listenOnly}
          onPressIn={p.onPttIn}
          onPressOut={p.onPttOut}
          style={styles.pttWell}
        >
          <Animated.View style={[styles.ptt, { backgroundColor: p.listenOnly ? '#5A5F66' : tx ? '#FF2E24' : '#C9161C' }, pttStyle]}>
            <View style={styles.pttGrip}>
              {Array.from({ length: 7 }, (_, i) => <View key={i} style={styles.pttRib} />)}
            </View>
            <View style={styles.pttLabelRow}>
              <Ionicons name={tx ? 'radio' : 'mic'} size={22} color="#FFFFFF" />
              <Text style={styles.pttText}>{p.labels.ptt.toUpperCase()}</Text>
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  unit: { width: '100%', maxWidth: 380, alignSelf: 'center', paddingTop: 26 },
  antenna: { position: 'absolute', top: 0, left: 34, width: 12, height: 34, borderRadius: 6, backgroundColor: '#1A1C20', borderWidth: 1, borderColor: '#2A2D33' },
  face: {
    borderRadius: 26, overflow: 'hidden', padding: 18, paddingTop: 22, gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)',
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 14,
  },
  grain: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#FFFFFF' },
  screw: { position: 'absolute', width: 11, height: 11, borderRadius: 6, backgroundColor: '#8E949C', borderWidth: 1, borderColor: '#6B7078', alignItems: 'center', justifyContent: 'center' },
  screwSlot: { width: 7, height: 1.5, backgroundColor: '#4A4F56', transform: [{ rotate: '35deg' }] },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lcdBezel: { flex: 1, borderRadius: 12, padding: 5, backgroundColor: '#1B1D21', borderWidth: 1, borderColor: '#0E0F11' },
  lcd: { borderRadius: 8, backgroundColor: '#160606', paddingHorizontal: 10, paddingVertical: 8, gap: 2, minHeight: 104, justifyContent: 'space-between' },
  lcdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  lcdSmall: { fontFamily: LCD_FONT, color: LCD_RED, fontSize: 11, letterSpacing: 1, opacity: 0.85 },
  lcdBig: { fontFamily: LCD_FONT, color: LCD_RED, fontSize: 28, fontWeight: '700', letterSpacing: 2, textShadowColor: 'rgba(255,65,54,0.55)', textShadowRadius: 8 },
  led: { width: 8, height: 8, borderRadius: 4 },
  meter: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  meterSeg: { width: 3, borderRadius: 1 },
  knobWrap: { width: 88, height: 112, alignItems: 'center' },
  knobBase: { marginTop: 14, width: 64, height: 64, borderRadius: 32, backgroundColor: '#2A2D32', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  knobCap: { width: 58, height: 58, borderRadius: 29, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  knurl: { position: 'absolute', width: 1.5, height: 58, backgroundColor: 'rgba(0,0,0,0.18)' },
  knobFace: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C9CDD3', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  knobNotch: { position: 'absolute', top: 6, width: 4, height: 14, borderRadius: 2, backgroundColor: '#E3262C' },
  knobTick: { position: 'absolute', width: 24, textAlign: 'center', fontSize: 10, fontWeight: '800' },
  engraved: { marginTop: 4, fontSize: 9, fontWeight: '800', letterSpacing: 1.6, color: '#3E4248' },
  presets: { flexDirection: 'row', gap: 10 },
  key: { flex: 1, minHeight: 48, borderRadius: 10, backgroundColor: '#2A2D32', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: '#141518' },
  keyOn: { backgroundColor: '#E6E9ED', borderBottomColor: '#9EA4AC' },
  keyNum: { fontSize: 11, fontWeight: '900', color: '#C7CCD3' },
  keyLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#C7CCD3' },
  pttWell: { borderRadius: 18, backgroundColor: '#1B1D21', padding: 4 },
  ptt: { minHeight: 92, borderRadius: 15, alignItems: 'center', justifyContent: 'center', gap: 8, borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.35)' },
  pttGrip: { flexDirection: 'row', gap: 6 },
  pttRib: { width: 22, height: 3, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.22)' },
  pttLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pttText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 2.4 },
});
