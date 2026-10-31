// @openuidev/react-lang mounts its "OpenUI Inspect" widget into document.body
// in development: a fixed 40px button in the bottom-right corner that sits on
// top of the chat composer's send button. The library skips the mount when
// this flag is already set, so this module must be imported before it.
(globalThis as Record<symbol, unknown>)[Symbol.for("openui.devtools.autoMount")] = true;

export {};
