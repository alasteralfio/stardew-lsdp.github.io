// src/core/interactionHandler.js
import { TILE_SIZE } from './constants.js';
import { loadLocations, setCurrentLocation, getCurrentLocation, createLocationInstance, enterLocation, exitLocation } from './locationManager.js';
import { placeObjectAtGrid, removeObjectAtGrid, isValidPlacement, deleteObject, findObjectAtPosition } from './placementLogic.js';
import { fetchObjectDefinition, canEnterBuilding } from './assetLoader.js';

let isDragging = false;
let currentPlacement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let originalDragPosition = { gridX: 0, gridY: 0 }; // Store original position for snap-back
let zoomThrottleTimeout = null; // Throttle zoom events
let hoveredDoorTile = null; // Track door tile being hovered for highlight
let hoveredWarpTile = null; // Track warp tile being hovered
let spaceKeyPressed = false; // Track space key for panning

// Gets grid coordinates from mouse pixel position, accounting for zoom level.
// Note: Pan is already accounted for by getBoundingClientRect() returning the transformed box
function getGridCoordinates(pixelX, pixelY, appState) {
    const zoomLevel = appState ? appState.getZoomLevel() : 1.0;
    const gridX = Math.floor(pixelX / TILE_SIZE / zoomLevel);
    const gridY = Math.floor(pixelY / TILE_SIZE / zoomLevel);
    return { gridX, gridY };
}


// Finds a placement at specific grid coordinates.
// Handles multi-tile objects by checking if click falls within footprint
async function findPlacementAtGrid(gridX, gridY, appState) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) return null;

    // Check for placement that contains this grid point
    for (const p of currentLocation.directPlacements) {
        const def = await fetchObjectDefinition(p.objectKey);
        const width = def ? (def.footprintWidth || 1) : 1;
        const height = def ? (def.footprintHeight || 1) : 1;
        
        // Check if clicked position is within this object's footprint
        if (gridX >= p.gridX && gridX < p.gridX + width &&
            gridY >= p.gridY && gridY < p.gridY + height) {
            return p;
        }
    }
    return null;
}

