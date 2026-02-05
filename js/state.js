/**
 * Application state management
 * @module state
 */

/**
 * Central application state object
 * All modules share this state for coordination
 */
export const state = {
    /** @type {L.Map|null} Leaflet map instance */
    map: null,

    /** @type {Object} Layer references */
    layers: {},

    /** @type {string|null} Currently active drawing tool */
    activeTool: null,

    /** @type {Array} GeoJSON features array */
    features: [],

    /** @type {Map} Map of feature ID to Leaflet layer */
    featureLayers: new Map(),

    /** @type {Array} Folders for organizing elements */
    folders: [],

    /** @type {Map} Track visibility of each feature by id */
    featureVisibility: new Map(),

    /** Drawing state for temporary shapes */
    drawing: {
        startPoint: null,
        points: [],
        tempLayer: null,
        cursorLayer: null,
        center: null
    },

    /** @type {L.GeoJSON|null} Buildings WFS layer */
    buildingsLayer: null,

    /** @type {L.GeoJSON|null} Buffer zones layer */
    buffersLayer: null,

    /** @type {L.LatLng|null} Context menu click location */
    contextMenuLocation: null,

    /** Measurement tool state */
    measurement: {
        active: null,
        points: [],
        tempLayers: [],
        result: null
    }
};

/**
 * Reset drawing state to initial values
 */
export function resetDrawingState() {
    if (state.drawing.tempLayer && state.map) {
        state.map.removeLayer(state.drawing.tempLayer);
    }
    state.drawing.points = [];
    state.drawing.tempLayer = null;
    state.drawing.startPoint = null;
    state.drawing.center = null;
}

/**
 * Clear the cursor preview layer
 */
export function clearCursorLayer() {
    if (state.drawing.cursorLayer && state.map) {
        state.map.removeLayer(state.drawing.cursorLayer);
        state.drawing.cursorLayer = null;
    }
}

/**
 * Reset measurement state to initial values
 */
export function resetMeasurementState() {
    state.measurement.active = null;
    state.measurement.points = [];
    state.measurement.result = null;

    // Remove temp layers
    state.measurement.tempLayers.forEach(layer => {
        if (state.map) state.map.removeLayer(layer);
    });
    state.measurement.tempLayers = [];
}
