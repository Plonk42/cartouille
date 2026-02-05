/**
 * GeoJSON conversion utilities
 * @module geojson
 */

import { CONFIG } from './config.js';
import { createPopupContent, updateElementList } from './elements.js';
import { saveState } from './persistence.js';
import { state } from './state.js';
import { createColoredMarkerIcon } from './utils.js';

/**
 * Create a Leaflet layer from a GeoJSON feature
 * @param {Object} feature - GeoJSON feature
 * @returns {L.Layer} Leaflet layer
 */
export function createLayerFromFeature(feature) {
    const props = feature.properties;
    const type = props.type;
    let layer;

    if (type === 'circle') {
        // Special handling for circles (not native GeoJSON)
        const coords = feature.geometry.coordinates;
        layer = L.circle([coords[1], coords[0]], {
            radius: props.radius,
            color: props.color,
            fillColor: props.color,
            fillOpacity: 0.3
        });
        layer.feature = feature;
    } else if (type === 'marker') {
        // Create draggable marker with colored icon
        const coords = feature.geometry.coordinates;
        const markerColor = props.color || CONFIG.colors.default;
        layer = L.marker([coords[1], coords[0]], {
            draggable: true,
            icon: createColoredMarkerIcon(markerColor)
        });
        layer.feature = feature;

        // Update feature on drag
        layer.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            feature.geometry.coordinates = [pos.lng, pos.lat];
            layer.setPopupContent(createPopupContent(feature));
            updateElementList();
            saveState();
        });
    } else {
        // Use L.geoJSON for other geometries
        const geoJsonLayer = L.geoJSON(feature, {
            style: (f) => ({
                color: f.properties.color || CONFIG.colors.default,
                fillColor: f.properties.color || CONFIG.colors.default,
                fillOpacity: 0.3,
                weight: 2
            })
        });

        // Extract the actual layer from the GeoJSON layer
        layer = geoJsonLayer.getLayers()[0];
        layer.feature = feature;
    }

    return layer;
}

/**
 * Convert an element to a GeoJSON Feature
 * @param {Object} element - The element to convert
 * @returns {Object} GeoJSON Feature
 */
export function elementToGeoJSON(element) {
    const { id, type, data } = element;
    let feature = null;

    const properties = {
        id: id,
        type: type,
        title: data.title || '',
        description: data.description || '',
        color: data.color || CONFIG.colors.default,
        folderId: data.folderId || null
    };

    switch (type) {
        case 'marker':
            feature = turf.point([data.lng, data.lat], properties);
            break;

        case 'circle':
            properties.radius = data.radius;
            feature = turf.point([data.center.lng, data.center.lat], properties);
            break;

        case 'line':
        case 'bearing':
            properties.distance = data.distance;
            if (data.bearing !== undefined) properties.bearing = data.bearing;
            feature = turf.lineString([
                [data.start.lng, data.start.lat],
                [data.end.lng, data.end.lat]
            ], properties);
            break;

        case 'polygon': {
            const coords = data.points.map(p => [p.lng, p.lat]);
            feature = turf.polygon([coords], properties);
            break;
        }

        case 'measurement-distance':
        case 'measurement-bearing':
            properties.distanceM = data.distanceM;
            properties.distanceKm = data.distanceKm;
            if (data.bearing !== undefined) {
                properties.bearing = data.bearing;
                properties.cardinal = data.cardinal;
            }
            feature = turf.lineString([
                [data.start.lng, data.start.lat],
                [data.end.lng, data.end.lat]
            ], properties);
            break;

        case 'measurement-area': {
            properties.areaM2 = data.areaM2;
            properties.areaHa = data.areaHa;
            properties.areaKm2 = data.areaKm2;
            properties.perimeterM = data.perimeterM;
            properties.perimeterKm = data.perimeterKm;
            const areaCoords = data.points.map(p => [p.lng, p.lat]);
            areaCoords.push(areaCoords[0]);
            feature = turf.polygon([areaCoords], properties);
            break;
        }

        case 'measurement-center':
        case 'measurement-centroid': {
            const centerPoint = type === 'measurement-center' ? data.center : data.centroid;
            properties[type === 'measurement-center' ? 'center' : 'centroid'] = centerPoint;
            if (data.areaM2) properties.areaM2 = data.areaM2;
            if (data.areaHa) properties.areaHa = data.areaHa;

            const polyCoords = data.points.map(p => [p.lng, p.lat]);
            polyCoords.push(polyCoords[0]);
            const poly = turf.polygon([polyCoords]);
            const center = turf.point([centerPoint.lng, centerPoint.lat]);

            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [poly.geometry, center.geometry]
                },
                properties: properties
            };
            break;
        }

        case 'measurement-bbox': {
            properties.bbox = data.bbox;
            properties.width = data.width;
            properties.height = data.height;

            const bboxCoords = data.points.map(p => [p.lng, p.lat]);
            bboxCoords.push(bboxCoords[0]);
            const origPoly = turf.polygon([bboxCoords]);
            const bboxPoly = turf.bboxPolygon([
                data.bbox.minLng, data.bbox.minLat,
                data.bbox.maxLng, data.bbox.maxLat
            ]);

            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [origPoly.geometry, bboxPoly.geometry]
                },
                properties: properties
            };
            break;
        }

        case 'measurement-along': {
            properties.lengthM = data.lengthM;
            properties.lengthKm = data.lengthKm;
            properties.alongDistance = data.alongDistance;
            properties.alongPoint = data.alongPoint;

            const alongLine = turf.lineString(data.points.map(p => [p.lng, p.lat]));
            const alongPt = turf.point([data.alongPoint.lng, data.alongPoint.lat]);

            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [alongLine.geometry, alongPt.geometry]
                },
                properties: properties
            };
            break;
        }
    }

    if (feature) {
        feature.id = id;
    }

    return feature;
}