async function handleMouseDown(event, canvas, appState) {
    // Ignore non-left-click events (right-click handled separately)
    if (event.button !== 0) {
        console.log(`Ignoring mouse button ${event.button} (not left-click)`);
        return;
    }
    
    // Prevent interaction if panning (Space key held)
    if (spaceKeyPressed) return;

    // Get mouse position and grid coordinates
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const { gridX, gridY } = getGridCoordinates(mouseX, mouseY, appState);
    
    // SHIFT + LEFT-CLICK = Delete object
    if (event.shiftKey) {
        const placement = await findObjectAtPosition(appState, mouseX, mouseY, window.fabricCanvas);
        if (placement) {
            console.log('Shift+click delete:', placement.objectKey);
            const success = await deleteObject(appState, placement.id, window.fabricCanvas);
            if (success) {
                console.log('Object deleted successfully');
            } else {
                console.warn('Failed to delete object');
            }
        } else {
            console.log('Shift+clicked empty space - no object to delete');
        }
        return;
    }

    // Safety: Cancel any previous drag operation
    if (isDragging) {
        console.log("Cancelling previous drag operation");
        isDragging = false;
        canvas.style.cursor = 'default';
        
        // Clear any ghost visuals from overlay
        const overlayCanvas = document.getElementById('layer-5');
        const overlayCtx = overlayCanvas.getContext('2d');
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // Redraw grid
        const currentLocation = getCurrentLocation();
        if (currentLocation) {
            overlayCtx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            overlayCtx.lineWidth = 1;
            overlayCtx.beginPath();
            
            for (let x = 0; x <= currentLocation.pixelWidth; x += TILE_SIZE) {
                overlayCtx.moveTo(x + 0.5, 0);
                overlayCtx.lineTo(x + 0.5, currentLocation.pixelHeight);
            }
            for (let y = 0; y <= currentLocation.pixelHeight; y += TILE_SIZE) {
                overlayCtx.moveTo(0, y + 0.5);
                overlayCtx.lineTo(currentLocation.pixelWidth, y + 0.5);
            }
            overlayCtx.stroke();
        }
        
        canvas.style.cursor = appState.selectedItem ? 'crosshair' : 'default';
    }
    
    // Grid coordinates already calculated above
    console.log(`Mouse down at grid: [${gridX}, ${gridY}]`);
    
    // Priority: If we have a selected item (intent to place), place it instead of dragging
    if (appState.selectedItem) {
        // Try to place new object
        await placeObjectAtGrid(appState, appState.selectedItem.objectKey, gridX, gridY, appState.selectedItem.layer);
    } else {
        // No selected item - try to drag existing placement
        const placement = await findPlacementAtGrid(gridX, gridY, appState);
        
        if (placement) {
            // Start dragging existing placement
            isDragging = true;
            currentPlacement = placement;
            
            // Store original position for snap-back if drop is invalid
            originalDragPosition = { gridX: placement.gridX, gridY: placement.gridY };
            
            // Calculate offset in canvas coordinates
            // This is where the cursor is relative to the tile in the canvas drawing space
            const zoomLevel = appState.getZoomLevel();
            
            // Convert current mouse position to canvas coordinates
            // Note: Pan is already accounted for by getBoundingClientRect()
            const canvasMouseX = mouseX / zoomLevel;
            const canvasMouseY = mouseY / zoomLevel;
            
            // Tile position in canvas coordinates
            const tilePixelX = placement.gridX * TILE_SIZE;
            const tilePixelY = placement.gridY * TILE_SIZE;
            
            // Store offset in canvas coordinates
            dragOffsetX = canvasMouseX - tilePixelX;
            dragOffsetY = canvasMouseY - tilePixelY;
            
            // Fetch object definition for footprint visualization
            const def = await fetchObjectDefinition(placement.objectKey);
            window.currentDragPlacement = {
                ...placement,
                footprintWidth: def ? (def.footprintWidth || 1) : 1,
                footprintHeight: def ? (def.footprintHeight || 1) : 1
            };
            
            console.log(`Started dragging placement ${placement.id}, offset: [${dragOffsetX}, ${dragOffsetY}], zoom: ${zoomLevel}x`);
            canvas.style.cursor = 'grabbing';
        } else {
            // Click on empty space with nothing selected = deselect/reset
            appState.deselect();
        }
    }
}

function handleMouseMove(event, canvas, appState) {
    // Update cursor coordinates in status bar
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const gridCoords = getGridCoordinates(mouseX, mouseY, appState);
    
    const cursorCoordsElement = document.getElementById('cursor-coords');
    if (cursorCoordsElement) {
        cursorCoordsElement.textContent = `X: ${gridCoords.gridX}, Y: ${gridCoords.gridY}`;
    }

    if (appState.isPreviewActive() && !isDragging) {
        const preview = appState.previewState;
        isValidPlacement(appState, preview.objectKey, gridCoords.gridX, gridCoords.gridY, appState.selectedItem.layer).then(validation => {
            appState.updatePreview(gridCoords.gridX, gridCoords.gridY, validation.valid);
        });
    }
    
    // Update cursor style based on selection and validation
    if (appState.selectedItem && !isDragging) {
        // Show feedback based on preview validity
        if (appState.isPreviewActive() && !appState.previewState.isValid) {
            canvas.style.cursor = 'not-allowed';
        } else if (appState.isPreviewActive()) {
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.style.cursor = 'crosshair';
        }
    } else if (!isDragging) {
        canvas.style.cursor = 'default';
    }
    
    if (!isDragging) return;
    
    // Convert current mouse to canvas coordinates
    // Note: Pan is already accounted for by getBoundingClientRect()
    const zoomLevel = appState.getZoomLevel();
    const canvasMouseX = mouseX / zoomLevel;
    const canvasMouseY = mouseY / zoomLevel;
    
    // Calculate new tile position in canvas space
    // dragOffsetX/Y are in canvas coordinates
    const newTilePixelX = canvasMouseX - dragOffsetX;
    const newTilePixelY = canvasMouseY - dragOffsetY;
    
    // Convert canvas pixels to grid coordinates
    const newGridX = Math.floor(newTilePixelX / TILE_SIZE);
    const newGridY = Math.floor(newTilePixelY / TILE_SIZE);
    
    // Validate drag position before updating
    if (currentPlacement) {
        // Immediately update visual position for responsive feedback
        window.dragState = { isActive: true, gridX: newGridX, gridY: newGridY, isValid: true };
        
        // Validate asynchronously, exclude self from collision check
        // BUT DO NOT UPDATE currentPlacement here - only update visualization
        isValidPlacement(appState, currentPlacement.objectKey, newGridX, newGridY, currentPlacement.layer, currentPlacement.id).then(validation => {
            // Update isValid flag in dragState for visualization
            window.dragState.isValid = validation.valid;
            // Do NOT update currentPlacement.gridX/Y here - only on mouseup
        });
    }
}

