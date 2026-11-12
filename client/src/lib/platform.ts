// Is this a Mac/iPhone/iPad? (decides whether shortcuts are shown as ⌘ or Ctrl)
export const isApple =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

/** "⌘" on Apple devices, "Ctrl" elsewhere. */
export const MOD_KEY = isApple ? "⌘" : "Ctrl";