/**
 * Convert a GeoJSON Feature to element data structure
 * @param {Object} feature - GeoJSON Feature
 * @returns {Object} Element with id, type, and data
 */
export function geoJSONToElement(feature) {
    const props = feature.properties;
    const geom = feature.geometry;
    const type = props.type;
    const id = feature.id || props.id;

    const data = {
        title: props.title || '',
        description: props.description || '',
        color: props.color || CONFIG.colors.default
    };

    switch (type) {
        case 'marker':
            data.lat = geom.coordinates[1];
            data.lng = geom.coordinates[0];
            break;

        case 'circle':
            data.center = {
                lat: geom.coordinates[1],
                lng: geom.coordinates[0]
            };
            data.radius = props.radius;
            break;

        case 'line':
        case 'bearing':
            data.start = {
                lat: geom.coordinates[0][1],
                lng: geom.coordinates[0][0]
            };
            data.end = {
                lat: geom.coordinates[1][1],
                lng: geom.coordinates[1][0]
            };
            if (props.distance) data.distance = props.distance;
            if (props.bearing !== undefined) data.bearing = props.bearing;
            break;

        case 'polygon':
            data.points = geom.coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1],
                lng: coord[0]
            }));
            break;

        case 'measurement-distance':
        case 'measurement-bearing':
            data.start = { lat: geom.coordinates[0][1], lng: geom.coordinates[0][0] };
            data.end = { lat: geom.coordinates[1][1], lng: geom.coordinates[1][0] };
            data.distanceM = props.distanceM;
            data.distanceKm = props.distanceKm;
            if (props.bearing !== undefined) {
                data.bearing = props.bearing;
                data.cardinal = props.cardinal;
            }
            break;

        case 'measurement-area':
            data.points = geom.coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1], lng: coord[0]
            }));
            Object.assign(data, {
                areaM2: props.areaM2,
                areaHa: props.areaHa,
                areaKm2: props.areaKm2,
                perimeterM: props.perimeterM,
                perimeterKm: props.perimeterKm
            });
            break;

        case 'measurement-center':
        case 'measurement-centroid': {
            data.points = geom.geometries[0].coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1], lng: coord[0]
            }));
            const centerProp = type === 'measurement-center' ? 'center' : 'centroid';
            data[centerProp] = props[centerProp] || {
                lat: geom.geometries[1].coordinates[1],
                lng: geom.geometries[1].coordinates[0]
            };
            if (props.areaM2) data.areaM2 = props.areaM2;
            if (props.areaHa) data.areaHa = props.areaHa;
            break;
        }

        case 'measurement-bbox':
            data.points = geom.geometries[0].coordinates[0].slice(0, -1).map(coord => ({
                lat: coord[1], lng: coord[0]
            }));
            data.bbox = props.bbox;
            data.width = props.width;
            data.height = props.height;
            break;

        case 'measurement-along':
            data.points = geom.geometries[0].coordinates.map(coord => ({
                lat: coord[1], lng: coord[0]
            }));
            data.alongPoint = props.alongPoint || {
                lat: geom.geometries[1].coordinates[1],
                lng: geom.geometries[1].coordinates[0]
            };
            data.lengthM = props.lengthM;
            data.lengthKm = props.lengthKm;
            data.alongDistance = props.alongDistance;
            break;
    }

    return { id, type, data };
}

/**
 * Restore a feature from GeoJSON
 * @param {Object} feature - GeoJSON feature
 * @param {boolean} visible - Whether the feature should be visible
 */
export function restoreFeature(feature, visible = true) {
    const layer = createLayerFromFeature(feature);

    if (visible) {
        layer.addTo(state.map);
    }

    state.features.push(feature);
    state.featureLayers.set(feature.id, layer);
    state.featureVisibility.set(feature.id, visible);

    layer.bindPopup(() => createPopupContent(feature));
    updateElementList();
}

/**
 * Restore a measurement feature from GeoJSON
 * @param {Object} feature - GeoJSON feature
 * @param {boolean} visible - Whether the feature should be visible
 */
export function restoreMeasurementFeature(feature, visible = true) {
    const layer = createLayerFromFeature(feature);

    if (visible) {
        layer.addTo(state.map);
    }

    state.features.push(feature);
    state.featureLayers.set(feature.id, layer);
    state.featureVisibility.set(feature.id, visible);

    // Bind popup with color support
    if (layer instanceof L.LayerGroup) {
        layer.eachLayer(subLayer => {
            if (subLayer.bindPopup) {
                subLayer.bindPopup(() => createPopupContent(feature));
            }
        });
    } else if (layer.bindPopup) {
        layer.bindPopup(() => createPopupContent(feature));
    }

    updateElementList();
}

/**
 * Extract data from a feature for display
 * @param {Object} feature - GeoJSON feature
 * @returns {Object} Extracted data
 */
export function extractDataFromFeature(feature) {
    const props = feature.properties;
    const geom = feature.geometry;
    const type = props.type;

    const data = {
        title: props.title || '',
        description: props.description || '',
        color: props.color || CONFIG.colors.default,
        folderId: props.folderId || null
    };

    if (type === 'marker') {
        data.lat = geom.coordinates[1];
        data.lng = geom.coordinates[0];
    } else if (type === 'circle') {
        data.radius = props.radius;
    } else if (type === 'line' || type === 'bearing') {
        data.distance = props.distance;
        if (props.bearing !== undefined) data.bearing = props.bearing;
    } else if (type === 'polygon') {
        data.points = geom.coordinates[0].slice(0, -1).map(c => ({ lat: c[1], lng: c[0] }));
    } else if (type.startsWith('measurement-')) {
        Object.assign(data, props);
    }

    return data;
}
