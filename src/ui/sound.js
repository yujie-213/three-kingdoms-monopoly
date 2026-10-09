// Small locally synthesized cues. No media files, requests or autoplay.
let context;
export function playCue(kind) {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    const time = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.value = kind === 'ROLL' ? 440 : kind === 'BANKRUPT' ? 180 : 660;
    gain.gain.setValueAtTime(0.07, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    oscillator.start(time); oscillator.stop(time + 0.13);
  } catch { /* Audio restrictions must not interrupt gameplay. */ }
}
