import { describe, expect, it } from "vitest";

describe("Application browser smoke", () => {
  it("boots the translated shell and handles the settings menu", () => {
    const appContainer = document.querySelector(".app-container");
    const translatedHeading = document.querySelector(
      'h1 [data-i18n="sto_tools_keybind_manager"]',
    );
    const version = document.getElementById("appVersion");
    const profileSelect = document.getElementById("profileSelect");
    const settingsButton = document.getElementById("settingsBtn");
    const settingsDropdown = settingsButton?.closest(".dropdown");
    const importDropdown = document
      .getElementById("importMenuBtn")
      ?.closest(".dropdown");

    expect(appContainer).toBeTruthy();
    expect(document.title.trim()).not.toBe("");
    expect(translatedHeading?.textContent.trim()).toBe(document.title.trim());
    expect(version?.textContent.trim()).not.toBe("");
    expect(settingsButton?.title.trim()).not.toBe("");
    expect(window.stoKeybinds?.isInitialized?.()).toBe(true);
    expect(
      Array.from(profileSelect?.options || []).some(
        (option) => !option.disabled && Boolean(option.value),
      ),
    ).toBe(true);

    expect(settingsDropdown?.classList.contains("active")).toBe(false);

    settingsButton?.click();

    expect(settingsDropdown?.classList.contains("active")).toBe(true);
    expect(importDropdown?.classList.contains("active")).toBe(false);

    document.body.click();

    expect(settingsDropdown?.classList.contains("active")).toBe(false);
  });
});
