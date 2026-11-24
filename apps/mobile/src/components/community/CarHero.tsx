import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { Vehicle } from '@/features/community/types';

const TINT: Record<Vehicle['color'], string> = { red: '#E3262C', silver: '#C7CCD3', black: '#2A2D32', white: '#F4F5F7', blue: '#3B6FD9' };

/** Illustrated hero for a car (no photo needed). Swap for an <Image> once users upload photos. */
export function CarHero({ color, height = 190, round = 26 }: { color: Vehicle['color']; height?: number; round?: number }) {
  return (
    // dark studio: graphite backdrop, a lit floor and a soft reflection under the car
    <LinearGradient colors={['#1B1E23', '#121417', '#2A2E34']} locations={[0, 0.62, 1]} style={{ height, borderRadius: round, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
      <Ionicons name="car-sport" size={height * 0.72} color={TINT[color]}
        style={{ marginBottom: -height * 0.06, textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 16, textShadowOffset: { width: 0, height: 10 } }} />
    </LinearGradient>
  );
}
