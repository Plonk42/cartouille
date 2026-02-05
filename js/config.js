/**
 * Configuration constants for the Cartouille application
 * @module config
 */

export const CONFIG = {
    ignApiKey: localStorage.getItem('ignApiKey') || 'xxx_xxx_xxx',
    defaultCenter: [46.603354, 1.888334],
    defaultZoom: 6,
    maxZoom: 22,
    maxBuildingsForDissolve: 512,

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
        'measurement-center': '#e74c3c',
        'measurement-centroid': '#9b59b6',
        'measurement-bbox': '#3498db',
        'measurement-along': '#1abc9c'
    },

    endpoints: {
        wmtsPublic: 'https://data.geopf.fr/wmts',
        wmtsPrivate: 'https://data.geopf.fr/private/wmts',
        wfs: 'https://data.geopf.fr/wfs/ows',
        nominatim: 'https://nominatim.openstreetmap.org/search'
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
