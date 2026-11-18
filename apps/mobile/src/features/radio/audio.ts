/**
 * Native audio for the demo radio: squelch is a haptic tick; incoming messages show as captions.
 * Phase 4 replaces this with LiveKit (WebRTC) audio tracks — same interface.
 */
import * as Haptics from 'expo-haptics';

export const radioAudio = {
  supported: false,
  async squelch(kind: 'open' | 'close') {
    await Haptics.impactAsync(kind === 'open' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  async startMic(_onLevel: (l: number) => void): Promise<boolean> { return false; },
  stopMic() {},
  speak(_text: string, _lang: string, onEnd: () => void) { setTimeout(onEnd, 2500); },
  stopSpeaking() {},
};
