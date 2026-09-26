import { expect } from "vitest";

/** Observe the same late-join protocol as UI consumers, never a state RPC. */
export async function readPreferencesState(bus) {
  const replyTopic = `component:registered:reply:browser-preferences:${Date.now()}`;
  let preferencesState;
  const detach = bus.on(replyTopic, ({ sender, state }) => {
    if (sender === "PreferencesService")
      preferencesState = structuredClone(state);
  });
  try {
    await bus.emit("component:register", {
      name: "BrowserPreferencesProbe",
      replyTopic,
    });
    expect(preferencesState).toBeTruthy();
    return preferencesState;
  } finally {
    detach();
  }
}
