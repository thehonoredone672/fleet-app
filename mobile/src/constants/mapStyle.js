// Google Maps style JSON that strips color out of the base map (roads,
// water, land all render as grayscale) so the map itself matches the
// app's one-bit design rather than sitting as a colorful island inside
// an otherwise black-and-white UI. Passed to <MapView customMapStyle>.
export const grayscaleMapStyle = [
  { elementType: 'geometry', stylers: [{ saturation: -100 }] },
  { elementType: 'labels.text.fill', stylers: [{ saturation: -100, lightness: -20 }] },
  { elementType: 'labels.text.stroke', stylers: [{ saturation: -100, lightness: 80 }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -100, lightness: 40 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ saturation: -100, lightness: -10 }] },
];
