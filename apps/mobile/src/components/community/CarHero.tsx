import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Vehicle } from '@/features/community/types';

const TINT: Record<Vehicle['color'], string> = { red: '#F04349', silver: '#B9BEC6', black: '#1A1C20', white: '#FFFFFF', blue: '#2F6BFF' };

/** Illustrated hero for a car (no photo needed). Swap for an <Image> once users upload photos. */
export function CarHero({ color, height = 190, round = 26 }: { color: Vehicle['color']; height?: number; round?: number }) {
  return (
    <LinearGradient colors={['#BFD4F2', '#E6EEF9', '#F7F8FB']} style={{ height, borderRadius: round, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
      <Ionicons name="car-sport" size={height * 0.72} color={TINT[color]}
        style={{ marginBottom: -height * 0.06, textShadowColor: 'rgba(20,24,40,0.28)', textShadowRadius: 14, textShadowOffset: { width: 0, height: 8 } }} />
    </LinearGradient>
  );
}