function handleMouseUp(event, appState) {
    if (!isDragging || !currentPlacement) return;

    const canvas = event.target;
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Calculate FINAL snapped grid position, accounting for zoom
    // Note: Pan is already accounted for by getBoundingClientRect()
    const zoomLevel = appState.getZoomLevel();
    const canvasMouseX = mouseX / zoomLevel;
    const canvasMouseY = mouseY / zoomLevel;
    const finalTilePixelX = canvasMouseX - dragOffsetX;
    const finalTilePixelY = canvasMouseY - dragOffsetY;
    const finalGridX = Math.floor(finalTilePixelX / TILE_SIZE);
    const finalGridY = Math.floor(finalTilePixelY / TILE_SIZE);

    console.log(`Dropped at grid: [${finalGridX}, ${finalGridY}], zoom: ${zoomLevel}x`);

    // Clear drag state immediately to stop visualization
    isDragging = false;
    window.dragState = { isActive: false };
    window.currentDragPlacement = null;
    canvas.style.cursor = appState.selectedItem ? 'crosshair' : 'default';

    // Validate final placement position (exclude self from collision check)
    isValidPlacement(appState, currentPlacement.objectKey, finalGridX, finalGridY, currentPlacement.layer, currentPlacement.id).then(validation => {
        if (validation.valid) {
            // Valid drop - update position
            currentPlacement.gridX = finalGridX;
            currentPlacement.gridY = finalGridY;
            console.log(`Dropped at valid position [${finalGridX}, ${finalGridY}]`);
        } else {
            // Invalid drop - snap back to original position
            console.log('Drop rejected - invalid placement:', validation.reason);
            currentPlacement.gridX = originalDragPosition.gridX;
            currentPlacement.gridY = originalDragPosition.gridY;
        }
        
        window.dispatchEvent(new CustomEvent('placementsUpdated'));
        currentPlacement = null;
    });
}

