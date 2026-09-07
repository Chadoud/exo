# Mobile store privacy & compliance checklist

Use when submitting **Exo** (`com.exosites.exosites_mobile`) to App Store Connect and Google Play Console.

## Data collected (declare honestly)

| Data | Purpose | Stored where | Linked to user |
|------|---------|--------------|----------------|
| Account email (OAuth) | Sign-in, trial | Cloud API | Yes |
| Access / refresh tokens | API auth | Device Keychain / Keystore | Yes |
| GO SYNC master key | Decrypt synced memories | Device secure storage only | Yes |
| Synced memory blobs (encrypted) | Second brain cache | Device SQLite + cloud relay ciphertext | Yes |
| Device ID (UUID) | Multi-device sync | Cloud relay + device | Yes |
| Crash reports (optional) | Bug fixes | Cloud API when user opts in | No PII by design |
| Camera | Scan desktop pairing QR | Not stored / not uploaded | No |
| Microphone | Voice Capture (not in beta) | N/A until Capture ships | No |
| Local notifications | Remind when a synced task is due | On-device OS scheduler only | Optional lock-screen title (off by default) |
| Optional push token | Generic wake when desktop syncs a due task or ready action | Cloud `sync_devices.push_token` | Yes (device id). Never in GDPR export. Wake payload is `{type}` only — no mail/task text |

Relay is **zero-knowledge**: cloud stores ciphertext only.

**Sign-out** clears access/refresh tokens, master key, pairing flag, sync cursor, and the local SQLite cache on device.

## App Store (Apple)

- **Privacy Nutrition Labels:** Data Linked to You → User Content (encrypted sync), Identifiers (device id), Contact Info (email if OAuth).
- **Permission strings (beta):** `NSCameraUsageDescription` for QR pairing only. Local due reminders use the system notification prompt (no extra Info.plist string). Do **not** declare `NSMicrophoneUsageDescription` until Capture ships. Do **not** declare `UIBackgroundModes: remote-notification` until remote push ships.
- **Encryption export:** App uses standard HTTPS + on-device crypto — declare exempt category in App Store Connect questionnaire unless legal advises otherwise.
- **Screenshots:** iPhone 6.7", 6.1", iPad 12.9" — dark Exo theme, Memory + Tasks tabs.

## Google Play

- **Data Safety form:** align with table above; mark encryption in transit and at rest (client-side).
- **Permissions (beta):** `POST_NOTIFICATIONS` + `SCHEDULE_EXACT_ALARM` for due-task reminders. No `RECORD_AUDIO` until Capture ships. Camera used for pairing QR via `mobile_scanner`. No FCM / remote-notification until push wake ships.
- **Target API:** follow Flutter default from generated `android/` (review each release).

## Beta program (GTM)

Before public listing:

- [ ] 10–20 testers on TestFlight + Play internal ([`gtm/go-sync-checklist.md`](gtm/go-sync-checklist.md))
- [ ] Privacy policy updated for mobile E2E sync (+ Capture when it ships)
- [ ] Support email in store listings

## Screenshot matrix (manual QA)

| Device | Orientation | Screens |
|--------|-------------|---------|
| iPhone SE | Portrait | Memory, Tasks, Settings pairing |
| iPhone 15 Pro Max | Portrait | Memory synced state |
| iPad Mini | Landscape | Navigation rail + Memory split |
| Pixel 6 | Portrait | Search, Settings |
| 10" tablet emulator | Landscape | Rail layout |

Store under `docs/store-screenshots/` when captured (not committed by default).
