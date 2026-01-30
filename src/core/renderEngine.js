import { TILE_SIZE } from "./constants.js";
import { loadLocations, setCurrentLocation, getCurrentLocation } from './locationManager.js';
import { loadSprite, fetchObjectDefinition, loadFrontLayer } from './assetLoader.js';
import { ySortPlacements, gridToPixel, extractFrontTiles } from './renderHelpers.js';
import { initInteractions } from './interactionHandler.js';
import { initViewportPanning } from './interactionHandler.js';
import { PaletteController } from '../ui/paletteController.js';
import { UIController } from './uiController.js';

// Canvas state
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
    
    // Use the seasonal variant of the map background
    const seasonIndex = window.appState ? window.appState.getSeasonAtlasIndex() : 0;
    const bgImageSrc = location.sprite[seasonIndex];
    
    const bgImage = new Image();
    bgImage.src = bgImageSrc;
    
    await new Promise((resolve) => {
        bgImage.onload = () => {
            terrainCtx.drawImage(bgImage, 0, 0, location.pixelWidth, location.pixelHeight);
            resolve();
        };
        bgImage.onerror = () => {
            console.error("Background failed to load:", bgImageSrc);
            resolve();
        };
    });
}

//Draw grid overlay
function drawGrid() {
    updateOverlay();
}