export function initInteractions(pathsCanvas, appState, fabricCanvas) {
    if (!pathsCanvas) {
        console.error('DEBUG: pathsCanvas is null or undefined!');
        return;
    }

    // Store fabricCanvas reference for deletion/warp handlers
    window.fabricCanvas = fabricCanvas;

    pathsCanvas.addEventListener('mousedown', (event) => {
        handleMouseDown(event, pathsCanvas, appState);
    });

    pathsCanvas.addEventListener('mouseleave', () => {
        appState.deactivatePreview();
        hoveredDoorTile = null; // Clear door highlight on leave
        
        // Reset status bar and cursor when leaving canvas
        const statusElement = document.getElementById('selected-object');
        if (statusElement && !appState.selectedItem) {
            statusElement.textContent = 'Selected: None';
        }
        pathsCanvas.style.cursor = 'default';
        lastHoveredPlacement = null;
    });

    pathsCanvas.addEventListener('mouseenter', () => {
        if (appState.selectedItem && !isDragging) {
            appState.activatePreview(
                appState.selectedItem.objectKey,
                appState.previewState.footprintWidth,
                appState.previewState.footprintHeight
            );
        }
    });

    // Right-click for building entry and warp actions
    pathsCanvas.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        
        const rect = pathsCanvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const { gridX, gridY } = getGridCoordinates(mouseX, mouseY, appState);
        
        // Find object at position
        const placement = await findObjectAtPosition(appState, mouseX, mouseY, fabricCanvas);
        
        if (placement) {
            const def = await fetchObjectDefinition(placement.objectKey);
            
            // Check if it's a warp tile
            if (def && def.type === 'warp') {
                console.log('Right-clicked warp tile - triggering warp');
                // Check 8 & 9: Handle warp exit
                // Check both definition and placement for targetLocation
                const targetLocation = placement.targetLocation || def.targetLocation;

                if (targetLocation === 'dynamic') {
                    // Assume dynamic means "return to previous location" for now
                    // In future, exitTargets[currentLocationKey] tells us where to go
                    exitLocation(appState);
                } else if (targetLocation) {
                    enterLocation(targetLocation, appState);
                }
                return;
            }
            
            // Check if it's an enterable building
            if (canEnterBuilding(placement.objectKey)) {
                // Check door proximity (within 2 tiles of door position)
                const doorPos = def.doorPosition;
                const absoluteDoorX = placement.gridX + doorPos.x;
                const absoluteDoorY = placement.gridY + doorPos.y;
                const distance = Math.abs(gridX - absoluteDoorX) + Math.abs(gridY - absoluteDoorY);
                
                if (distance <= 2) {
                    console.log(`Entering building: ${def.name} (${placement.objectKey})`);
                    
                    // Determine base location key from object key
                    // e.g. building_barn_0 -> barn0, building_shed_1 -> shed1
                    let baseLocationKey = placement.objectKey.replace('building_', '');
                    
                    // Handle special cases
                    if (baseLocationKey === 'greenhouse_0' || baseLocationKey === 'greenhouse_1') {
                        baseLocationKey = 'greenhouse';
                    } else if (baseLocationKey.startsWith('cabin') && baseLocationKey.endsWith('_2')) {
                        // All cabin variants use farmhouse2
                        baseLocationKey = 'farmhouse2';
                    } else if (baseLocationKey === 'slimehutch_0') {
                        baseLocationKey = 'slimehutch';
                    } else {
                        // Remove underscore for standard building types (barn_0 -> barn0)
                        baseLocationKey = baseLocationKey.replace('_', '');
                    }
                    
                    // Create unique instance ID: specific placement + parent location
                    const instanceId = `${placement.id}_${appState.currentView.locationKey}_interior`;
                    
                    // Creates the instance if it doesn't exist
                    const locationInstance = createLocationInstance(baseLocationKey, instanceId);
                    
                    if (locationInstance) {
                        // Enter the building instance
                        enterLocation(instanceId, appState);
                        
                        // Set the exit target for this instance to return to current location
                        if (!appState.exitTargets) appState.exitTargets = {};
                        appState.exitTargets[instanceId] = appState.currentView.locationKey;
                    } else {
                        console.error(`Failed to create/load interior for ${baseLocationKey}`);
                    }

                } else {
                    console.log(`Clicked building ${def.name} but too far from door (distance: ${distance})`);
                }
            } else {
                console.log('Right-clicked non-enterable object:', placement.objectKey);
            }
        } else {
            console.log('Right-clicked empty space - no action');
        }
    });

    // Hover detection for visual feedback and door highlighting
    let lastHoveredPlacement = null;
    let lastHoverCheckTime = 0;
    const HOVER_CHECK_THROTTLE = 50; // ms between hover checks
    
    pathsCanvas.addEventListener('mousemove', async (event) => {
        const now = Date.now();
        
        // Throttle hover detection to prevent excessive checks
        if (now - lastHoverCheckTime < HOVER_CHECK_THROTTLE) {
            return;
        }
        lastHoverCheckTime = now;
        
        const rect = pathsCanvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const { gridX, gridY } = getGridCoordinates(mouseX, mouseY, appState);
        
        const placement = await findObjectAtPosition(appState, mouseX, mouseY, fabricCanvas);
        
        // Check for door hover (for enterable buildings)
        const previousHoveredDoorTile = hoveredDoorTile;
        hoveredDoorTile = null;
        
        // Check for warp hover
        const previousHoveredWarpTile = hoveredWarpTile;
        hoveredWarpTile = null;

        if (placement) {
             const def = await fetchObjectDefinition(placement.objectKey);
             
             if (canEnterBuilding(placement.objectKey) && def && def.doorPosition) {
                const doorPos = def.doorPosition;
                const absoluteDoorX = placement.gridX + doorPos.x;
                const absoluteDoorY = placement.gridY + doorPos.y;
                const distance = Math.abs(gridX - absoluteDoorX) + Math.abs(gridY - absoluteDoorY);
                
                if (distance <= 2) {
                    hoveredDoorTile = { gridX: absoluteDoorX, gridY: absoluteDoorY };
                }
            } else if (def && def.type === 'warp') {
                // If the object itself is a warp (like the exit tile), highlight it
                // Logic already selects the whole object, but let's highlight the specific tile 
                // to match the door style if it's a multi-tile object (unlikely for warps but safe)
                hoveredWarpTile = { gridX: placement.gridX, gridY: placement.gridY, width: def.footprintWidth || 1, height: def.footprintHeight || 1 };
            }
        }
        
        // Trigger render if highlight state changed
        if ((previousHoveredDoorTile !== hoveredDoorTile) || 
            (previousHoveredWarpTile !== hoveredWarpTile)) {
            // No need to dispatch event - overlay updates continuously via requestAnimationFrame
        }
        
        // Update status bar hint only if hovering over object and not already selecting
        const statusElement = document.getElementById('selected-object');
        if (placement && statusElement && !appState.selectedItem) {
            const objectDef = await fetchObjectDefinition(placement.objectKey);
            const displayName = objectDef ? objectDef.name : placement.objectKey;
            
            if (canEnterBuilding(placement.objectKey)) {
                statusElement.textContent = `${displayName} - Right-click near door to enter, Shift+click to delete`;
            } else if (objectDef && objectDef.type === 'warp') {
                statusElement.textContent = `${displayName} - Right-click to exit/enter`;
            } else {
                statusElement.textContent = `${displayName} - Shift+click to delete`;
            }
            pathsCanvas.style.cursor = 'pointer';
            lastHoveredPlacement = placement;
        } else if (!placement && lastHoveredPlacement && !appState.selectedItem) {
            // Clear status bar if we just left a hovered object
            if (statusElement) {
                statusElement.textContent = 'Selected: None';
            }
            pathsCanvas.style.cursor = 'default';
            lastHoveredPlacement = null;
            hoveredDoorTile = null;
            hoveredWarpTile = null;
            window.dispatchEvent(new CustomEvent('placementsUpdated'));
        }
    });

    // ESC key to deselect
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && appState.selectedItem) {
            appState.deselect();
            console.log('Selection cleared via ESC');
        }
    });

    // attach move/up to the WINDOW so dragging works even outside canvas
    window.addEventListener('mousemove', (event) => {
        handleMouseMove(event, pathsCanvas, appState);
    });

    window.addEventListener('mouseup', (event) => {
        handleMouseUp(event, appState);
    });

    console.log('Interaction handlers initialized for PATHS layer with deletion support.');
}

