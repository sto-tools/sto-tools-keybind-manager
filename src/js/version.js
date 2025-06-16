/**
 * Version display management
 */

document.addEventListener('DOMContentLoaded', () => {
    // Update version in header
    const appVersionElement = document.getElementById('appVersion');
    if (appVersionElement) {
        appVersionElement.textContent = DISPLAY_VERSION;
    }

    // Update version in about modal
    const aboutVersionElement = document.getElementById('aboutVersion');
    if (aboutVersionElement) {
        aboutVersionElement.textContent = DISPLAY_VERSION;
    }
});
