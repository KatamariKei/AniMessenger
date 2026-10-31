/** Prepare on genuine view activity; never wait for this before sending a chat. */
export function prepareChatOnActivity(prepare: () => Promise<unknown>, surfaces = { window, document }, intentTarget?: EventTarget | null, now = Date.now) {
  let lastAttempt = -Infinity;
  const warm = () => {
    if (surfaces.document.visibilityState !== "visible" || now() - lastAttempt < 30000) return;
    lastAttempt = now();
    void prepare().catch(() => { /* Best effort; regular chat retains its errors. */ });
  };
  surfaces.window.addEventListener("focus", warm);
  surfaces.document.addEventListener("visibilitychange", warm);
  for (const event of ["focus", "pointerdown", "keydown"]) intentTarget?.addEventListener(event, warm);
  warm();
  return () => {
    surfaces.window.removeEventListener("focus", warm);
    surfaces.document.removeEventListener("visibilitychange", warm);
    for (const event of ["focus", "pointerdown", "keydown"]) intentTarget?.removeEventListener(event, warm);
  };
}
