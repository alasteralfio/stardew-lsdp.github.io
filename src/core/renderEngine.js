import { TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, LAYERS } from "./constants.js";

const canvases = {};
const ctx = {};
let fabricCanvas = null; // For the interactive layer (OBJECTS)

// --- Initialisation ---
function initCanvases() {
    // TODO: Populate the canvases and ctx objects for layers 0,1,2,4
    // TODO: Initialize Fabric.js on layer-3 (OBJECTS)
    console.log("Canvases initialized");
}

// --- Rendering Functions ---
function drawBackground() {
    // TODO: Load and draw 'assets/locations/farm_standard.png' on layer-0
    console.log("Drawing background");
}

function drawGrid() {
    // TODO: Draw a crisp 16x16 grid on the OVERLAY layer (layer-4)
    // Remember: Use x + 0.5, y + 0.5 for sharp lines!
    console.log("Drawing grid");
}

// Helper function for Y-sorting (CRITICAL for visual layering)
function ySortPlacements(placementsArray) {
    // Sorts by gridY so objects higher on screen (lower gridY) draw first.
    return [...placementsArray].sort((a, b) => a.gridY - b.gridY);
}

function drawAllObjects() {
    if (!fabricCanvas) return;
    fabricCanvas.clear();

    // Get current location's placements
    const currentLocation = appState.modifiedLocations.find(
        (loc) => loc.locationKey === appState.currentView.locationKey
    );
    if (!currentLocation) return;

    // Combine placements
    let allPlacements = [...currentLocation.directPlacements]; // incomplete

    // Y-sort for correct visual order
    const sortedPlacements = ySortPlacements(allPlacements);

    // Draw each placement
    sortedPlacements.forEach((placement) => {
        console.log(
            "Should draw:",
            placement.objectKey,
            "at grid [",
            placement.gridX,
            ",",
            placement.gridY,
            "]" // incomplete
        );
        // TODO: Fetch object definition from objects.json
        // TODO: Calculate pixel position
        // TODO: Draw sprite based on spriteType ('single' or 'atlas')
    });
}

// --- Public API ---
function init() {
    console.log("Initializing Render Engine");
    initCanvases();
    drawBackground();
    drawGrid();
    drawAllObjects();
}

// Expose to window for index.html to call
window.renderEngine = { init };
