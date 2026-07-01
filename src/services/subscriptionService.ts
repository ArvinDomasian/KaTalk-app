import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage
} from 'react-native-purchases';
import type { SubscriptionAccess } from '../types';

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_ENTITLEMENT_ID = 'katalk_plus';
const SUBSCRIPTION_TIMEOUT_ERROR = 'KATALK_SUBSCRIPTION_TIMEOUT';

export type SubscriptionPlan = {
  packageId: string;
  productId: string;
  tier: SubscriptionAccess['tier'];
  title: string;
  description: string;
  price: string;
  period: string;
  isRecommended: boolean;
};

export type SubscriptionSnapshot = {
  isConfigured: boolean;
  isPremium: boolean;
  isStorePurchaseAvailable: boolean;
  entitlementId: string;
  statusText: string;
  setupMessage?: string;
  managementUrl?: string | null;
  plans: SubscriptionPlan[];
  access: SubscriptionAccess;
};

let isConfigured = false;
let configuredUserId: string | null = null;
let cachedOffering: PurchasesOffering | null = null;

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/,$/, '').replace(/^["']|["']$/g, '');
}

function getEntitlementId() {
  return cleanEnvValue(process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID) || DEFAULT_ENTITLEMENT_ID;
}

function getPlatformApiKey() {
  if (Platform.OS === 'ios') {
    return cleanEnvValue(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY);
  }

  if (Platform.OS === 'android') {
    return cleanEnvValue(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY);
  }

  return cleanEnvValue(process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY);
}

function getMissingKeyMessage() {
  if (Platform.OS === 'ios') {
    return 'Add EXPO_PUBLIC_REVENUECAT_IOS_API_KEY to .env, then rebuild the iOS app.';
  }

  if (Platform.OS === 'android') {
    return 'Add EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY to .env, then rebuild the Android app.';
  }

  return 'Mobile store purchases run in Android/iOS builds. For web purchases, configure RevenueCat Web Billing and add EXPO_PUBLIC_REVENUECAT_WEB_API_KEY.';
}

function withSubscriptionTimeout<T>(promise: Promise<T>, timeoutMs = 12000) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(SUBSCRIPTION_TIMEOUT_ERROR)), timeoutMs);
    })
  ]);
}

function getSubscriptionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === SUBSCRIPTION_TIMEOUT_ERROR) {
    return 'The store is taking too long to respond. Check your connection, then try again.';
  }

  const maybeError = error as { code?: string; message?: string; userCancelled?: boolean | null };

  if (maybeError.userCancelled || maybeError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
    return 'Purchase was cancelled.';
  }

  if (maybeError.code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR) {
    return 'This subscription product is not available yet. Check App Store Connect, Google Play Console, and RevenueCat products.';
  }

  if (maybeError.code === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR) {
    return 'RevenueCat is not fully configured yet. Check API keys, products, entitlement, and offering.';
  }

  if (maybeError.code === PURCHASES_ERROR_CODE.NETWORK_ERROR || maybeError.code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR) {
    return 'The store cannot be reached right now. Check your connection, then try again.';
  }

  return maybeError.message || 'Subscription could not be completed. Please try again.';
}

function emptyAccess(entitlementId = getEntitlementId()): SubscriptionAccess {
  return {
    tier: 'free',
    isActive: false,
    entitlementId,
    updatedAt: new Date().toISOString()
  };
}

function tierFromProductId(productId?: string): SubscriptionAccess['tier'] {
  const normalized = productId?.toLowerCase().replace(/[^a-z0-9]+/g, '_') ?? '';

  if (normalized.includes('vip')) {
    return 'vip';
  }

  if (normalized.includes('premium_plus') || normalized.includes('premiumplus')) {
    return 'premium_plus';
  }

  if (normalized.includes('premium')) {
    return 'premium';
  }

  if (normalized.includes('plus')) {
    return 'plus';
  }

  return 'premium';
}

function tierLabel(tier: SubscriptionAccess['tier']) {
  if (tier === 'vip') {
    return 'KaTalk VIP';
  }

  if (tier === 'premium_plus') {
    return 'KaTalk Premium Plus';
  }

  if (tier === 'premium' || tier === 'plus') {
    return 'KaTalk Premium';
  }

  return 'Free account';
}

function accessFromCustomerInfo(customerInfo: CustomerInfo, entitlementId = getEntitlementId()): SubscriptionAccess {
  const entitlement = customerInfo.entitlements.active[entitlementId];

  if (!entitlement) {
    return emptyAccess(entitlementId);
  }

  return {
    tier: tierFromProductId(entitlement.productIdentifier),
    isActive: true,
    entitlementId,
    productId: entitlement.productIdentifier,
    store: entitlement.store,
    expiresAt: entitlement.expirationDate,
    updatedAt: customerInfo.requestDate
  };
}

