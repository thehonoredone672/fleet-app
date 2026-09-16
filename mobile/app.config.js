// Dynamic config (instead of a static app.json) so the react-native-maps
// config plugin can read Google Maps API keys from the environment at
// build time rather than having them committed in plain JSON — see
// .env.example. Only needed for production app-store builds; Expo Go
// renders maps in development without any key.
module.exports = {
  expo: {
    name: 'Fleet Management',
    slug: 'fleet-management',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'fleetmanagement',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.fleetmanagement.app',
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
      },
    },
    android: {
      package: 'com.fleetmanagement.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
        },
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-secure-store',
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
          iosGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY_IOS,
        },
      ],
    ],
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL,
    },
  },
};
