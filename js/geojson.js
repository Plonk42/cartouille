/**
 * GeoJSON conversion utilities
 * @module geojson
 */

import { CONFIG } from './config.js';
import { createPopupContent, updateElementList } from './elements.js';
import { saveState } from './persistence.js';
import { state } from './state.js';
import { createColoredMarkerIcon, createCrossMarker } from './utils.js';

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
    } else if (feature.geometry?.type === 'GeometryCollection') {
        // Reconstruct LayerGroup for measurement types that use GeometryCollection
        layer = createMeasurementLayerGroup(feature);
        layer.feature = feature;
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
 * Reconstruct a Leaflet LayerGroup from a measurement GeometryCollection feature
 * @param {Object} feature - GeoJSON Feature with GeometryCollection geometry
 * @returns {L.LayerGroup}
 */
function createMeasurementLayerGroup(feature) {
    const props = feature.properties;
    const type = props.type;
    const color = props.color || CONFIG.colors.default;
    const geoms = feature.geometry.geometries;

    const polygonStyle = { color, fillColor: color, fillOpacity: 0.2, weight: 2, dashArray: '5, 5' };

    switch (type) {
        case 'measurement-centroid': {
            const polyCoords = geoms[0].coordinates[0].map(c => [c[1], c[0]]);
            const pt = geoms[1].coordinates;
            return L.layerGroup([
                L.polygon(polyCoords, polygonStyle),
                createCrossMarker(pt[1], pt[0], color)
            ]);
        }
        case 'measurement-bbox': {
            const polyCoords = geoms[0].coordinates[0].map(c => [c[1], c[0]]);
            const bboxCoords = geoms[1].coordinates[0].map(c => [c[1], c[0]]);
            const pt = geoms[2].coordinates;
            return L.layerGroup([
                L.polygon(polyCoords, polygonStyle),
                L.polygon(bboxCoords, { color, fillColor: color, fillOpacity: 0.1, weight: 3 }),
                createCrossMarker(pt[1], pt[0], color)
            ]);
        }
        case 'measurement-along': {
            const lineCoords = geoms[0].coordinates.map(c => [c[1], c[0]]);
            const pt = geoms[1].coordinates;
            return L.layerGroup([
                L.polyline(lineCoords, { color, weight: 3 }),
                createCrossMarker(pt[1], pt[0], color)
            ]);
        }
        default: {
            // Fallback: render each geometry individually
            const sublayers = geoms.map(geom => {
                const subFeature = { type: 'Feature', geometry: geom, properties: props };
                return L.geoJSON(subFeature, {
                    style: () => ({ color, fillColor: color, fillOpacity: 0.2, weight: 2 })
                }).getLayers()[0];
            }).filter(Boolean);
            return L.layerGroup(sublayers);
        }
    }
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

        case 'measurement-centroid': {
            const centerPoint = data.centroid;
            properties.centroid = centerPoint;
            if (data.areaM2) properties.areaM2 = data.areaM2;
            if (data.areaHa) properties.areaHa = data.areaHa;
            if (data.weights) properties.weights = data.weights;

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
            properties.bboxCenter = data.bboxCenter;

            const bboxCoords = data.points.map(p => [p.lng, p.lat]);
            bboxCoords.push(bboxCoords[0]);
            const origPoly = turf.polygon([bboxCoords]);
            const bboxPoly = turf.bboxPolygon([
                data.bbox.minLng, data.bbox.minLat,
                data.bbox.maxLng, data.bbox.maxLat
            ]);
            const bboxCenterPt = turf.point([data.bboxCenter.lng, data.bboxCenter.lat]);

            feature = {
                type: 'Feature',
                geometry: {
                    type: 'GeometryCollection',
                    geometries: [origPoly.geometry, bboxPoly.geometry, bboxCenterPt.geometry]
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
 * Bind popup to a layer (handles LayerGroup for measurements)
 * @param {L.Layer} layer - Leaflet layer
 * @param {Object} feature - GeoJSON feature
 */
function bindPopupToLayer(layer, feature) {
    const popupFn = () => createPopupContent(feature);
    const tooltipText = feature.properties.title || '';

    if (layer instanceof L.LayerGroup) {
        layer.eachLayer(subLayer => {
            if (subLayer.bindPopup) {
                subLayer.bindPopup(popupFn);
            }
            if (subLayer.bindTooltip && tooltipText) {
                subLayer.bindTooltip(tooltipText, { sticky: true, direction: 'top', className: 'element-tooltip' });
            }
        });
    } else if (layer.bindPopup) {
        layer.bindPopup(popupFn);
    }
    if (!(layer instanceof L.LayerGroup) && layer.bindTooltip && tooltipText) {
        layer.bindTooltip(tooltipText, { sticky: true, direction: 'top', className: 'element-tooltip' });
    }
}

/**
 * Restore a feature from GeoJSON (works for all feature types including measurements)
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

    bindPopupToLayer(layer, feature);
    updateElementList();
}

/**
 * @deprecated Use restoreFeature instead - kept for backwards compatibility
 */
export function restoreMeasurementFeature(feature, visible = true) {
    restoreFeature(feature, visible);
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
