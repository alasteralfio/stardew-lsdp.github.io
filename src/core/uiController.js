// src/core/uiController.js
// Central UI controller for managing all UI interactions and state

class UIController {
    constructor(appState) {
        this.appState = appState;
        this.init();
    }

    init() {
        this.setupCursorTracking();
        this.setupStatusBar();
        console.log('UI Controller initialized');
    }

    setupCursorTracking() {
        // Cursor coordinates are updated in interactionHandler.js
        // This ensures the status bar shows current cursor position
    }

    setupStatusBar() {
        // Status bar is updated when objects are selected
        // Initial state
        this.updateSelectedObject(null);
    }

    updateSelectedObject(objectName) {
        const statusElement = document.getElementById('selected-object');
        if (statusElement) {
            statusElement.textContent = objectName ? `Selected: ${objectName}` : 'Selected: None';
        }
    }

    updateCursorCoordinates(gridX, gridY) {
        const coordsElement = document.getElementById('cursor-coords');
        if (coordsElement) {
            coordsElement.textContent = `X: ${gridX}, Y: ${gridY}`;
        }
    }
}

export { UIController };