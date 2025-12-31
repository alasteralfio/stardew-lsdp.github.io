import { TILE_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT, LAYERS } from "./constants.js";

const canvases = {};
const ctx = {};
let fabricCanvas = null; // For the interactive layer (OBJECTS)

// --- Initialisation ---
function initCanvases() {
    // Layer IDs matching your HTML and the order in LAYERS constant
    const layerIds = ["layer-0", "layer-1", "layer-2", "layer-3", "layer-4"];
    const layerNames = ["terrain", "walls", "paths", "objects", "overlay"];

    // Initialize standard canvas layers (0, 1, 2, 4)
    for (let i = 0; i < layerIds.length; i++) {
        const id = layerIds[i];
        const name = layerNames[i];

        // Get the canvas element from the DOM
        const canvasElement = document.getElementById(id);
        if (!canvasElement) {
            console.error(`Canvas element #${id} not found!`);
            continue; // Skip this canvas
        }

        // Store the element reference
        canvases[name] = canvasElement;

        // Set the canvas dimensions (makes drawing area match our game world)
        canvasElement.width = CANVAS_WIDTH;
        canvasElement.height = CANVAS_HEIGHT;

        // For layer-3 use Fabric.js
        if (id !== "layer-3") {
            // Get the 2D drawing context for native canvas operations
            const context = canvasElement.getContext("2d");
            if (!context) {
                console.error(`Could not get 2D context for #${id}`);
                continue;
            }

            // Store the context reference for drawing functions
            ctx[name] = context;

            context.imageSmoothingEnabled = false; // For pixel art
        }

        console.log(`Initialized ${name} layer: ${id}`);
    }

    // Initialize Fabric.js for the interactive objects layer (layer-3)
    const interactiveCanvas = canvases.objects;
    if (interactiveCanvas) {
        // Create Fabric.js canvas wrapper
        fabricCanvas = new fabric.Canvas("layer-3", {
            selection: false, // Disable default selection boxes
            preserveObjectStacking: true, // Crucial for correct object layering
            hoverCursor: "grab", // Cursor when hovering over objects
            moveCursor: "grabbing", // Cursor when dragging objects
            backgroundColor: "transparent", // Let lower layers show through
        });

        // Set Fabric canvas dimensions (Fabric manages its own internal dimensions)
        fabricCanvas.setWidth(CANVAS_WIDTH);
        fabricCanvas.setHeight(CANVAS_HEIGHT);

        // Disable right-click context menu on this canvas
        fabricCanvas.upperCanvasEl.oncontextmenu = function (e) {
            e.preventDefault();
            return false;
        };

        console.log("Initialized Fabric.js canvas for interactive objects");
    } else {
        console.error(
            "Could not find interactive canvas element for Fabric.js"
        );
    }

    console.log("All canvases initialized successfully");
    console.log("Canvas dimensions:", CANVAS_WIDTH, "x", CANVAS_HEIGHT);
    console.log("Tile size:", TILE_SIZE, "pixels");
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