function periodLabel(period: string | null) {
  if (period === 'P1W') {
    return 'Weekly';
  }

  if (period === 'P1M') {
    return 'Monthly';
  }

  if (period === 'P3M') {
    return 'Every 3 months';
  }

  if (period === 'P6M') {
    return 'Every 6 months';
  }

  if (period === 'P1Y') {
    return 'Yearly';
  }

  return 'Subscription';
}

function planFromPackage(planPackage: PurchasesPackage): SubscriptionPlan {
  const { product } = planPackage;
  const title = product.title.replace(/\s*\([^)]*\)\s*$/, '').trim() || 'KaTalk Premium';
  const tier = tierFromProductId(product.identifier);

  return {
    packageId: planPackage.identifier,
    productId: product.identifier,
    tier,
    title,
    description: product.description || 'Unlock premium KaTalk access.',
    price: product.priceString,
    period: periodLabel(product.subscriptionPeriod),
    isRecommended: planPackage.identifier.toLowerCase().includes('annual')
  };
}

function snapshotFromParts(
  customerInfo: CustomerInfo | null,
  offering: PurchasesOffering | null,
  setupMessage?: string
): SubscriptionSnapshot {
  const entitlementId = getEntitlementId();
  const access = customerInfo ? accessFromCustomerInfo(customerInfo, entitlementId) : emptyAccess(entitlementId);
  const plans = offering?.availablePackages.map(planFromPackage) ?? [];
  const canUseStore = Platform.OS === 'ios' || Platform.OS === 'android';

  return {
    isConfigured: Boolean(getPlatformApiKey()),
    isPremium: access.isActive,
    isStorePurchaseAvailable: canUseStore && Boolean(getPlatformApiKey()) && plans.length > 0,
    entitlementId,
    statusText: access.isActive ? `${tierLabel(access.tier)} active` : 'Free account',
    setupMessage,
    managementUrl: customerInfo?.managementURL ?? null,
    plans,
    access
  };
}

async function configureRevenueCat(userId: string) {
  const apiKey = getPlatformApiKey();

  if (!apiKey) {
    return { ok: false, message: getMissingKeyMessage() };
  }

  try {
    await Purchases.setLogLevel(LOG_LEVEL.WARN);

    if (!isConfigured) {
      Purchases.configure({ apiKey, appUserID: userId });
      isConfigured = true;
      configuredUserId = userId;
      return { ok: true };
    }

    if (configuredUserId !== userId) {
      await withSubscriptionTimeout(Purchases.logIn(userId), 10000);
      configuredUserId = userId;
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, message: getSubscriptionErrorMessage(error) };
  }
}

async function fetchCurrentOffering() {
  const offerings = await withSubscriptionTimeout(Purchases.getOfferings(), 12000);
  cachedOffering = offerings.current;
  return cachedOffering;
}

export async function refreshSubscription(userId: string): Promise<SubscriptionSnapshot> {
  const configured = await configureRevenueCat(userId);

  if (!configured.ok) {
    return snapshotFromParts(null, null, configured.message);
  }

  try {
    const [customerInfo, offering] = await Promise.all([
      withSubscriptionTimeout(Purchases.getCustomerInfo(), 12000),
      fetchCurrentOffering()
    ]);

    return snapshotFromParts(
      customerInfo,
      offering,
      offering ? undefined : 'Create a RevenueCat Offering with your Apple/Google subscription products before users can buy.'
    );
  } catch (error) {
    return snapshotFromParts(null, cachedOffering, getSubscriptionErrorMessage(error));
  }
}

export async function purchaseSubscriptionPlan(userId: string, packageId: string): Promise<SubscriptionSnapshot> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Real App Store and Google Play subscriptions can only be purchased inside Android/iOS builds.');
  }

  const configured = await configureRevenueCat(userId);

  if (!configured.ok) {
    throw new Error(configured.message);
  }

  const offering = cachedOffering ?? (await fetchCurrentOffering());
  const selectedPackage = offering?.availablePackages.find((planPackage) => planPackage.identifier === packageId);

  if (!selectedPackage) {
    throw new Error('Subscription plan was not found. Check your RevenueCat Offering.');
  }

  try {
    const result = await withSubscriptionTimeout(Purchases.purchasePackage(selectedPackage), 30000);
    return snapshotFromParts(result.customerInfo, offering);
  } catch (error) {
    throw new Error(getSubscriptionErrorMessage(error));
  }
}

export async function restoreSubscription(userId: string): Promise<SubscriptionSnapshot> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Restore purchases inside the Android/iOS app build. Browser preview cannot restore mobile store purchases.');
  }

  const configured = await configureRevenueCat(userId);

  if (!configured.ok) {
    throw new Error(configured.message);
  }

  try {
    const [customerInfo, offering] = await Promise.all([
      withSubscriptionTimeout(Purchases.restorePurchases(), 20000),
      fetchCurrentOffering()
    ]);

    return snapshotFromParts(customerInfo, offering);
  } catch (error) {
    throw new Error(getSubscriptionErrorMessage(error));
  }
}
