/**
 * Map initialization and info display
 * @module map
 */

import { CONFIG } from './config.js';
import { handleMapClick, handleMapDoubleClick, handleMouseMove } from './events.js';
import { updateBuildings } from './layers.js';
import { saveState } from './persistence.js';
import { state } from './state.js';

/**
 * Initialize the Leaflet map
 */
export function initMap() {
    state.map = L.map('map', {
        center: CONFIG.defaultCenter,
        zoom: CONFIG.defaultZoom,
        maxZoom: CONFIG.maxZoom
    });

    // Create custom panes for layer ordering
    // Default pane z-index: tilePane=200, overlayPane=400, markerPane=600
    state.map.createPane('orthoPane');
    state.map.getPane('orthoPane').style.zIndex = 250;
    state.map.createPane('overlayPane');
    state.map.getPane('overlayPane').style.zIndex = 350;

    // Event Listeners
    state.map.on('moveend', () => {
        saveState();
        updateBuildings();
    });
    state.map.on('click', handleMapClick);
    state.map.on('dblclick', handleMapDoubleClick);
    state.map.on('mousedown', () => {
        document.getElementById('context-menu').classList.add('hidden');
    });
    state.map.on('zoomend', updateInfo);
    state.map.on('mousemove', handleMouseMove);

    // Add scale control
    L.control.scale({ imperial: false }).addTo(state.map);

    updateInfo();
}

/**
 * Update the info display (zoom level)
 */
export function updateInfo() {
    const zoomEl = document.getElementById('info-zoom');
    if (zoomEl && state.map) {
        zoomEl.textContent = state.map.getZoom();
    }
}
