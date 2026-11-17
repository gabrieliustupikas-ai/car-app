/**
 * Single place to rename the product. Used by app.config.ts, UI copy and notifications.
 * Changing `slug`/`scheme`/bundle ids after store release requires a new store listing.
 */
export const BRAND = {
  name: 'ROADCLUB',
  slug: 'roadclub',
  scheme: 'roadclub',
  iosBundleId: 'lt.roadclub.app',
  androidPackage: 'lt.roadclub.app',
  supportEmail: 'privacy@roadclub.example',
  privacyUrl: 'https://roadclub.example/privacy',
  termsUrl: 'https://roadclub.example/terms',
} as const;
