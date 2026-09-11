/** Desktop Settings: App Store / Play subscribers never open the Stripe portal. */

export function isStoreSubscriptionSource(source?: string | null): boolean {
  return source === "app_store" || source === "play";
}
