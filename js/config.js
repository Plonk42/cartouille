/**
 * Configuration constants for the Cartouille application
 * @module config
 */

/** @constant {number} Default zoom level for map */
export const DEFAULT_ZOOM = 6;

/** @constant {number} Maximum zoom level */
export const MAX_ZOOM = 22;

/** @constant {number} Minimum zoom for building layer */
export const MIN_ZOOM_BUILDINGS = 16;

/** @constant {number} Minimum zoom for contour lines */
export const MIN_ZOOM_CONTOUR = 14;

/** @constant {number} Maximum buildings count for dissolve operation */
export const MAX_BUILDINGS_FOR_DISSOLVE = 512;

/** @constant {Array<number>} Default map center (France) */
export const DEFAULT_CENTER = [46.603354, 1.888334];

/** @constant {number} Debounce delay in milliseconds */
export const DEBOUNCE_DELAY = 300;

/** @constant {number} Popup close delay in milliseconds */
export const POPUP_DELAY = 100;

/** @constant {number} Layer restore delay in milliseconds */
export const LAYER_RESTORE_DELAY = 500;

export const CONFIG = {
    ignApiKey: localStorage.getItem('ignApiKey') || 'xxx_xxx_xxx',
    defaultCenter: DEFAULT_CENTER,
    defaultZoom: DEFAULT_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBuildingsForDissolve: MAX_BUILDINGS_FOR_DISSOLVE,

    colors: {
        default: '#3388ff',
        highlight: '#ff5500',
        buffer: 'blue',
        // Drawing type colors
        'drawing-marker': '#e74c3c',
        'drawing-circle': '#9b59b6',
        'drawing-line': '#3498db',
        'drawing-bearing': '#f39c12',
        'drawing-polygon': '#2ecc71',
        // Measurement type colors
        'measurement-distance': '#16a085',
        'measurement-bearing': '#8e44ad',
        'measurement-area': '#27ae60',
        'measurement-centroid': '#9b59b6',
        'measurement-bbox': '#3498db',
        'measurement-along': '#1abc9c'
    },

    endpoints: {
        wmtsPublic: 'https://data.geopf.fr/wmts',
        wmtsPrivate: 'https://data.geopf.fr/private/wmts',
        wfs: 'https://data.geopf.fr/wfs/ows',
        nominatim: 'https://nominatim.openstreetmap.org/search'
    },

    /** Layer styles for consistent rendering */
    styles: {
        measurementPreview: {
            color: '#16a085',
            dashArray: '5, 10',
            weight: 2,
            fillOpacity: 0.1,
            interactive: false
        },
        drawingPreview: {
            color: 'red',
            dashArray: '5, 10',
            weight: 2,
            fillOpacity: 0.1,
            interactive: false
        },
        tempMarker: {
            color: 'red',
            fillColor: 'red',
            fillOpacity: 1,
            interactive: false
        },
        tempLine: {
            color: 'red',
            weight: 2,
            interactive: false
        },
        measurementMarker: {
            radius: 6,
            color: '#16a085',
            fillColor: '#16a085',
            fillOpacity: 1,
            interactive: false
        },
        measurementLine: {
            color: '#16a085',
            weight: 2,
            interactive: false
        }
    }
};

/**
 * Update the API key in config and localStorage
 * @param {string} newKey - The new API key
 */
export function setApiKey(newKey) {
    CONFIG.ignApiKey = newKey;
    localStorage.setItem('ignApiKey', newKey);
}

/**
 * Get color for a specific element type
 * @param {string} type - The element type
 * @returns {string} The color hex code
 */
export function getColorForType(type) {
    return CONFIG.colors[type] ||
        CONFIG.colors[`drawing-${type}`] ||
        CONFIG.colors.default;
}
