import { loadObjects, loadSprite } from '../core/assetLoader.js';
import { getAvailableLocations } from '../core/locationManager.js';

class PaletteController {
    constructor(appState) {
        this.appState = appState;
        this.currentCategory = null;
        this.allObjects = null;
        this.filteredObjects = [];
        this.searchTimeout = null;
        this.eventListeners = new Map(); // Track event listeners for cleanup
        this.isSwitchingLocation = false; // Prevent race conditions during location switch
        
        this.init();
    }
    
    async init() {
        // Load all objects
        this.allObjects = await loadObjects();
        console.log('Palette controller initialized with', Object.keys(this.allObjects).length, 'objects');
        console.log('Sample objects:', Object.keys(this.allObjects).slice(0, 5));
        
        // Setup event listeners (including location dropdown)
        this.setupEventListeners();
        
        // Populate location dropdown with outdoor locations only
        await this.populateLocationDropdown();
        
        // Make togglePalette globally available
        window.togglePalette = this.togglePalette.bind(this);
    }
    
    setupEventListeners() {
        // Category buttons
        const categoryBtns = document.querySelectorAll('.category-btn');
        categoryBtns.forEach(btn => {
            const clickHandler = (e) => {
                const category = e.currentTarget.dataset.category;
                this.togglePalette(category);
            };
            btn.addEventListener('click', clickHandler);
            this.eventListeners.set(`category-btn-${btn.dataset.category}`, { element: btn, handler: clickHandler, type: 'click' });
        });
        
        // Close palette
        const closePaletteBtn = document.getElementById('close-palette-btn');
        const closePaletteHandler = () => this.hidePalette();
        closePaletteBtn.addEventListener('click', closePaletteHandler);
        this.eventListeners.set('close-palette-btn', { element: closePaletteBtn, handler: closePaletteHandler, type: 'click' });
        
        // Settings buttons
        const settingsBtns = document.querySelectorAll('#settings-panel button');
        settingsBtns.forEach((btn, idx) => {
            const btnHandler = (e) => {
                this.handleSettingsButton(e.target.id || e.target.textContent);
            };
            btn.addEventListener('click', btnHandler);
            this.eventListeners.set(`settings-btn-${idx}`, { element: btn, handler: btnHandler, type: 'click' });
        });

        // Location dropdown
        const locationDropdown = document.getElementById('location-dropdown');
        const dropdownHandler = (e) => {
            const newLocation = e.target.value;
            if (newLocation && newLocation !== this.appState.currentView.locationKey) {
                this.handleLocationChange(newLocation);
            }
        };
        locationDropdown.addEventListener('change', dropdownHandler);
        this.eventListeners.set('location-dropdown', { element: locationDropdown, handler: dropdownHandler, type: 'change' });
        
        // Grid toggle
        const gridToggle = document.getElementById('grid-toggle');
        if (gridToggle) {
            const gridHandler = (e) => {
                this.appState.settings.showGrid = e.target.checked;
                localStorage.setItem('planner-showGrid', e.target.checked);
                window.dispatchEvent(new CustomEvent('settingsChanged'));
                // Grid only affects overlay, so just redraw overlay
                const location = this.appState.currentView.locationKey;
                const canvases = document.querySelectorAll('canvas');
                if (canvases.length > 0) {
                    const event = new CustomEvent('placementsUpdated');
                    window.dispatchEvent(event);
                }
            };
            gridToggle.checked = this.appState.settings.showGrid;
            gridToggle.addEventListener('change', gridHandler);
            this.eventListeners.set('grid-toggle', { element: gridToggle, handler: gridHandler, type: 'change' });
        }
        
        // Low-render mode toggle
        const lowRenderToggle = document.getElementById('low-render-toggle');
        if (lowRenderToggle) {
            const lowRenderHandler = async (e) => {
                this.appState.settings.lowRenderMode = e.target.checked;
                localStorage.setItem('planner-lowRenderMode', e.target.checked);
                window.dispatchEvent(new CustomEvent('settingsChanged'));
                // Need to fully redraw all objects when switching render modes
                if (window.queuedDrawAllObjects) {
                    await window.queuedDrawAllObjects();
                }
            };
            lowRenderToggle.checked = this.appState.settings.lowRenderMode;
            lowRenderToggle.addEventListener('change', lowRenderHandler);
            this.eventListeners.set('low-render-toggle', { element: lowRenderToggle, handler: lowRenderHandler, type: 'change' });
        }
        
        // Season dropdown
        const seasonDropdown = document.getElementById('season-dropdown');
        if (seasonDropdown) {
            const seasonHandler = async (e) => {
                this.appState.settings.season = e.target.value;
                localStorage.setItem('planner-season', e.target.value);
                window.dispatchEvent(new CustomEvent('settingsChanged'));
                // Need to redraw background (for map seasonal variant) and all objects
                // Use queuedFullRedraw which redraws background, grid, and objects
                if (window.queuedFullRedraw) {
                    await window.queuedFullRedraw();
                }
                // Refresh palette to update seasonal sprites
                if (this.currentCategory) {
                    this.renderObjectsGrid();
                }
            };
            seasonDropdown.value = this.appState.settings.season;
            seasonDropdown.addEventListener('change', seasonHandler);
            this.eventListeners.set('season-dropdown', { element: seasonDropdown, handler: seasonHandler, type: 'change' });
        }
        
        // Search - with debouncing
        const searchInput = document.getElementById('search-input');
        const searchHandler = (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.filterObjects(e.target.value);
            }, 100); // 100ms debounce
        };
        searchInput.addEventListener('input', searchHandler);
        this.eventListeners.set('search-input', { element: searchInput, handler: searchHandler, type: 'input' });
        
        // File input for loading layouts
        const loadFileInput = document.getElementById('loadFileInput');
        const loadHandler = (e) => {
            if (e.target.files.length > 0) {
                this.appState.loadLayout(e.target.files[0]);
            }
        };
        loadFileInput.addEventListener('change', loadHandler);
        this.eventListeners.set('loadFileInput', { element: loadFileInput, handler: loadHandler, type: 'change' });
    }
    
    
    async populateLocationDropdown() {
        try {
            const locations = await getAvailableLocations();
            const dropdown = document.getElementById('location-dropdown');
            
            // Filter to only outdoor locations (indoors: false)
            const outdoorLocations = locations.filter(loc => !loc.indoors);
            
            console.log('Available outdoor locations:', outdoorLocations);
            
            // Clear existing options (except the first)
            dropdown.innerHTML = '';
            
            // Add options for each outdoor location
            outdoorLocations.forEach(loc => {
                const option = document.createElement('option');
                option.value = loc.key;
                option.textContent = loc.name;
                dropdown.appendChild(option);
            });
            
            // Set current location as selected
            if (this.appState.currentView.locationKey) {
                dropdown.value = this.appState.currentView.locationKey;
            }
            
            console.log('Location dropdown populated with outdoor locations');
        } catch (error) {
            console.error('Failed to populate location dropdown:', error);
        }
    }
    
    async handleLocationChange(newLocationKey) {
        if (this.isSwitchingLocation) {
            console.log('Location switch already in progress, ignoring request');
            return;
        }
        
        this.isSwitchingLocation = true;
        const dropdown = document.getElementById('location-dropdown');
        dropdown.disabled = true;
        
        try {
            console.log(`Switching location from ${this.appState.currentView.locationKey} to ${newLocationKey}`);
            
            // Call the render engine's location switch handler
            await window.switchLocation(newLocationKey);
            
            console.log(`Successfully switched to location: ${newLocationKey}`);
        } catch (error) {
            console.error('Error switching location:', error);
            // Revert dropdown to previous location on error
            dropdown.value = this.appState.currentView.locationKey;
        } finally {
            this.isSwitchingLocation = false;
            dropdown.disabled = false;
        }
    }
    
    cleanup() {
        // Remove all event listeners to prevent memory leaks
        this.eventListeners.forEach(({ element, handler, type }) => {
            if (element) {
                element.removeEventListener(type, handler);
            }
        });
        this.eventListeners.clear();
        
        // Clear any pending search timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        console.log('PaletteController cleanup complete');
    }
    
    togglePalette(category) {
        const panel = document.getElementById('palette-panel');
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        const searchInput = document.getElementById('search-input');
        
        // Check if the same category is being clicked again
        if (this.currentCategory === category && panel.classList.contains('show')) {
            // Close the panel
            panel.classList.remove('show');
            setTimeout(() => {
                panel.style.display = 'none';
            }, 300); // Match transition duration
            this.currentCategory = null;
        } else {
            // Open the new category
            panel.style.display = 'block';
            setTimeout(() => panel.classList.add('show'), 10); // Small delay to trigger transition
            this.currentCategory = category;
            
            // Clear search input when switching categories
            if (searchInput) {
                searchInput.value = '';
            }
            
            if (category === 'settings') {
                search.style.display = 'none';
                grid.style.display = 'none';
                settings.classList.add('show');
            } else {
                search.style.display = 'flex';
                grid.style.display = 'grid';
                settings.classList.remove('show');
                this.loadCategoryObjects(category);
            }
        }
    }
    
    selectCategory(category) {
        this.currentCategory = category;
        this.showPalette();
        if (category === 'settings') {
            this.showSettingsPanel();
        } else {
            this.loadCategoryObjects(category);
        }
    }
    
    hidePalette() {
        const panel = document.getElementById('palette-panel');
        panel.classList.remove('show');
        setTimeout(() => {
            panel.style.display = 'none';
        }, 300); // Match transition duration
        this.currentCategory = null;
    }
    
    showSettingsPanel() {
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        
        search.style.display = 'none';
        grid.style.display = 'none';
        settings.classList.add('show');
    }
    
    loadCategoryObjects(category) {
        this.currentCategory = category;
        this.filteredObjects = Object.entries(this.allObjects)
            .filter(([key, obj]) => obj.category === category)
            .map(([key, obj]) => ({ ...obj, objectKey: key }));
        
        console.log(`Loaded ${this.filteredObjects.length} objects for category ${category}:`, this.filteredObjects.map(obj => obj.name));
        this.renderObjectsGrid();
    }
    
    filterObjects(searchTerm) {
        // If no search term, show all objects in current category
        if (!searchTerm || !searchTerm.trim()) {
            this.loadCategoryObjects(this.currentCategory);
            return;
        }
        
        // Filter objects by current category AND search term
        const searchLower = searchTerm.toLowerCase();
        this.filteredObjects = Object.entries(this.allObjects)
            .filter(([key, obj]) => {
                const matchesCategory = obj.category === this.currentCategory;
                const matchesSearch = obj.name.toLowerCase().includes(searchLower);
                return matchesCategory && matchesSearch;
            })
            .map(([key, obj]) => ({ ...obj, objectKey: key }));
        
        console.log(`Search "${searchTerm}" found ${this.filteredObjects.length} objects in ${this.currentCategory}`);
        this.renderObjectsGrid();
    }
    
    selectObject(obj) {
        // Clear previous selection
        document.querySelectorAll('.object-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Set new selection
        const selectedElement = document.querySelector(`[data-object-key="${obj.objectKey}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
        }
        
        // Update appState
        const isPaintMode = obj.category === 'wallpaper';
        this.appState.isPaintMode = isPaintMode;
        this.appState.selectedItem = {
            objectKey: obj.objectKey,
            layer: obj.defaultLayer,
            isPaintMode: isPaintMode
        };

        this.appState.activatePreview(
            obj.objectKey,
            obj.footprintWidth || 1,
            obj.footprintHeight || 1
        );
        
        // Update status bar with paint mode indicator
        const statusBar = document.getElementById('selected-object');
        if (isPaintMode) {
            const paintType = obj.name.startsWith('Wallpaper') ? 'Wallpaper' : 'Flooring';
            statusBar.textContent = `Paint Mode: ${obj.name} (Click area to paint)`;
        } else {
            statusBar.textContent = `Selected: ${obj.name}`;
        }
        
        console.log('Selected object:', obj.objectKey, obj.name);
    }
    
    renderObjectsGrid() {
        const grid = document.getElementById('objects-grid');
        const search = document.getElementById('search-container');
        const settings = document.getElementById('settings-panel');
        
        // Only render objects grid if we're not in settings mode
        if (this.currentCategory === 'settings') {
            return; // Don't render objects grid when in settings
        }
        
        search.style.display = 'flex';
        grid.style.display = 'grid';
        settings.classList.remove('show'); // Use class, not inline style
        
        grid.innerHTML = '';
        
        this.filteredObjects.forEach(obj => {
            const objElement = this.createObjectElement(obj);
            grid.appendChild(objElement);
        });
    }
    
    createObjectElement(obj) {
        const element = document.createElement('div');
        element.className = 'object-item';
        element.dataset.objectKey = obj.objectKey;
        element.title = obj.name;
        
        // Create preview div
        const previewDiv = document.createElement('div');
        previewDiv.className = 'object-preview';
        
        // Render icon or sprite asynchronously
        this.renderObjectPreview(obj, previewDiv);
        
        element.appendChild(previewDiv);
        
        element.addEventListener('click', () => {
            this.selectObject(obj);
        });
        
        return element;
    }
    
    async renderObjectPreview(obj, container) {
        try {
            let imageUrl, atlasCoord, tileWidth, tileHeight;
            
            // Determine which image to use: icon or sprite
            if (obj.icon) {
                // Use icon atlas
                if (Array.isArray(obj.icon)) {
                    const seasonIndex = this.appState.currentSeason || 0;
                    imageUrl = obj.icon[seasonIndex];
                } else {
                    imageUrl = obj.icon;
                }
                atlasCoord = obj.iconCoord || { x: 0, y: 0 };
                // Icons are typically 16x16, but wallpaper/flooring use 32x32
                if (obj.category === 'wallpaper') {
                    tileWidth = 32;
                    tileHeight = 32;
                } else {
                    tileWidth = 16;
                    tileHeight = 16;
                }
            } else {
                // Use regular sprite
                if (Array.isArray(obj.sprite)) {
                    const seasonIndex = this.appState.currentSeason || 0;
                    imageUrl = obj.sprite[seasonIndex];
                } else {
                    imageUrl = obj.sprite;
                }
                atlasCoord = obj.atlasCoord;
                tileWidth = obj.tileWidth;
                tileHeight = obj.tileHeight;
            }
            
            // Load the image
            const img = await loadSprite(imageUrl);
            
            // If it's an atlas, crop it using canvas
            if (obj.spriteType === 'atlas' || obj.iconCoord) {
                // Scale up small icons (especially 16x16 crop icons) to be more visible
                const scale = (tileWidth <= 16 && tileHeight <= 16) ? 2 : 1;
                const canvas = document.createElement('canvas');
                canvas.width = tileWidth * scale;
                canvas.height = tileHeight * scale;
                const ctx = canvas.getContext('2d');
                
                // Disable smoothing for crisp pixel art
                ctx.imageSmoothingEnabled = false;
                
                // Draw cropped portion from atlas, scaled up
                ctx.drawImage(
                    img,
                    atlasCoord.x, atlasCoord.y,  // Source x, y (in pixels)
                    tileWidth, tileHeight,        // Source width, height
                    0, 0,                         // Dest x, y
                    tileWidth * scale, tileHeight * scale  // Dest width, height (scaled)
                );
                
                // Use canvas as image source
                const previewImg = document.createElement('img');
                previewImg.src = canvas.toDataURL();
                previewImg.alt = obj.name;
                container.appendChild(previewImg);
            } else {
                // Single sprite - use directly
                const previewImg = document.createElement('img');
                previewImg.src = imageUrl;
                previewImg.alt = obj.name;
                container.appendChild(previewImg);
            }
        } catch (error) {
            console.error(`Failed to render preview for ${obj.name}:`, error);
            // Fallback to first letter
            container.textContent = obj.name.charAt(0);
        }
    }
    
    handleSettingsButton(action) {
        switch (action) {
            case 'save-layout-btn':
            case 'Save Layout':
                this.appState.saveCurrentLayout();
                break;
            case 'load-layout-btn':
            case 'Load Layout':
                const loadFileInput = document.getElementById('loadFileInput');
                // Reset the file input value to allow loading the same file multiple times
                loadFileInput.value = '';
                loadFileInput.click();
                break;
            case 'new-layout-btn':
            case 'New Layout':
                // createNewLayout is now async, so await it
                this.appState.createNewLayout();
                break;
            case 'debug-state-btn':
            case 'Debug State':
                console.log('Current appState:', this.appState);
                break;
        }
    }
}

export { PaletteController };