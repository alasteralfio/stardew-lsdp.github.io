// The single source of truth for application state
const appState = {
    // User looking at
    currentView: {
        locationKey: "farm",
    },

    // User is holding
    selectedItem: null, // Format: { objectKey: 'path_stone_walkway_floor', layer: 2 }

    // All user placements structured for saving
    modifiedLocations: [
        {
            locationKey: "farm",
            buildings: [],
            directPlacements: [
                {
                    id: "plc_1",
                    objectKey: "path_stone_walkway_floor",
                    gridX: 60,
                    gridY: 60,
                    layer: 2,
                },
            ],
        },
    ],
};

// Utility function to generate unique IDs for new placements
let placementIdCounter = 0;
appState.generatePlacementId = function () {
    return `plc_${Date.now()}_${placementIdCounter++}`;
};

// Make appState globally accessible
window.appState = appState;
