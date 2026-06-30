const appJson = require('./app.json');

const firebaseFallbackConfig = {
  apiKey: 'AIzaSyBKJXkyKBo2Oyo4LzfhcdFKAHneYlH9VoQ',
  authDomain: 'katalk-fbaf6.firebaseapp.com',
  projectId: 'katalk-fbaf6',
  storageBucket: 'katalk-fbaf6.firebasestorage.app',
  messagingSenderId: '621528799120',
  appId: '1:621528799120:web:5c3486122c4d10bf190515'
};

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') : value;
}

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    firebase: {
      apiKey: clean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY) || firebaseFallbackConfig.apiKey,
      authDomain: clean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN) || firebaseFallbackConfig.authDomain,
      projectId: clean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) || firebaseFallbackConfig.projectId,
      storageBucket: clean(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET) || firebaseFallbackConfig.storageBucket,
      messagingSenderId: clean(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID) || firebaseFallbackConfig.messagingSenderId,
      appId: clean(process.env.EXPO_PUBLIC_FIREBASE_APP_ID) || firebaseFallbackConfig.appId
    },
    revenueCat: {
      iosApiKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY),
      androidApiKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
      webApiKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY),
      entitlementId: clean(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID)
    }
  }
});
