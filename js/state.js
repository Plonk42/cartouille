/**
 * Application state management
 * @module state
 */

/**
 * @typedef {Object} DrawingState
 * @property {L.LatLng|null} startPoint - Starting point for drawing
 * @property {Array<{lat: number, lng: number}>} points - Collection of drawing points
 * @property {L.Layer|null} tempLayer - Temporary layer for preview
 * @property {L.Layer|null} cursorLayer - Cursor preview layer
 * @property {{lat: number, lng: number}|null} center - Center point for circles
 */

/**
 * @typedef {Object} MeasurementState
 * @property {string|null} active - Active measurement type
 * @property {Array<{lat: number, lng: number}>} points - Measurement points
 * @property {Array<L.Layer>} tempLayers - Temporary layers for preview
 * @property {Object|null} result - Measurement result
 */

/**
 * @typedef {Object} AppState
 * @property {L.Map|null} map - Leaflet map instance
 * @property {Object} layers - Layer references
 * @property {string|null} activeTool - Currently active drawing tool
 * @property {Array<Object>} features - GeoJSON features array
 * @property {Map<string, L.Layer>} featureLayers - Map of feature ID to Leaflet layer
 * @property {Array<Object>} folders - Folders for organizing elements
 * @property {Map<string, boolean>} featureVisibility - Track visibility of each feature
 * @property {DrawingState} drawing - Drawing state
 * @property {L.GeoJSON|null} buildingsLayer - Buildings WFS layer
 * @property {L.GeoJSON|null} buffersLayer - Buffer zones layer
 * @property {L.LatLng|null} contextMenuLocation - Context menu click location
 * @property {MeasurementState} measurement - Measurement tool state
 */

/**
 * Central application state object
 * All modules share this state for coordination
 * @type {AppState}
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
