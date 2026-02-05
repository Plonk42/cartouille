/**
 * Data persistence - localStorage, import/export
 * @module persistence
 */

import { toggleAllElementsVisibility } from './elements.js';
import { restoreFeature, restoreMeasurementFeature } from './geojson.js';
import { restoreLayerSettings } from './layers.js';
import { state } from './state.js';

/**
 * Save application state to localStorage
 */
export function saveState() {
    if (!state.map) return;

    // Create features with visibility state
    const featuresWithVisibility = state.features.map(f => {
        const featureCopy = structuredClone(f);
        featureCopy.properties._visible = state.featureVisibility.get(f.id) !== false;
        return featureCopy;
    });

    // Collect layer settings
    const layerSettings = {
        orthoEnabled: document.getElementById('overlay-ortho')?.checked || false,
        orthoOpacity: Number.parseInt(document.getElementById('ortho-opacity')?.value, 10) || 50,
        buildingsEnabled: document.getElementById('overlay-buildings')?.checked || false,
        buffersEnabled: document.getElementById('overlay-buffers')?.checked || false,
        bufferRadius: Number.parseInt(document.getElementById('buffer-radius')?.value, 10) || 50,
        parcChartreuseEnabled: document.getElementById('overlay-parc-chartreuse')?.checked || false,
        contourEnabled: document.getElementById('overlay-contour')?.checked || false,
        contourAltitude: Number.parseInt(document.getElementById('contour-altitude')?.value, 10) || 1000
    };

    const geoJSON = {
        type: 'FeatureCollection',
        features: featuresWithVisibility,
        properties: {
            center: state.map.getCenter(),
            zoom: state.map.getZoom(),
            savedAt: new Date().toISOString(),
            version: '4.1',
            folders: state.folders,
            layerSettings: layerSettings
        }
    };

    localStorage.setItem('ignMapData', JSON.stringify(geoJSON));
}

/**
 * Restore application state from localStorage
 */
export function restoreState() {
    const saved = localStorage.getItem('ignMapData');
    if (!saved) return;

    try {
        const data = JSON.parse(saved);
        const props = data.properties || {};

        // Restore map view
        if (props.center && props.zoom) {
            state.map.setView(props.center, props.zoom);
        }

        // Restore folders
        if (props.folders) {
            state.folders = props.folders;
        }

        // Restore layer settings
        if (props.layerSettings) {
            restoreLayerSettings(props.layerSettings);
        }

        // Restore features
        data.features.forEach(feature => {
            const type = feature.properties.type;
            const visible = feature.properties._visible !== false;
            if (type.startsWith('measurement-')) {
                restoreMeasurementFeature(feature, visible);
            } else {
                restoreFeature(feature, visible);
            }
        });
    } catch (error) {
        console.error('Error restoring state:', error);
    }
}

/**
 * Initialize data management (import/export)
 */
export function initDataManagement() {
    // Toggle all visibility button
    document.getElementById('btn-toggle-all-visibility')?.addEventListener('click', () => {
        toggleAllElementsVisibility();
    });

    // Export button
    document.getElementById('btn-export')?.addEventListener('click', exportData);

    // Import button
    document.getElementById('btn-import')?.addEventListener('click', () => {
        document.getElementById('file-input')?.click();
    });

    // File input change
    document.getElementById('file-input')?.addEventListener('change', handleImport);
}

/**
 * Export data as GeoJSON file
 */
function exportData() {
    const saved = localStorage.getItem('ignMapData');
    if (!saved) return;

    const blob = new Blob([saved], { type: 'application/geo+json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ign-map-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
}

/**
 * Handle file import
 * @param {Event} e - File input change event
 */
async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Clear existing features
        state.featureLayers.forEach(layer => state.map.removeLayer(layer));
        state.features = [];
        state.featureLayers.clear();
        state.featureVisibility.clear();
        state.folders = [];

        // Restore map view
        const props = data.properties || {};
        if (props.center && props.zoom) {
            state.map.setView(props.center, props.zoom);
        }

        // Restore folders
        if (props.folders) {
            state.folders = props.folders;
        }

        // Import features
        data.features.forEach(feature => {
            const type = feature.properties.type;
            const visible = feature.properties._visible !== false;
            if (type.startsWith('measurement-')) {
                restoreMeasurementFeature(feature, visible);
            } else {
                restoreFeature(feature, visible);
            }
        });

        saveState();
        alert('Import réussi !');
    } catch (error) {
        console.error('Import error:', error);
        alert('Erreur lors de l\'import: ' + error.message);
    }
}
