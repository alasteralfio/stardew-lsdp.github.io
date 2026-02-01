// The single source of truth for application state
const appState = {
    // User looking at
    currentView: {
        locationKey: "farm0",
    },

    // User is holding
    selectedItem: null, // Format: { objectKey: 'path_stone_walkway_floor', layer: 2 }

    // Preview state for placement preview system
    previewState: {
        isActive: false,
        objectKey: null, 
        gridX: 0,
        gridY: 0,
        isValid: true,
        footprintWidth: 1,
        footprintHeight: 1,
    },

    // All user placements structured for saving
    modifiedLocations: [
        {
            locationKey: "farm0",
            buildings: [],
            directPlacements: [
                {
                    id: "plc_1",
                    objectKey: "stone_walkway_floor",
                    gridX: 10,
                    gridY: 10,
                    layer: 2,
                },
                {
                    id: "plc_2",
                    objectKey: "wooden_floor",
                    gridX: 15,
                    gridY: 15,
                    layer: 2,
                },
                {
                    id: "plc_3",
                    objectKey: "stone_walkway_floor",
                    gridX: 20,
                    gridY: 20,
                    layer: 2,
                },
            ],
        },
    ],

    // Viewport state for zoom and per-location scroll position
    viewportState: {
        zoomLevel: 1.0, // Global zoom level (0.3x to 3.0x)
        locationsViewport: {} // Per-location scroll: { [locationKey]: { scrollX: 0, scrollY: 0 } }
    },

    // Settings for UI features
    settings: {
        showGrid: localStorage.getItem('planner-showGrid') !== 'false', // Default true
        lowRenderMode: localStorage.getItem('planner-lowRenderMode') === 'true', // Default false
        season: localStorage.getItem('planner-season') || 'Spring' // Default Spring
    },
};

// Utility function to generate unique IDs for new placements
let placementIdCounter = 3;
appState.generatePlacementId = function () {
    return `plc_${Date.now()}_${placementIdCounter++}`;
};

// Update preview position and validity
appState.updatePreview = function(gridX, gridY, isValid) {
    this.previewState.gridX = gridX;
    this.previewState.gridY = gridY;
    this.previewState.isValid = isValid;
};

// Activate preview with object definition
appState.activatePreview = function(objectKey, footprintWidth, footprintHeight) {
    this.previewState.isActive = true;
    this.previewState.objectKey = objectKey;
    this.previewState.footprintWidth = footprintWidth;
    this.previewState.footprintHeight = footprintHeight;
    this.previewState.gridX = 0;
    this.previewState.gridY = 0;
    this.previewState.isValid = true;
};

// Deactivate preview
appState.deactivatePreview = function() {
    this.previewState.isActive = false;
    this.previewState.objectKey = null;
};

// Check if preview is currently active
appState.isPreviewActive = function() {
    return this.previewState.isActive && this.previewState.objectKey !== null;
};

// Deselect current item and clear preview
appState.deselect = function() {
    this.selectedItem = null;
    this.deactivatePreview();
    const canvas = document.getElementById('paths-canvas');
    if (canvas) canvas.style.cursor = 'default';
};

// Save current layout to JSON file
appState.saveCurrentLayout = function() {
    const layoutData = {
        version: "1.0",
        modifiedLocations: this.modifiedLocations,
        currentView: this.currentView,
        viewportState: this.viewportState  // Include zoom level and per-location scroll positions
    };
    
    const dataStr = JSON.stringify(layoutData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `stardew-layout-${Date.now()}.json`;
    link.click();
    
    console.log("Layout saved:", layoutData);
};

// Load layout from file object
appState.loadLayout = function(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // Validate the loaded data
                if (!data.version || !data.modifiedLocations) {
                    throw new Error("Invalid layout file format");
                }
                
                // Update appState with loaded data
                this.modifiedLocations = data.modifiedLocations;
                this.currentView = data.currentView || this.currentView;
                
                // Restore viewport state if it exists (backwards compatible)
                if (data.viewportState) {
                    this.viewportState = data.viewportState;
                    console.log("Viewport state restored:", this.viewportState);
                } else {
                    // For old save files without viewport state, reset to defaults
                    this.viewportState.zoomLevel = 1.0;
                    this.viewportState.locationsViewport = {};
                    console.log("Old save file format - viewport state reset to defaults");
                }
                
                console.log("Layout loaded:", data);
                
                // Trigger re-render and physically switch to the saved location
                const locationToSwitchTo = data.currentView?.locationKey || "farm0";
                window.dispatchEvent(new CustomEvent('placementsUpdated'));
                if (window.switchLocation) {
                    window.switchLocation(locationToSwitchTo).then(() => resolve(data)).catch(reject);
                } else {
                    resolve(data);
                }
            } catch (error) {
                console.error("Failed to load layout:", error);
                alert("Failed to load layout: " + error.message);
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsText(file);
    });
};

// Create a new empty layout
appState.createNewLayout = async function() {
    this.modifiedLocations = [
        {
            locationKey: "farm0",
            buildings: [],
            directPlacements: []
        }
    ];
    this.currentView = { locationKey: "farm0" };
    
    // Reset viewport for new layout
    this.viewportState.zoomLevel = 1.0;
    this.viewportState.locationsViewport = {};
    
    console.log("New layout created, switching to farm0 and redrawing");
    
    // Use switchLocation to actually redraw the canvas and ensure visual state matches appState
    if (window.switchLocation) {
        await window.switchLocation("farm0");
    } else {
        // Fallback if switchLocation not available yet
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('placementsUpdated'));
        }, 0);
    }
};

// Get viewport state for a specific location (initializes if not exists)
appState.getLocationViewport = function(locationKey) {
    if (!this.viewportState.locationsViewport[locationKey]) {
        this.viewportState.locationsViewport[locationKey] = { scrollX: 0, scrollY: 0 };
    }
    return this.viewportState.locationsViewport[locationKey];
};

// Set viewport state for a specific location
appState.setLocationViewport = function(locationKey, scrollX, scrollY) {
    this.viewportState.locationsViewport[locationKey] = { scrollX, scrollY };
};

// Set global zoom level
appState.setZoomLevel = function(zoomLevel) {
    this.viewportState.zoomLevel = Math.max(0.3, Math.min(3.0, zoomLevel)); // Clamp between 0.3x and 3.0x
};

// Get global zoom level
appState.getZoomLevel = function() {
    return this.viewportState.zoomLevel;
};

// Ensure a location exists in modifiedLocations, initialize if not
appState.ensureLocationExists = function(locationKey) {
    if (!this.modifiedLocations.find(loc => loc.locationKey === locationKey)) {
        this.modifiedLocations.push({
            locationKey: locationKey,
            buildings: [],
            directPlacements: []
        });
        console.log(`[appState] Created entry for location: ${locationKey}`);
    }
};

// Get the current season's atlas index (Spring=0, Summer=1, Fall=2, Winter=3)
appState.getSeasonAtlasIndex = function() {
    const seasonMap = {
        'Spring': 0,
        'Summer': 1,
        'Fall': 2,
        'Winter': 3
    };
    return seasonMap[this.settings.season] || 0;
};

// Export for modules (remove the window assignment)
export { appState };