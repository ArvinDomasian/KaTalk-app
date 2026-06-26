const appJson = require('./app.json');

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') : value;
}

module.exports = () => ({
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    firebase: {
      apiKey: clean(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
      authDomain: clean(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
      projectId: clean(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
      storageBucket: clean(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
      messagingSenderId: clean(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
      appId: clean(process.env.EXPO_PUBLIC_FIREBASE_APP_ID)
    },
    revenueCat: {
      iosApiKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY),
      androidApiKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY),
      webApiKey: clean(process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY),
      entitlementId: clean(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID)
    }
  }
});
