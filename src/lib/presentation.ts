// Best-effort fullscreen + landscape lock, shared by every place that opens
// a "the phone becomes the game/TV screen" view. Both browser APIs need a
// real user gesture and neither is universally supported (desktop ignores
// orientation locking outright, some mobile browsers restrict fullscreen
// too) - so this always fails silently and the layout underneath already
// reads fine without it. Call it directly inside a click handler, before
// any `await` if possible, so it's still within the gesture.
export async function enterPresentationMode() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    // ignored - optional
  }
  try {
    const orientation = (screen as any).orientation;
    if (orientation?.lock) {
      await orientation.lock('landscape');
    }
  } catch {
    // ignored - not supported everywhere (usually needs fullscreen + mobile)
  }
}
