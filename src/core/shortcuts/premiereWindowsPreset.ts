import type { BindingMap } from "./types";

export const PRESET_ID = "premiere-windows";
export const PRESET_NAME = "Premiere Pro — Windows";

/**
 * Default bindings compatible with Adobe Premiere Pro on Windows for the
 * commands L30 CUT AI supports. Combos use event.code, so they are keyboard
 * layout independent. Original implementation — no Adobe assets involved.
 */
export const PREMIERE_WINDOWS_PRESET: BindingMap = {
  // Tools
  "tool.selection": ["KeyV"],
  "tool.trackSelectForward": ["KeyA"],
  "tool.trackSelectBackward": ["Shift+KeyA"],
  "tool.rippleEdit": ["KeyB"],
  "tool.rollingEdit": ["KeyN"],
  "tool.rateStretch": ["KeyR"],
  "tool.razor": ["KeyC"],
  "tool.slip": ["KeyY"],
  "tool.slide": ["KeyU"],
  "tool.pen": ["KeyP"],
  "tool.hand": ["KeyH"],
  "tool.zoom": ["KeyZ"],
  "tool.text": ["KeyT"],

  // Playback
  "playback.toggle": ["Space"],
  "playback.reverse": ["KeyJ"],
  "playback.stop": ["KeyK"],
  "playback.forward": ["KeyL"],

  // Marks
  "marks.in": ["KeyI"],
  "marks.out": ["KeyO"],
  "marks.gotoIn": ["Shift+KeyI"],
  "marks.gotoOut": ["Shift+KeyO"],
  "marks.clear": ["Ctrl+Shift+KeyX"],
  "marks.addMarker": ["KeyM"],

  // Edits
  "edit.addEdit": ["Ctrl+KeyK"],
  "edit.addEditAllTracks": ["Ctrl+Shift+KeyK"],
  "edit.delete": ["Delete"],
  "edit.rippleDelete": ["Shift+Delete", "Alt+Backspace"],
  "edit.undo": ["Ctrl+KeyZ"],
  "edit.redo": ["Ctrl+Shift+KeyZ", "Ctrl+KeyY"],

  // File
  "file.save": ["Ctrl+KeyS"],
  "file.import": ["Ctrl+KeyI"],
  "file.export": ["Ctrl+KeyM"],

  // Selection
  "select.all": ["Ctrl+KeyA"],
  "select.none": ["Ctrl+Shift+KeyA"],

  // Clip
  "audio.gain": ["KeyG"],
  "clip.speed": ["Ctrl+KeyR"],
  "edit.openTrim": ["Shift+KeyT"],
  "effects.fadeIn": ["Shift+KeyF"],
  "effects.fadeOut": ["Ctrl+Shift+KeyF"],
  "clip.link": ["Ctrl+KeyL"],
  "clip.unlink": ["Ctrl+Shift+KeyL"],

  // View
  "timeline.toggleSnap": ["KeyS"],
  "view.zoomIn": ["Equal", "NumpadAdd"],
  "view.zoomOut": ["Minus", "NumpadSubtract"],

  // Navigation
  "nav.home": ["Home"],
  "nav.end": ["End"],
  "nav.frameBack": ["ArrowLeft"],
  "nav.frameForward": ["ArrowRight"],
  "nav.fiveBack": ["Shift+ArrowLeft"],
  "nav.fiveForward": ["Shift+ArrowRight"],
  "nav.nudgeLeft": ["Alt+ArrowLeft"],
  "nav.nudgeRight": ["Alt+ArrowRight"],
  "nav.nudgeLeft5": ["Alt+Shift+ArrowLeft"],
  "nav.nudgeRight5": ["Alt+Shift+ArrowRight"],
  "nav.prevEdit": ["PageUp"],
  "nav.nextEdit": ["PageDown"],

  // App
  "app.shortcuts": ["Ctrl+Alt+KeyK"],
  "app.palette": ["Ctrl+Shift+KeyP"],
  "app.cancel": ["Escape"],
};
