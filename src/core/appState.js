// The single source of truth for application state
const appState = {
    // User looking at
    currentView: {
        locationKey: "farm",
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
            locationKey: "farm",
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
        currentView: this.currentView
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
                
                console.log("Layout loaded:", data);
                
                // Trigger re-render
                window.dispatchEvent(new CustomEvent('placementsUpdated'));
                resolve(data);
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
appState.createNewLayout = function() {
    this.modifiedLocations = [
        {
            locationKey: "farm",
            buildings: [],
            directPlacements: []
        }
    ];
    this.currentView = { locationKey: "farm" };
    
    console.log("New layout created, dispatching update event");
    
    // Trigger re-render with a slight delay to ensure state is updated
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('placementsUpdated'));
    }, 0);
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

// Export for modules (remove the window assignment)
export { appState };