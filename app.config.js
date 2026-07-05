const appJson = require('./app.json');

const firebaseFallbackConfig = {
  apiKey: 'AIzaSyBKJXkyKBo2Oyo4LzfhcdFKAHneYlH9VoQ',
  authDomain: 'katalk-fbaf6.firebaseapp.com',
  projectId: 'katalk-fbaf6',
  storageBucket: 'katalk-fbaf6.firebasestorage.app',
  messagingSenderId: '621528799120',
  appId: '1:621528799120:web:5c3486122c4d10bf190515'
};

const admobFallbackConfig = {
  androidAppId: 'ca-app-pub-3940256099942544~3347511713',
  iosAppId: 'ca-app-pub-3940256099942544~1458002511',
  androidRewardedAdUnitId: 'ca-app-pub-3940256099942544/5224354917',
  iosRewardedAdUnitId: 'ca-app-pub-3940256099942544/1712485313'
};

function clean(value) {
  return typeof value === 'string' ? value.trim().replace(/,$/, '').replace(/^["']|["']$/g, '') : value;
}

function getAdMobConfig() {
  const androidAppId = clean(process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID) || admobFallbackConfig.androidAppId;
  const iosAppId = clean(process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID) || admobFallbackConfig.iosAppId;
  const androidRewardedAdUnitId =
    clean(process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_AD_UNIT_ID) ||
    admobFallbackConfig.androidRewardedAdUnitId;
  const iosRewardedAdUnitId =
    clean(process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED_AD_UNIT_ID) ||
    admobFallbackConfig.iosRewardedAdUnitId;

  return {
    androidAppId,
    iosAppId,
    androidRewardedAdUnitId,
    iosRewardedAdUnitId,
    isUsingTestAds:
      androidAppId === admobFallbackConfig.androidAppId ||
      iosAppId === admobFallbackConfig.iosAppId ||
      androidRewardedAdUnitId === admobFallbackConfig.androidRewardedAdUnitId ||
      iosRewardedAdUnitId === admobFallbackConfig.iosRewardedAdUnitId
  };
}

module.exports = () => {
  const adMob = getAdMobConfig();

  return {
    ...appJson.expo,
    plugins: [
      ...appJson.expo.plugins,
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: adMob.androidAppId,
          iosAppId: adMob.iosAppId,
          delayAppMeasurementInit: true,
          optimizeInitialization: true,
          optimizeAdLoading: true,
          userTrackingUsageDescription:
            'KaTalk uses this identifier to show more relevant ads when you allow tracking.'
        }
      ]
    ],
    'react-native-google-mobile-ads': {
      android_app_id: adMob.androidAppId,
      ios_app_id: adMob.iosAppId,
      user_tracking_usage_description:
        'KaTalk uses this identifier to show more relevant ads when you allow tracking.'
    },
    extra: {
      ...appJson.expo.extra,
      backendProvider: clean(process.env.EXPO_PUBLIC_BACKEND_PROVIDER) || 'firebase',
      supabase: {
        url: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
        anonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)
      },
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
      },
      adMob
    }
  };
};
