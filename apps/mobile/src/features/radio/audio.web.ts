/**
 * Browser audio for the demo radio: radio squelch tones (Web Audio), a live mic level meter while you
 * hold push-to-talk (your voice never leaves the device in demo mode), and incoming transmissions read
 * aloud with speech synthesis through a band-limited "radio" filter feel (pitch/rate tweaks).
 */
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let raf = 0;

const audioCtx = () => {
  if (!ctx) ctx = new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

function tone(freq: number, start: number, dur: number, gain = 0.08) {
  const c = audioCtx();
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.05) {
  const c = audioCtx();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource(), g = c.createGain(), bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(bp).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export const radioAudio = {
  supported: true,
  async squelch(kind: 'open' | 'close') {
    try {
      if (kind === 'open') { tone(1250, 0, 0.06); tone(1650, 0.07, 0.06); }
      else { noise(0, 0.18); tone(900, 0.02, 0.08, 0.05); }
    } catch { /* autoplay blocked until first interaction */ }
  },
  async startMic(onLevel: (l: number) => void): Promise<boolean> {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const c = audioCtx();
      const an = c.createAnalyser();
      an.fftSize = 512;
      c.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf = requestAnimationFrame(loop);
      };
      loop();
      return true;
    } catch {
      return false; // permission denied or no mic: the UI still works with a simulated meter
    }
  },
  stopMic() {
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach((t) => t.stop()); // release the mic immediately — never kept open
    stream = null;
  },
  speak(text: string, lang: string, onEnd: () => void) {
    const synth = window.speechSynthesis;
    if (!synth) { setTimeout(onEnd, 2500); return; }
    const u = new SpeechSynthesisUtterance(text);
    const want = lang === 'lt' ? 'lt' : 'en';
    u.voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(want)) ?? null;
    u.lang = want === 'lt' ? 'lt-LT' : 'en-GB';
    u.rate = 1.05;
    u.pitch = 0.9;
    u.volume = 0.9;
    let done = false;
    const finish = () => { if (!done) { done = true; onEnd(); } };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, 9000); // some browsers never fire onend without voices
    synth.speak(u);
  },
  stopSpeaking() { window.speechSynthesis?.cancel(); },
};