// Draw a single object
// Draw a single object
async function drawSingleObject(placement) {
    const location = getCurrentLocation();
    if (!location) return;

    // Special handling for front tiles - render directly without object definition lookup
    if (placement.isFrontTile) {
        const { pixelX, pixelY } = gridToPixel(placement.gridX, placement.gridY);
        
        // Draw 16x16 tile from front layer image
        const frontImg = placement.frontImage;
        const tileCoord = placement.frontTileCoord;
        const tilePixelX = tileCoord.x * 16;
        const tilePixelY = tileCoord.y * 16;
        
        // Create fabric.Image for the front tile (non-interactive, pass-through)
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 16;
        tempCanvas.height = 16;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(
            frontImg,
            tilePixelX, tilePixelY, 16, 16,
            0, 0, 16, 16
        );
        
        const fabricImg = new fabric.Image(tempCanvas, {
            left: pixelX,
            top: pixelY,
            scaleX: 1,
            scaleY: 1,
            selectable: false,
            evented: false, // Pass-through: don't intercept interactions
            hasControls: false
        });
        fabricCanvas.add(fabricImg);
        console.log(`Added front tile at [${placement.gridX}, ${placement.gridY}]`);
        return;
    }

    const objectDef = await fetchObjectDefinition(placement.objectKey);
    if (!objectDef) {
        console.error(`Object definition not found: ${placement.objectKey}`);
        return;
    }

    console.log(`Drawing ${placement.objectKey} on layer ${placement.layer} at [${placement.gridX}, ${placement.gridY}]`);

    const { pixelX, pixelY } = gridToPixel(placement.gridX, placement.gridY);
    
    // Calculate sprite positioning
    // Sprites are anchored at bottom-left in Stardew Valley
    // Offset from footprint center if sprite is wider/taller than footprint
    const footprintPixelWidth = TILE_SIZE * objectDef.footprintWidth;
    const footprintPixelHeight = TILE_SIZE * objectDef.footprintHeight;

    // Check if low-render mode is enabled
    const lowRenderMode = window.appState && window.appState.settings && window.appState.settings.lowRenderMode;
    
    if (lowRenderMode) {
        // Low-render mode: draw colored rectangles instead of sprites
        const colors = {
            'buildings': '#2563EB',
            'crops': '#16A34A',
            'decor': '#92400E',
            'machines': '#6B7280',
            'wallpaper': '#9CA3AF',
            'flooring': '#9CA3AF'
        };
        const color = colors[objectDef.category] || '#666666';
        
        // Draw on layer 3 (fabric layer) for interactive objects, layer 2 for paths
        if (placement.layer === 2 && ctx.paths) {
            ctx.paths.fillStyle = color;
            ctx.paths.globalAlpha = 0.7;
            ctx.paths.fillRect(pixelX, pixelY, footprintPixelWidth, footprintPixelHeight);
            ctx.paths.globalAlpha = 1.0;
            ctx.paths.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.paths.lineWidth = 1;
            ctx.paths.strokeRect(pixelX, pixelY, footprintPixelWidth, footprintPixelHeight);
        } else if (placement.layer === 3 && fabricCanvas) {
            // Create fabric rectangle for low-render mode
            const fabricRect = new fabric.Rect({
                left: pixelX,
                top: pixelY,
                width: footprintPixelWidth,
                height: footprintPixelHeight,
                fill: color,
                opacity: 0.7,
                stroke: 'rgba(0,0,0,0.3)',
                strokeWidth: 1,
                selectable: true,
                hasControls: false,
                data: { id: placement.id, objectKey: placement.objectKey, footprintWidth: objectDef.footprintWidth, footprintHeight: objectDef.footprintHeight }
            });
            fabricCanvas.add(fabricRect);
            fabricCanvas.renderAll();
        } else if (placement.layer === 4 && ctx.front) {
            ctx.front.fillStyle = color;
            ctx.front.globalAlpha = 0.7;
            ctx.front.fillRect(pixelX, pixelY, footprintPixelWidth, footprintPixelHeight);
            ctx.front.globalAlpha = 1.0;
            ctx.front.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.front.lineWidth = 1;
            ctx.front.strokeRect(pixelX, pixelY, footprintPixelWidth, footprintPixelHeight);
        }
        return;
    }
    
    // Normal rendering mode: draw sprites
    // For seasonal objects, load the correct seasonal sprite file
    let spriteUrl = objectDef.sprite;
    if (objectDef.hasSeasonalVariants && Array.isArray(objectDef.sprite)) {
        const seasonIndex = window.appState ? window.appState.getSeasonAtlasIndex() : 0;
        spriteUrl = objectDef.sprite[seasonIndex];
    }
    
    const spriteImg = await loadSprite(spriteUrl);
    
    // Use explicit tile dimensions if available, otherwise use actual image dimensions
    const spritePixelWidth = objectDef.tileWidth || spriteImg.width;
    const spritePixelHeight = objectDef.tileHeight || spriteImg.height;
    
    // Center horizontally, align bottom vertically
    const spriteOffsetX = (footprintPixelWidth - spritePixelWidth) / 2;
    const spriteOffsetY = footprintPixelHeight - spritePixelHeight;
    const spritePixelX = pixelX + spriteOffsetX;
    const spritePixelY = pixelY + spriteOffsetY;

    // Use atlas coordinates directly - they're the same across all seasons
    const atlasCoord = objectDef.atlasCoord;

    if (placement.layer === 2 && ctx.paths) {
        console.log(`Drawing path on layer 2`);
        if (objectDef.spriteType === 'atlas') {
            ctx.paths.drawImage(
                spriteImg,
                atlasCoord.x, atlasCoord.y,
                objectDef.tileWidth, objectDef.tileHeight,
                spritePixelX, spritePixelY,
                spritePixelWidth, spritePixelHeight
            );
        } else {
            ctx.paths.drawImage(spriteImg, spritePixelX, spritePixelY);
        }
    } else if (placement.layer === 3 && fabricCanvas) {
        console.log(`Drawing on layer 3 (Fabric) - creating image at [${spritePixelX}, ${spritePixelY}]`);
        
        let imgToUse = spriteImg;
        // For atlas items, create a temporary canvas with the cropped portion
        if (objectDef.spriteType === 'atlas') {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = objectDef.tileWidth;
            tempCanvas.height = objectDef.tileHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(
                spriteImg,
                atlasCoord.x, atlasCoord.y,
                objectDef.tileWidth, objectDef.tileHeight,
                0, 0,
                objectDef.tileWidth, objectDef.tileHeight
            );
            imgToUse = tempCanvas;
        }
        
        // Create fabric.Image from the sprite (cropped if atlas)
        const fabricImg = new fabric.Image(imgToUse, {
            left: spritePixelX,
            top: spritePixelY,
            scaleX: 1,
            scaleY: 1,
            selectable: true,
            hasControls: false,
            data: { id: placement.id, objectKey: placement.objectKey, footprintWidth: objectDef.footprintWidth, footprintHeight: objectDef.footprintHeight }
        });
        fabricCanvas.add(fabricImg);
        console.log(`Added sprite image to Fabric canvas, total objects: ${fabricCanvas.getObjects().length}`);
    } else if (placement.layer === 4 && ctx.front) {
        console.log(`Drawing on layer 4`);
        if (objectDef.spriteType === 'atlas') {
            ctx.front.drawImage(
                spriteImg,
                atlasCoord.x, atlasCoord.y,
                objectDef.tileWidth, objectDef.tileHeight,
                spritePixelX, spritePixelY,
                spritePixelWidth, spritePixelHeight
            );
        } else {
            ctx.front.drawImage(spriteImg, spritePixelX, spritePixelY);
        }
    } else {
        console.warn(`No context for layer ${placement.layer}`, {layer: placement.layer, fabricCanvas: !!fabricCanvas, ctxFront: !!ctx.front, ctxPaths: !!ctx.paths});
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

    // Load front tiles from location if available (with seasonal variant)
    let frontTiles = [];
    if (location.frontLayer) {
        try {
            // Get the seasonal variant of the front layer
            let frontLayerSrc = location.frontLayer;
            if (Array.isArray(location.frontLayer)) {
                const seasonIndex = window.appState ? window.appState.getSeasonAtlasIndex() : 0;
                frontLayerSrc = location.frontLayer[seasonIndex];
            }
            
            const frontImg = await loadFrontLayer(frontLayerSrc);
            frontTiles = extractFrontTiles(frontImg, location.gridWidth, location.gridHeight);
            console.log(`Loaded ${frontTiles.length} front tiles from ${frontLayerSrc}`);
        } catch (error) {
            console.warn(`Failed to load front layer: ${error.message}`);
        }
    }

    // Combine front tiles with user placements and sort by Y
    const allPlacements = [...frontTiles, ...(currentLocationData?.directPlacements || [])];
    
    // If no placements to draw, we're done (canvas is cleared)
    if (!allPlacements.length) {
        console.log("No placements to draw - canvas cleared");
        return;
    }

    // Draw each placement (front tiles and user placements are Y-sorted together)
    const sorted = ySortPlacements(allPlacements);
    for (const placement of sorted) {
        try {
            
            await drawSingleObject(placement);
        } catch (error) {
            console.error(`Failed to draw ${placement.objectKey}:`, error);
        }
    }

    // Render all fabric objects at once (preserves Y-sort order)
    if (fabricCanvas) {
        fabricCanvas.renderAll();
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

function drawPreviewHighlights(appState) {
    const overlayCtx = ctx.overlay;
    if (!overlayCtx || !appState.isPreviewActive()) return;

    const { objectKey, gridX, gridY, isValid, footprintWidth, footprintHeight } = appState.previewState;
    const color = isValid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';

    overlayCtx.fillStyle = color;
    for (let x = 0; x < footprintWidth; x++) {
        for (let y = 0; y < footprintHeight; y++) {
            const pixelX = (gridX + x) * TILE_SIZE;
            const pixelY = (gridY + y) * TILE_SIZE;
            overlayCtx.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);
        }
    }
}

function updateOverlay() {
    const location = getCurrentLocation();
    const overlayCtx = ctx.overlay;
    if (!overlayCtx || !location) return;

    overlayCtx.clearRect(0, 0, location.pixelWidth, location.pixelHeight);
    
    // Draw grid only if showGrid is enabled
    if (window.appState && window.appState.settings && window.appState.settings.showGrid) {
        // Use darker grid in winter for visibility against white snow
        const season = window.appState.settings.season;
        const gridColor = season === 'Winter' ? "rgba(60, 60, 60, 0.35)" : "rgba(255, 255, 255, 0.15)";
        
        overlayCtx.strokeStyle = gridColor;
        overlayCtx.lineWidth = 1;
        overlayCtx.beginPath();

        for (let x = 0; x <= location.pixelWidth; x += TILE_SIZE) {
            overlayCtx.moveTo(x + 0.5, 0);
            overlayCtx.lineTo(x + 0.5, location.pixelHeight);
        }
        for (let y = 0; y <= location.pixelHeight; y += TILE_SIZE) {
            overlayCtx.moveTo(0, y + 0.5);
            overlayCtx.lineTo(location.pixelWidth, y + 0.5);
        }

        overlayCtx.stroke();
    }
    
    drawPreviewHighlights(window.appState);
    
    // Draw drag ghost with full footprint
    if (window.dragState && window.dragState.isActive && window.currentDragPlacement) {
        const isValid = window.dragState.isValid !== false;
        const fillColor = isValid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
        const strokeColor = isValid ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
        
        const fw = window.currentDragPlacement.footprintWidth || 1;
        const fh = window.currentDragPlacement.footprintHeight || 1;
        
        for (let x = 0; x < fw; x++) {
            for (let y = 0; y < fh; y++) {
                const tileX = window.dragState.gridX + x;
                const tileY = window.dragState.gridY + y;
                const ghostPixelX = tileX * TILE_SIZE;
                const ghostPixelY = tileY * TILE_SIZE;
                
                overlayCtx.fillStyle = fillColor;
                overlayCtx.strokeStyle = strokeColor;
                overlayCtx.lineWidth = 2;
                
                overlayCtx.fillRect(ghostPixelX, ghostPixelY, TILE_SIZE, TILE_SIZE);
                overlayCtx.strokeRect(ghostPixelX, ghostPixelY, TILE_SIZE, TILE_SIZE);
            }
        }
    }
    
    requestAnimationFrame(updateOverlay);
}


// Render queue to prevent concurrent draw operations
let isDrawing = false;
let pendingDraw = false;
let drawTimeoutId = null;

async function queuedDrawAllObjects() {
    // Clear any pending timeout to prevent multiple queued draws
    if (drawTimeoutId !== null) {
        clearTimeout(drawTimeoutId);
        drawTimeoutId = null;
    }

    if (isDrawing) {
        // Mark that another draw is needed after current one completes
        pendingDraw = true;
        return;
    }
    
    isDrawing = true;
    try {
        await drawAllObjects();
    } catch (error) {
        console.error('Error during draw:', error);
    } finally {
        isDrawing = false;
        
        // If another draw was requested while we were drawing, do it now
        if (pendingDraw) {
            pendingDraw = false;
            // Use a small timeout to batch multiple rapid requests
            drawTimeoutId = setTimeout(() => {
                drawTimeoutId = null;
                queuedDrawAllObjects();
            }, 0);
        }
    }
}

// Full redraw including background (used for season changes)
async function queuedFullRedraw() {
    if (isDrawing) {
        pendingDraw = true;
        return;
    }
    
    isDrawing = true;
    try {
        await drawBackground();
        drawGrid();
        await drawAllObjects();
    } catch (error) {
        console.error('Error during full redraw:', error);
    } finally {
        isDrawing = false;
        
        if (pendingDraw) {
            pendingDraw = false;
            drawTimeoutId = setTimeout(() => {
                drawTimeoutId = null;
                queuedFullRedraw();
            }, 0);
        }
    }
}

// Main initialization
async function switchLocation(newLocationKey) {
    console.log(`[switchLocation] Starting switch to ${newLocationKey}`);
    const startTime = performance.now();
    
    try {
        // Step 0: Ensure the location exists in modifiedLocations
        window.appState.ensureLocationExists(newLocationKey);
        
        // Step 1: Save viewport state of current location
        const currentLocationKey = window.appState.currentView.locationKey;
        const currentViewport = window.appState.getLocationViewport(currentLocationKey);
        console.log(`[switchLocation] Saving viewport for ${currentLocationKey}:`, currentViewport);
        
        // Step 2: Update appState to new location
        window.appState.currentView.locationKey = newLocationKey;
        setCurrentLocation(newLocationKey);
        
        // Step 3: Clear and resize canvases for new location
        const location = getCurrentLocation();
        console.log(`[switchLocation] New location dimensions: ${location.pixelWidth}x${location.pixelHeight}px`);
        
        // Resize all canvases to match new location
        const layerIds = ["layer-0", "layer-1", "layer-2", "layer-3", "layer-4", "layer-5"];
        const layerNames = ["terrain", "walls", "paths", "objects", "front", "overlay"];
        
        for (let i = 0; i < layerIds.length; i++) {
            const canvas = canvases[layerNames[i]];
            if (!canvas) continue;
            
            canvas.width = location.pixelWidth;
            canvas.height = location.pixelHeight;
            canvas.style.width = location.pixelWidth + 'px';
            canvas.style.height = location.pixelHeight + 'px';
            
            // Clear non-Fabric contexts
            if (layerNames[i] !== "objects" && ctx[layerNames[i]]) {
                ctx[layerNames[i]].clearRect(0, 0, location.pixelWidth, location.pixelHeight);
            }
        }
        
        // Resize Fabric canvas
        if (fabricCanvas) {
            fabricCanvas.setWidth(location.pixelWidth);
            fabricCanvas.setHeight(location.pixelHeight);
            fabricCanvas.clear();
        }
        
        console.log(`[switchLocation] Canvases resized`);
        
        // Step 4: Reset zoom to 1.0
        window.appState.setZoomLevel(1.0);
        console.log(`[switchLocation] Zoom reset to 1.0`);
        
        // Update canvas transforms to reflect zoom change (simple center-based zoom)
        const viewport = document.querySelector('.game-viewport');
        if (viewport) {
            const canvasElements = viewport.querySelectorAll('canvas');
            canvasElements.forEach(canvas => {
                // Reset to 1.0x zoom from center
                canvas.style.transform = `translate(0px, 0px) scale(1.0)`;
                canvas.style.transformOrigin = 'center center';
            });
        }
        
        // Step 5: Restore or initialize scroll position for new location
        const newLocationViewport = window.appState.getLocationViewport(newLocationKey);
        console.log(`[switchLocation] Restoring viewport for ${newLocationKey}:`, newLocationViewport);
        
        // Step 6: Redraw everything
        await drawBackground();
        drawGrid();
        await queuedDrawAllObjects();
        
        const elapsed = (performance.now() - startTime).toFixed(1);
        console.log(`[switchLocation] Switch completed in ${elapsed}ms`);
        
    } catch (error) {
        console.error('[switchLocation] Error during switch:', error);
        throw error;
    }
}

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
            initInteractions(canvases.overlay, window.appState, fabricCanvas);
        } else {
            console.error('DEBUG: canvases.overlay is undefined!');
        }

        // Listen for placement updates to trigger re-render
        window.addEventListener('placementsUpdated', async () => {
            console.log('Re-rendering due to placement update...');
            await queuedDrawAllObjects();
        });

        await drawBackground();
        drawGrid();
        await queuedDrawAllObjects();
        
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
window.switchLocation = switchLocation;
window.queuedDrawAllObjects = queuedDrawAllObjects;
window.queuedFullRedraw = queuedFullRedraw;
export { init };
export { ctx, canvases };