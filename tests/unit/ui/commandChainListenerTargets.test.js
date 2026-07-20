import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureCommandChainListenerTargets } from "../../../src/js/components/ui/commandChainListenerTargets.js";

describe("command-chain injected listener targets", () => {
  const realms = [];

  afterEach(() => {
    for (const realm of realms.splice(0)) realm.window.close();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  function createRealm(markup = "") {
    const realm = new JSDOM(`<!doctype html><body>${markup}</body>`, {
      url: "https://command-chain.example",
    });
    realms.push(realm);
    return realm;
  }

  it("creates four frozen targets without touching the ambient document", () => {
    const realm = createRealm();
    const ambientListener = vi.spyOn(document, "addEventListener");
    const injectedListener = vi.spyOn(
      realm.window.document,
      "addEventListener",
    );

    const targets = captureCommandChainListenerTargets(realm.window.document);
    const values = Object.values(targets);

    expect(Object.isFrozen(targets)).toBe(true);
    expect(new Set(values).size).toBe(4);
    expect(values.every((target) => Object.isFrozen(target))).toBe(true);
    expect(ambientListener).not.toHaveBeenCalled();
    expect(injectedListener).not.toHaveBeenCalled();
  });

  it("delegates capture inside the injected document across insertion and replacement", () => {
    const realm = createRealm();
    document.body.innerHTML = `
      <div id="commandList"><button class="ambient-row">ambient</button></div>
    `;
    const targets = captureCommandChainListenerTargets(realm.window.document);
    const phases = [];
    const handler = vi.fn((event) => phases.push(event.eventPhase));
    targets.commandList.addEventListener("click", handler);

    document.querySelector(".ambient-row").click();
    expect(handler).not.toHaveBeenCalled();

    realm.window.document.body.innerHTML = `
      <div id="commandList"><button class="injected-row">first</button></div>
    `;
    const first = realm.window.document.querySelector(".injected-row");
    first.addEventListener("click", (event) => event.stopPropagation());
    first.dispatchEvent(
      new realm.window.MouseEvent("click", { bubbles: true }),
    );
    expect(handler).toHaveBeenCalledOnce();

    realm.window.document.getElementById("commandList").outerHTML = `
      <div id="commandList"><button class="replacement-row">second</button></div>
    `;
    realm.window.document
      .querySelector(".replacement-row")
      .dispatchEvent(new realm.window.MouseEvent("click", { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(phases).toEqual([
      realm.window.Event.CAPTURING_PHASE,
      realm.window.Event.CAPTURING_PHASE,
    ]);

    targets.commandList.removeEventListener("click", handler);
    realm.window.document.querySelector(".replacement-row").click();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("is inert for partial document doubles without listener methods", () => {
    const partialDocument = /** @type {Document} */ (
      /** @type {unknown} */ ({})
    );
    const targets = captureCommandChainListenerTargets(partialDocument);
    const handler = vi.fn();

    expect(() => {
      targets.copyAlias.addEventListener("click", handler);
      targets.copyAlias.removeEventListener("click", handler);
    }).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
