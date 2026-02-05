/**
 * Utility functions for the Cartouille application
 * @module utils
 */

import { state } from './state.js';

/**
 * Create a colored marker icon using Leaflet DivIcon
 * @param {string} color - The color for the marker (hex or CSS color)
 * @returns {L.DivIcon} A Leaflet DivIcon with the specified color
 */
export function createColoredMarkerIcon(color) {
    const markerHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
            <path fill="${color}" stroke="#fff" stroke-width="1.5" d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 24 12 24s12-16.8 12-24c0-6.6-5.4-12-12-12z"/>
            <circle fill="#fff" cx="12" cy="12" r="5"/>
        </svg>
    `;
    return L.divIcon({
        html: markerHtml,
        className: 'colored-marker-icon',
        iconSize: [24, 36],
        iconAnchor: [12, 36],
        popupAnchor: [0, -36]
    });
}

/**
 * Calculate distance between two points using the map's distance method
 * @param {Object} p1 - First point with lat/lng
 * @param {Object} p2 - Second point with lat/lng
 * @returns {number} Distance in meters
 */
export function calculateDistance(p1, p2) {
    return state.map.distance([p1.lat, p1.lng], [p2.lat, p2.lng]);
}

/**
 * Calculate destination point given start, distance, and bearing
 * Uses Haversine formula
 * @param {Object} start - Start point with lat/lng
 * @param {number} distance - Distance in meters
 * @param {number} bearing - Bearing in degrees
 * @returns {Object} Destination point with lat/lng
 */
export function calculateDestination(start, distance, bearing) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = start.lat * Math.PI / 180;
    const λ1 = start.lng * Math.PI / 180;
    const θ = bearing * Math.PI / 180;

    const φ2 = Math.asin(
        Math.sin(φ1) * Math.cos(distance / R) +
        Math.cos(φ1) * Math.sin(distance / R) * Math.cos(θ)
    );
    const λ2 = λ1 + Math.atan2(
        Math.sin(θ) * Math.sin(distance / R) * Math.cos(φ1),
        Math.cos(distance / R) - Math.sin(φ1) * Math.sin(φ2)
    );

    return {
        lat: φ2 * 180 / Math.PI,
        lng: λ2 * 180 / Math.PI
    };
}

/**
 * Get cardinal direction from bearing
 * @param {number} bearing - Bearing in degrees (0-360)
 * @returns {string} Cardinal direction (N, NE, E, etc.)
 */
export function getCardinalDirection(bearing) {
    const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const cardinalIndex = Math.round(bearing / 45) % 8;
    return cardinals[cardinalIndex];
}

/**
 * Get Font Awesome icon HTML for element types
 * @param {string} type - Element type
 * @returns {string} HTML string with icon
 */
export function getIcon(type) {
    const icons = {
        'marker': '<i class="fas fa-map-marker-alt"></i>',
        'circle': '<i class="far fa-circle"></i>',
        'line': '<i class="fas fa-route"></i>',
        'bearing': '<i class="fas fa-location-arrow"></i>',
        'polygon': '<i class="fas fa-draw-polygon"></i>',
        'measurement-distance': '<i class="fas fa-ruler"></i>',
        'measurement-area': '<i class="fas fa-vector-square"></i>',
        'measurement-bearing': '<i class="fas fa-compass"></i>',
        'measurement-center': '<i class="fas fa-crosshairs"></i>',
        'measurement-centroid': '<i class="fas fa-bullseye"></i>',
        'measurement-bbox': '<i class="far fa-square"></i>',
        'measurement-along': '<i class="fas fa-map-pin"></i>'
    };
    return icons[type] || '';
}

/**
 * Open a modal by ID
 * @param {string} id - Modal element ID
 */
export function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

/**
 * Close a modal by ID
 * @param {string} id - Modal element ID
 */
export function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

/**
 * Generate a unique ID for elements
 * @returns {string} Unique identifier
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
}

/**
 * Parse points from text (one per line, lat,lng format)
 * @param {string} text - Text with coordinates
 * @returns {Array} Array of point objects with lat/lng
 */
export function parsePointsFromText(text) {
    return text.split('\n')
        .map(line => {
            const parts = line.split(',');
            if (parts.length < 2) return null;
            const lat = Number.parseFloat(parts[0].trim());
            const lng = Number.parseFloat(parts[1].trim());
            return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
        })
        .filter(Boolean);
}

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance string
 */
export function formatDistance(meters) {
    if (meters < 1000) {
        return `${meters.toFixed(2)} m`;
    }
    return `${(meters / 1000).toFixed(3)} km`;
}

/**
 * Format area for display
 * @param {number} squareMeters - Area in square meters
 * @returns {string} Formatted area string
 */
export function formatArea(squareMeters) {
    if (squareMeters < 10000) {
        return `${squareMeters.toFixed(2)} m²`;
    }
    return `${(squareMeters / 10000).toFixed(4)} ha`;
}
