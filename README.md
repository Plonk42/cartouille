# Cartouille

Carte barbouillée, trésor trouvé !

## ✨ Fonctionnalités

### 🗺️ Fonds de carte IGN
- Plan IGN
- Scan 25 (carte topographique)
- Orthophotos (images aériennes)

### ✏️ Outils de dessin
- **Marqueurs** : Points d'intérêt avec titre et description éditables
- **Cercles** : Zones circulaires avec rayon paramétrable en mètres
- **Lignes** : Tracés multi-points avec calcul automatique de distance
- **Lignes directionnelles** : Tracés avec azimut et distance
- **Polygones** : Zones personnalisées

### 📏 Outils de mesure
- Distance entre deux points
- Azimut et direction cardinale
- Point milieu d'une ligne
- Surface et périmètre de polygones
- Centre géométrique (centroid)
- Centre de masse
- Boîte englobante (bounding box)
- Point le long d'une ligne (interpolation)

### 💾 Gestion des données
- Format **GeoJSON** standard (conforme à [RFC 7946](https://geojson.org/))
- Sauvegarde automatique dans le navigateur (LocalStorage)
- Import/Export de fichiers GeoJSON (`.geojson`)
- Intégration de [Turf.js](https://turfjs.org/) pour les calculs géométriques

### 🌍 Couches supplémentaires
- Bâtiments (service WFS, visible à partir du zoom 16)
- Zones tampons (buffers) autour des bâtiments
- Superposition photo aérienne avec opacité réglable
- Courbes de niveau à altitude spécifique (service TMS vectoriel)
- Périmètre du Parc naturel régional de Chartreuse (données OpenStreetMap)

### 🔍 Recherche
- Par nom de lieu (via [Nominatim](https://nominatim.org/))
- Par coordonnées géographiques (latitude, longitude)

## 🚀 Démarrage rapide

### Prérequis
- Un navigateur web moderne (Chrome, Firefox, Safari, Edge)
- Une connexion internet pour charger les tuiles de carte et les services IGN

### Installation

Aucune installation n'est requise ! Il s'agit d'une application web statique.

## 🛠️ Technologies utilisées

- **[Leaflet](https://leafletjs.com/)** v1.9.4 - Bibliothèque de cartographie interactive
- **[Leaflet.VectorGrid](https://github.com/Leaflet/Leaflet.VectorGrid)** - Rendu de tuiles vectorielles (MVT/PBF)
- **[Turf.js](https://turfjs.org/)** v7.1.0 - Analyse et calculs géospatiaux
- **[FontAwesome](https://fontawesome.com/)** v6.7.2 - Icônes
- **[IGN Géoplateforme](https://geoservices.ign.fr/)** - Fonds de carte, WFS et tuiles vectorielles
- **[Nominatim](https://nominatim.org/)** - Géocodage et recherche de lieux
- **ES6 Modules** - Architecture JavaScript modulaire

## � Structure du projet

```
cartouille/
├── index.html              # Point d'entrée HTML
├── style.css               # Styles CSS
├── js/                     # Modules ES6
│   ├── main.js             # Point d'entrée JavaScript
│   ├── config.js           # Configuration et constantes
│   ├── state.js            # État global de l'application
│   ├── map.js              # Initialisation de la carte Leaflet
│   ├── layers.js           # Gestion des couches (IGN, WFS, contours)
│   ├── drawing.js          # Outils de dessin
│   ├── measurements.js     # Outils de mesure
│   ├── elements.js         # Gestion des éléments (popups, liste)
│   ├── folders.js          # Gestion des dossiers
│   ├── events.js           # Événements carte et menu contextuel
│   ├── geojson.js          # Import/export GeoJSON
│   ├── persistence.js      # Sauvegarde LocalStorage
│   ├── ui.js               # Composants UI (recherche, convertisseur)
│   └── utils.js            # Fonctions utilitaires
├── parc_chartreuse_data.js # Données GeoJSON du Parc de Chartreuse
└── parc_chartreuse.geojson # Fichier source GeoJSON
```

## �📊 Format des données

L'application utilise le format **GeoJSON** standard ([RFC 7946](https://tools.ietf.org/html/rfc7946)) pour stocker et exporter les éléments dessinés et les mesures.

### Structure des fichiers exportés

Les fichiers exportés sont des `FeatureCollection` GeoJSON contenant :

- **Géométries** : `Point`, `LineString`, `Polygon`, `GeometryCollection`
- **Propriétés** : titre, description, couleur, type d'élément, données de mesure
- **Métadonnées** : centre de la carte, niveau de zoom, version, date de sauvegarde

### Exemple de structure

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "unique-id",
      "geometry": {
        "type": "Point",
        "coordinates": [5.7167, 45.1833]
      },
      "properties": {
        "type": "marker",
        "title": "Mon marqueur",
        "description": "Description du point d'intérêt",
        "color": "#3388ff"
      }
    }
  ],
  "properties": {
    "center": {"lat": 46.6, "lng": 1.9},
    "zoom": 10,
    "version": "2.0",
    "savedAt": "2026-01-01T12:00:00.000Z"
  }
}
```

## 📖 Utilisation

1. **Sélectionner un fond de carte** : Choisissez parmi les fonds IGN disponibles (Plan, Scan 25, Orthophotos)
2. **Rechercher un lieu** : Utilisez la barre de recherche pour trouver un lieu par nom ou coordonnées
3. **Dessiner** : Sélectionnez un outil de dessin et cliquez sur la carte
4. **Mesurer** : Utilisez les outils de mesure pour calculer distances, surfaces, azimuts, etc.
5. **Sauvegarder** : Vos données sont automatiquement sauvegardées dans le navigateur
6. **Exporter** : Exportez vos données au format GeoJSON pour les partager ou les réutiliser

## 🔑 Configuration de la clé API

Pour utiliser pleinement l'application, vous devez obtenir une clé API gratuite auprès des services de cartographie de l'IGN.

> **Note** : Les services IGN sont actuellement en cours d'évolution. Une clé par défaut est fournie pour les tests, mais elle peut être limitée ou expirer. Cette section sera mise à jour prochainement avec des instructions détaillées.