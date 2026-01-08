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
                    objectKey: "stone_walkway_floor",
                    gridX: 60,
                    gridY: 60,
                    layer: 2,
                },
                {
                    id: "plc_2",
                    objectKey: "wooden_floor",
                    gridX: 40,
                    gridY: 40,
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

// Make appState globally accessible
window.appState = appState;