import { TILE_SIZE } from "./constants.js";
import { loadLocations, setCurrentLocation, getCurrentLocation } from './locationManager.js';
import { loadSprite, fetchObjectDefinition } from './assetLoader.js';
import { ySortPlacements, gridToPixel } from './renderHelpers.js';
import { initInteractions } from './interactionHandler.js';
import { initViewportPanning } from './interactionHandler.js';
import { PaletteController } from '../ui/paletteController.js';
import { UIController } from './uiController.js';

// Canvas state - keep these private to this module
const canvases = {};
const ctx = {};
let fabricCanvas = null;

//Initialize all canvas layers
function initCanvases() {
    const viewport = document.querySelector('.game-viewport');
    const location = getCurrentLocation();
    if (!location || !viewport) throw new Error("No location or viewport set");
    
    // pixelWidth and pixelHeight are already set in locationManager.js
    
    const layerIds = ["layer-0", "layer-1", "layer-2", "layer-3", "layer-4", "layer-5"];
    const layerNames = ["terrain", "walls", "paths", "objects", "front", "overlay"];

    for (let i = 0; i < layerIds.length; i++) {
        const canvas = document.getElementById(layerIds[i]);
        if (!canvas) {
            console.error(`Canvas #${layerIds[i]} not found`);
            continue;
        }

        canvases[layerNames[i]] = canvas;
        canvas.width = location.pixelWidth;
        canvas.height = location.pixelHeight;
        canvas.style.width = location.pixelWidth + 'px';
        canvas.style.height = location.pixelHeight + 'px';

        if (layerIds[i] !== "layer-3") {
            const context = canvas.getContext("2d");
            if (!context) {
                console.error(`Context for #${layerIds[i]} not available`);
                continue;
            }
            ctx[layerNames[i]] = context;
            context.imageSmoothingEnabled = false;
        }
    }

    // Initialize Fabric.js for layer-3
    const objectsCanvas = canvases.objects;
    if (objectsCanvas) {
        fabricCanvas = new fabric.Canvas("layer-3", {
            selection: false,
            preserveObjectStacking: true,
            hoverCursor: "grab",
            backgroundColor: "transparent",
            isDrawingMode: false,      // Ensure this is false
            stopContextMenu: true,     // Already set via oncontextmenu
            fireRightClick: false,     // Don't fire right click
            fireMiddleClick: false
        });
        fabricCanvas.setWidth(location.pixelWidth);
        fabricCanvas.setHeight(location.pixelHeight);
        objectsCanvas.style.width = location.pixelWidth + 'px';
        objectsCanvas.style.height = location.pixelHeight + 'px';
        fabricCanvas.upperCanvasEl.oncontextmenu = (e) => e.preventDefault();
        console.log("Fabric.js initialized");
    }

    console.log(`Canvases: ${location.pixelWidth}x${location.pixelHeight}px`);
}

// Draw background image
async function drawBackground() {
    const location = getCurrentLocation();
    const terrainCtx = ctx.terrain;
    if (!terrainCtx || !location) return;

    terrainCtx.clearRect(0, 0, location.pixelWidth, location.pixelHeight);
    
    const bgImage = new Image();
    bgImage.src = location.sprite[0]; // Spring season
    
    await new Promise((resolve) => {
        bgImage.onload = () => {
            terrainCtx.drawImage(bgImage, 0, 0, location.pixelWidth, location.pixelHeight);
            resolve();
        };
        bgImage.onerror = () => {
            console.error("Background failed to load");
            resolve();
        };
    });
}

//Draw grid overlay
function drawGrid() {
    const location = getCurrentLocation();
    const gridCtx = ctx.overlay;
    if (!gridCtx || !location) return;

    gridCtx.clearRect(0, 0, location.pixelWidth, location.pixelHeight);
    gridCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    gridCtx.lineWidth = 1;
    gridCtx.beginPath();

    for (let x = 0; x <= location.pixelWidth; x += TILE_SIZE) {
        gridCtx.moveTo(x + 0.5, 0);
        gridCtx.lineTo(x + 0.5, location.pixelHeight);
    }
    for (let y = 0; y <= location.pixelHeight; y += TILE_SIZE) {
        gridCtx.moveTo(0, y + 0.5);
        gridCtx.lineTo(location.pixelWidth, y + 0.5);
    }

    gridCtx.stroke();
}