export function initViewportPanning(viewportElement) {
    let isPanning = false;
    let lastX = 0;
    let lastY = 0;
    // spaceKeyPressed is now at module level
    let panX = 0;
    let panY = 0;
    // let spaceKeyPressed = false; // logic using module-level variable
    
    const updateCanvasTransforms = () => {
        const canvases = viewportElement.querySelectorAll('canvas');
        
        canvases.forEach(canvas => {
            const zoomLevel = window.appState?.getZoomLevel() || 1.0;
            // Simple transform: pan first (in screen space), then scale from center
            // Pan is applied AFTER scale so it's not affected by zoom
            canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
            canvas.style.transformOrigin = 'center center';
        });
    };
    
    // Track space key for panning
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !spaceKeyPressed) {
            spaceKeyPressed = true;
            viewportElement.style.cursor = 'grab';
            e.preventDefault(); // Prevent page scroll
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            spaceKeyPressed = false;
            isPanning = false;
            viewportElement.style.cursor = 'default';
        }
    });
    
    // Mouse wheel zoom handler (throttled to 50ms)
    viewportElement.addEventListener('wheel', (e) => {
        if (!window.appState) return;
        
        // Only handle zoom if Ctrl is NOT held (to allow browser zoom)
        if (e.ctrlKey) return;
        
        e.preventDefault();
        
        // Throttle zoom events to prevent excessive redraws
        if (zoomThrottleTimeout) return;
        
        const viewportWidth = viewportElement.clientWidth;
        const viewportHeight = viewportElement.clientHeight;
        const viewportCenterX = viewportWidth / 2;
        const viewportCenterY = viewportHeight / 2;
        
        const oldZoom = window.appState.getZoomLevel();
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1; // Invert: scroll down = zoom out
        const targetZoom = oldZoom + zoomDelta;
        
        // Calculate canvas point currently at viewport center (before zoom changes)
        const canvasPointX = (viewportCenterX - panX) / oldZoom;
        const canvasPointY = (viewportCenterY - panY) / oldZoom;
        
        // Set zoom (will be clamped internally)
        window.appState.setZoomLevel(targetZoom);
        const newZoom = window.appState.getZoomLevel(); // Get actual clamped zoom
        
        // Adjust pan so same canvas point stays at viewport center with new zoom
        panX = viewportCenterX - canvasPointX * newZoom;
        panY = viewportCenterY - canvasPointY * newZoom;
        
        console.log(`[Zoom] ${oldZoom.toFixed(1)}x → ${newZoom.toFixed(1)}x, pan: [${panX.toFixed(0)}, ${panY.toFixed(0)}]`);
        
        updateCanvasTransforms();
        
        // Remove placementsUpdated dispatch to prevent unnecessary re-renders during zoom
        // window.dispatchEvent(new CustomEvent('placementsUpdated'));
        
        // Throttle next zoom for 50ms
        zoomThrottleTimeout = setTimeout(() => {
            zoomThrottleTimeout = null;
        }, 50);
    }, { passive: false });
    
    // SPACE + MOUSE = Pan viewport
    viewportElement.addEventListener('mousedown', (e) => {
        if (e.button === 0 && spaceKeyPressed) { // Left-click while holding space
            isPanning = true;
            lastX = e.clientX;
            lastY = e.clientY;
            viewportElement.style.cursor = 'grabbing';
            e.preventDefault();
        }
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        
        const deltaX = e.clientX - lastX;
        const deltaY = e.clientY - lastY;
        
        panX += deltaX;
        panY += deltaY;
        
        updateCanvasTransforms();
        
        lastX = e.clientX;
        lastY = e.clientY;
    });
    
    document.addEventListener('mouseup', (e) => {
        if (isPanning) {
            isPanning = false;
            viewportElement.style.cursor = spaceKeyPressed ? 'grab' : 'default';
        }
    });
    
    document.addEventListener('mouseleave', () => {
        isPanning = false;
        viewportElement.style.cursor = spaceKeyPressed ? 'grab' : 'default';
    });
    
    // Initialize cursor
    viewportElement.style.cursor = 'default';
    
    // Expose pan values to window for drag calculations
    window.viewportPanState = {
        get panX() { return panX; },
        get panY() { return panY; }
    };
}

// Export getter for hovered door tile (for render highlighting)
export function getHoveredDoorTile() {
    return hoveredDoorTile;
}

// Export getter for hovered warp tile (for render highlighting)
export function getHoveredWarpTile() {
    return hoveredWarpTile;
}