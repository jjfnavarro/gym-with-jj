# Background rest alerts

Added 14 November 2026, Asia/Manila.

## Enable on iPhone

1. Open the HTTPS site in Safari and use Share → Add to Home Screen if it is not already installed.
2. Open GYM WITH JJ from that Home Screen icon and apply the app update when offered.
3. In Settings → Lock Screen alerts, tap Enable Lock Screen alerts and allow notifications.
4. Keep Rest timer sound enabled. In iPhone Settings → Notifications → GYM WITH JJ, allow Lock Screen notifications and Sounds. Silent mode and Focus can silence ordinary push notifications.
5. Tap Test in 10 seconds, then lock the phone. Verify the actual Lock Screen alert and sound before a workout.

Start rest as usual and wait for “Lock Screen alert ready” before locking the phone. That status means the server saved the alert; it does not guarantee receipt. Network failure is visible in the timer and a message. If an offline pause/skip cannot reach the server, the previous alert may still arrive; reconnect to cancel it.

Notifications require internet and may be delayed by the push provider, iOS settings or system conditions. The PWA does not implement a Dynamic Island countdown, a Live Activity, a Clock-style alarm or an offline background alarm. Push sound uses the system notification channel; it cannot force volume, override Focus/Silent mode, or loop the bundled in-app WAV while iOS suspends the browser.

## Delivery

The installed app creates a per-device Web Push subscription after a direct permission-granting tap. Authentication, origin checks and CSRF protect subscription and scheduling routes. Subscription keys and endpoints remain server-side; endpoint validation permits only HTTPS browser-vendor push gateways, preventing arbitrary server-side requests.

One persistent PostgreSQL job per subscription stores the current rest deadline. Start/resume/restart/adjust replace it; pause/skip/dismiss/finish cancel it. Monotonically increasing revisions reject out-of-order writes. Opening the app after expiry never schedules a duplicate elapsed timer. Disabling alerts removes that device's pending job. Logout disables the supplied owned subscription. Disabling the global notification preference cancels the owner's pending jobs.

The API process polls each second. PostgreSQL row locks with SKIP LOCKED coordinate deployment overlap and multiple replicas. Pending jobs survive process restarts; failed sends retry briefly, invalid subscriptions are disabled, and alerts older than 60 seconds are dropped. Provider TTL is bounded to the remaining freshness window. Keep Railway serverless/app sleeping disabled so the polling worker remains available. No additional service or cron is needed.

The server creates one VAPID keypair lazily and stores it in PushCredentials, preserving it across deployments. Only the public application key is exposed to authenticated clients. The private key is never included in frontend assets, API responses, logs, exported workout backups or Git. No new Railway environment variables are required. Preserve this table with normal database backups; replacing the keypair requires clients to reconnect alerts.

Payloads use Apple's declarative format, including a visible title, body, navigable app URL and explicit silent preference. The existing generated Workbox worker imports push-events.js for compatible imperative push handling and notification navigation. This retains offline workout caching and the app's existing safe update prompt. A fixed notification tag collapses rest alerts. Provider delivery is best effort; a crash after a provider accepts a message can cause a retry, so exactly-once audible delivery is not promised.

## Verification boundaries

PostgreSQL tests exercise persistence across service instances, competing workers, revision ordering, cancellation, replacement, exercise-rest text, sound preference, retries, expiry, invalid subscriptions, authentication, CSRF and URL validation. Valid P-256 browser keys pass actual Web Push payload encryption and VAPID request generation with an injected delivery transport.

Browser tests exercise enrollment UI, ten-second test scheduling, ready status, pause/resume/adjust/skip, reload without duplicate expiry scheduling and iPhone Home Screen guidance. Chromium CDP injects a push event into a real service worker after the workout page is closed. The OS notification boundary is instrumented because automated headless browsers cannot establish physical notification permission, Lock Screen presentation or speaker output. These checks do not simulate an actual APNs delivery to an iPhone. The installed-app ten-second test above is the final physical-device check.

References: [WebKit iPhone Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/), [Web Push library](https://github.com/web-push-libs/web-push).