// Draw a single object
// Draw a single object
async function drawSingleObject(placement) {
    const location = getCurrentLocation();
    if (!location) return;

    const objectDef = await fetchObjectDefinition(placement.objectKey);
    if (!objectDef) {
        console.error(`Object definition not found: ${placement.objectKey}`);
        return;
    }

    const spriteImg = await loadSprite(objectDef.sprite);

    const { pixelX, pixelY } = gridToPixel(placement.gridX, placement.gridY);

    if (placement.layer === 2 && ctx.paths) {
        // Draw path on native canvas
        if (objectDef.spriteType === 'atlas') {
            ctx.paths.drawImage(
                spriteImg,
                objectDef.atlasCoord.x, objectDef.atlasCoord.y,
                TILE_SIZE, TILE_SIZE,
                pixelX, pixelY,
                TILE_SIZE * objectDef.footprintWidth,
                TILE_SIZE * objectDef.footprintHeight
            );
        } else {
            ctx.paths.drawImage(spriteImg, pixelX, pixelY);
        }
    } else if (placement.layer === 3 && fabricCanvas) {
        // Draw object on Fabric.js canvas
        const fabricObj = new fabric.Rect({
            left: pixelX,
            top: pixelY,
            width: TILE_SIZE * objectDef.footprintWidth,
            height: TILE_SIZE * objectDef.footprintHeight,
            fill: 'rgba(70, 130, 180, 0.7)',
            stroke: 'rgba(255, 255, 255, 0.5)',
            strokeWidth: 1,
            selectable: true,
            hasControls: false,
            data: { id: placement.id, objectKey: placement.objectKey }
        });
        fabricCanvas.add(fabricObj);
    } else if (placement.layer === 4 && ctx.front) {
        if (objectDef.spriteType === 'atlas') {
            ctx.front.drawImage(
                spriteImg,
                objectDef.atlasCoord.x, objectDef.atlasCoord.y,
                TILE_SIZE, TILE_SIZE,
                pixelX, pixelY,
                TILE_SIZE * objectDef.footprintWidth,
                TILE_SIZE * objectDef.footprintHeight
            );
        } else {
            ctx.front.drawImage(spriteImg, pixelX, pixelY);
        }
    }
}

// Draw all objects
async function drawAllObjects() {
    const location = getCurrentLocation();
    if (!location) return;

    // Get current location's placements
    const currentLocationData = window.appState.modifiedLocations.find(
        loc => loc.locationKey === window.appState.currentView.locationKey
    );
    
    // Clear previous drawings regardless of whether there are placements
    if (ctx.paths) ctx.paths.clearRect(0, 0, location.pixelWidth, location.pixelHeight);
    if (fabricCanvas) fabricCanvas.clear();
    if (ctx.front) ctx.front.clearRect(0, 0, location.pixelWidth, location.pixelHeight); 

    // If no current location data or no placements, we're done (canvas is cleared)
    if (!currentLocationData || !currentLocationData.directPlacements.length) {
        console.log("No placements to draw - canvas cleared");
        return;
    }

    // Draw each placement
    const sorted = ySortPlacements(currentLocationData.directPlacements);
    for (const placement of sorted) {
        try {
            await drawSingleObject(placement);
        } catch (error) {
            console.error(`Failed to draw ${placement.objectKey}:`, error);
        }
    }

    console.log("drawAllObjects - STATE AFTER DRAWING:", JSON.parse(JSON.stringify(currentLocationData?.directPlacements || [])));
}

function setupCanvasRestore() {
    // Listen for window focus/visibility changes
    window.addEventListener('focus', async () => {
        console.log('Window focused - restoring canvas');
        await drawBackground();
        drawGrid();
        await drawAllObjects();
    });
    
    window.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            console.log('Tab visible - restoring canvas');
            await drawBackground();
            drawGrid();
            await drawAllObjects();
        }
    });
    
    // Also restore on window resize (which can happen when restoring from minimize)
    window.addEventListener('resize', async () => {
        console.log('Window resized - restoring canvas');
        // You might need to reinitialize canvases if size changed
        // For now, just redraw
        await drawBackground();
        drawGrid();
        await drawAllObjects();
    });
}


// Main initialization
async function init() {
    console.log("Initializing render engine...");
    try {
        await loadLocations();
        setCurrentLocation('farm');
        initCanvases();

        // Initialize viewport panning
        const viewport = document.querySelector('.game-viewport');
        if (viewport) {
            initViewportPanning(viewport);
        }

        // Initialize drag-and-drop interactions for overlay layer (top layer)
        if (canvases.overlay) {
            initInteractions(canvases.overlay, window.appState);
        } else {
            console.error('DEBUG: canvases.overlay is undefined!');
        }

        // Listen for placement updates to trigger re-render
        window.addEventListener('placementsUpdated', async () => {
            console.log('Re-rendering due to placement update...');
            await drawAllObjects();
        });

        await drawBackground();
        drawGrid();
        await drawAllObjects();
        
        // Initialize palette controller after everything else is ready
        window.paletteController = new PaletteController(window.appState);
        
        // Initialize UI controller
        const uiController = new UIController(window.appState);
        
        console.log("Render engine ready!");
    } catch (error) {
        console.error("Render engine failed:", error);
    }
    setupCanvasRestore();
    
    // Return a promise to indicate completion
    return Promise.resolve();
}

// Expose to window
window.renderEngine = { init };
export { init };