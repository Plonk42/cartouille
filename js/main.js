/**
 * Cartouille - Main entry point
 * Interactive map application for IGN layers
 * @module main
 */

import { initTools } from './drawing.js';
import { initContextMenu } from './events.js';
import { initLayers } from './layers.js';
import { initMap } from './map.js';
import { initMeasurementTools } from './measurements.js';
import { initDataManagement, restoreState } from './persistence.js';
import { initCollapsibleSections, initCoordinateConverter, initSearch, initSettings } from './ui.js';

/**
 * Initialize the application
 */
function init() {
    // Check for Leaflet
    if (typeof L === 'undefined') {
        alert('Erreur: La librairie Leaflet n\'a pas pu être chargée. Vérifiez votre connexion internet.');
        return;
    }

    // Initialize all modules
    initMap();
    initLayers();
    initTools();
    initContextMenu();
    initSearch();
    initDataManagement();
    initMeasurementTools();
    initSettings();
    initCoordinateConverter();
    initCollapsibleSections();

    // Restore saved state
    restoreState();

    console.log('Cartouille initialized successfully');
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
