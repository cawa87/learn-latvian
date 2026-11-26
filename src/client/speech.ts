export function speakLatvian(
  text: string,
  callbacks?: { onStart?: () => void; onEnd?: () => void }
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    callbacks?.onEnd?.();
    return false;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'lv-LV';
    utterance.rate = 0.92;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const lvVoice =
      voices.find((v) => v.lang.toLowerCase() === 'lv-lv') ||
      voices.find((v) => v.lang.toLowerCase().startsWith('lv'));
    if (lvVoice) {
      utterance.voice = lvVoice;
    }

    utterance.onstart = () => callbacks?.onStart?.();
    utterance.onend = () => callbacks?.onEnd?.();
    utterance.onerror = () => callbacks?.onEnd?.();

    callbacks?.onStart?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    callbacks?.onEnd?.();
    return false;
  }
}
