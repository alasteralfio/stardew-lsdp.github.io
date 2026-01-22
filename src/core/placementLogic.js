// src/core/placementLogic.js
import { fetchObjectDefinition } from './assetLoader.js';
import { getCurrentLocation } from './locationManager.js';

function isInBlockedArea(gridX, gridY, footprintWidth, footprintHeight, blockedAreas) {
    if (!blockedAreas || blockedAreas.length === 0) return false;

    for (let x = 0; x < footprintWidth; x++) {
        for (let y = 0; y < footprintHeight; y++) {
            const tileX = gridX + x;
            const tileY = gridY + y;

            for (const blocked of blockedAreas) {
                if (tileX >= blocked.x && 
                    tileX < blocked.x + blocked.width &&
                    tileY >= blocked.y && 
                    tileY < blocked.y + blocked.height) {
                    return true;
                }
            }
        }
    }
    return false;
}

async function collidesWithExistingObjects(gridX, gridY, footprintWidth, footprintHeight, existingPlacements, layer, excludeId = null) {
    if (!existingPlacements) return false;

    for (const existing of existingPlacements) {
        if (existing.layer !== layer || existing.id === excludeId) continue;

        const existingDef = await fetchObjectDefinition(existing.objectKey);
        const existingWidth = existingDef ? (existingDef.footprintWidth || 1) : 1;
        const existingHeight = existingDef ? (existingDef.footprintHeight || 1) : 1;

        for (let x = 0; x < footprintWidth; x++) {
            for (let y = 0; y < footprintHeight; y++) {
                const checkX = gridX + x;
                const checkY = gridY + y;

                if (checkX >= existing.gridX && 
                    checkX < existing.gridX + existingWidth &&
                    checkY >= existing.gridY && 
                    checkY < existing.gridY + existingHeight) {
                    return true;
                }
            }
        }
    }
    return false;
}

function checkPlacementRules(objectDef, location) {
    if (!objectDef || !location) return { valid: false, reason: 'Missing object or location data' };

    if (location.indoors === true && objectDef.placeableIndoors === false) {
        return { valid: false, reason: 'Object cannot be placed indoors' };
    }

    return { valid: true };
}

async function isValidPlacement(appState, objectKey, gridX, gridY, layer, excludeId = null) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) {
        return { valid: false, reason: 'No current location' };
    }

    const location = getCurrentLocation();
    if (!location) {
        return { valid: false, reason: 'Location data not loaded' };
    }

    const objectDef = await fetchObjectDefinition(objectKey);
    if (!objectDef) {
        return { valid: false, reason: 'Object definition not found' };
    }

    // Prevent wallpaper and flooring from being placed as regular objects
    if (objectDef.category === 'wallpaper') {
        return { valid: false, reason: 'Wallpaper placement coming soon' };
    }

    const footprintWidth = objectDef.footprintWidth || 1;
    const footprintHeight = objectDef.footprintHeight || 1;

    // Check boundaries - prevent negative or out-of-bounds placement
    if (gridX < 0 || gridY < 0) {
        return { valid: false, reason: 'Cannot place outside map boundaries' };
    }

    const gridWidth = location.gridWidth || Math.ceil(location.pixelWidth / 16);
    const gridHeight = location.gridHeight || Math.ceil(location.pixelHeight / 16);
    
    if (gridX + footprintWidth > gridWidth || gridY + footprintHeight > gridHeight) {
        return { valid: false, reason: 'Object extends beyond map edge' };
    }

    if (isInBlockedArea(gridX, gridY, footprintWidth, footprintHeight, location.blockedAreas)) {
        return { valid: false, reason: 'Placement blocked by terrain' };
    }

    const collision = await collidesWithExistingObjects(gridX, gridY, footprintWidth, footprintHeight, currentLocation.directPlacements, layer, excludeId);
    if (collision) {
        return { valid: false, reason: 'Placement overlaps existing object' };
    }

    const rulesCheck = checkPlacementRules(objectDef, location);
    if (!rulesCheck.valid) {
        return rulesCheck;
    }

    return { valid: true };
}

// Places a new object at the specified grid coordinates
export async function placeObjectAtGrid(appState, objectKey, gridX, gridY, layer) {
    const validation = await isValidPlacement(appState, objectKey, gridX, gridY, layer);
    
    if (!validation.valid) {
        console.log('Placement invalid:', validation.reason);
        return false;
    }

    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    const newPlacement = {
        id: appState.generatePlacementId(),
        objectKey: objectKey,
        gridX: gridX,
        gridY: gridY,
        layer: layer
    };

    currentLocation.directPlacements.push(newPlacement);
    window.dispatchEvent(new CustomEvent('placementsUpdated'));
    console.log('Placed object:', objectKey, 'at', gridX, gridY);
    return true;
}

// Removes an object at the specified grid coordinates
export function removeObjectAtGrid(appState, gridX, gridY, layer) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) return false;

    const index = currentLocation.directPlacements.findIndex(p =>
        p.gridX === gridX && p.gridY === gridY && p.layer === layer
    );

    if (index === -1) return false;

    currentLocation.directPlacements.splice(index, 1);

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('placementsUpdated'));

    console.log('Removed object at', gridX, gridY);
    return true;
}

// Delete object by ID instantly (no animation)
export async function deleteObject(appState, placementId, fabricCanvas) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) {
        console.warn('No current location found for deletion');
        return false;
    }

    const placementIndex = currentLocation.directPlacements.findIndex(p => p.id === placementId);
    
    if (placementIndex === -1) {
        console.warn(`Placement with ID ${placementId} not found`);
        return false;
    }

    const placement = currentLocation.directPlacements[placementIndex];

    // If it's a Layer 3 object (Fabric.js), remove it
    if (placement.layer === 3 && fabricCanvas) {
        const fabricObjects = fabricCanvas.getObjects();
        const fabricObj = fabricObjects.find(obj => obj.data && obj.data.id === placementId);
        
        if (fabricObj) {
            fabricCanvas.remove(fabricObj);
            fabricCanvas.renderAll();
        }
    }

    // Remove from appState
    currentLocation.directPlacements.splice(placementIndex, 1);

    // Trigger re-render
    window.dispatchEvent(new CustomEvent('placementsUpdated'));

    console.log('Deleted object:', placement.objectKey, 'with ID:', placementId);
    return true;
}

// Find placement object by pixel position using footprint-based collision
export async function findObjectAtPosition(appState, pixelX, pixelY, fabricCanvas) {
    const currentLocation = appState.modifiedLocations.find(
        loc => loc.locationKey === appState.currentView.locationKey
    );

    if (!currentLocation) return null;

    // Check all placements to find which one contains this pixel position using footprint bounds
    for (let i = currentLocation.directPlacements.length - 1; i >= 0; i--) {
        const placement = currentLocation.directPlacements[i];
        
        // Get object definition to get footprint
        const objectDef = await fetchObjectDefinition(placement.objectKey);
        if (!objectDef) continue;

        const footprintWidth = objectDef.footprintWidth || 1;
        const footprintHeight = objectDef.footprintHeight || 1;

        // Convert pixel position to grid position
        const gridX = Math.floor(pixelX / 16);
        const gridY = Math.floor(pixelY / 16);

        // Check if grid position is within footprint bounds
        if (gridX >= placement.gridX && 
            gridX < placement.gridX + footprintWidth &&
            gridY >= placement.gridY && 
            gridY < placement.gridY + footprintHeight) {
            return placement;
        }
    }

    return null;
}

export { isInBlockedArea, collidesWithExistingObjects, checkPlacementRules, isValidPlacement };