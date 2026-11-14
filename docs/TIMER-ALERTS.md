# Timer sound and vibration

Background push was added on 14 November 2026. Installed iPhone users can now opt into server-scheduled Lock Screen notifications. See [BACKGROUND-ALERTS.md](BACKGROUND-ALERTS.md) for setup, sound limitations and the physical-phone test. The browser audio and visual-alarm behavior described below still applies inside the app.

Updated 12 November 2026 after an iPhone Safari report of silent timer expiry.

The previous timer only emitted oscillator tones if its AudioContext already existed and was running. It silently skipped sound when the context was missing after reload or suspended by the browser. Web Audio can also follow different iPhone mute-switch behavior from media-element playback. Settings displayed vibration as enabled even when the browser exposed no vibration API.

The timer now reuses a single HTML audio player with a bundled four-pulse WAV. The louder version has a 94% sample peak and an average signal level 7.6 dB above the previous file, with smooth edges and no clipped samples. It uses a new asset URL so clients fetch the revised sound. User taps prime that same element before asynchronous workout writes. Playback repeats at expiry until the alarm is dismissed; failures expose a Play sound retry. Test sound plays one cycle. Priming cannot pause an alarm that is already starting, and intentionally stopping playback does not report a blocked-audio error.

A prominent Rest complete pop-up opens at expiry independently of the sound and vibration settings. It shows 00:00, the exercise and a large Dismiss alarm button; exercise breaks also offer Next exercise. The pop-up appears across app routes, stays until acknowledged, and survives reloads. Acknowledging it stops the sound and clears the completed timer. Outside taps do not dismiss it accidentally. The dialog uses focus management, a descriptive alertdialog role and static high-contrast styling without flashing. It is an in-app alert, not an operating-system alarm when Safari is suspended.

Settings includes Test sound and, when the API exists, Test vibration. Unsupported vibration is disabled and visibly unavailable without changing the owner's saved preference for other devices. Sound and vibration are independent, so a vibration rejection cannot suppress audio. The alarm asset is included in the PWA offline precache.

Safari on iPhone does not expose the web vibration API. A web app cannot enable automatic haptics there. Keep the timer in the foreground and media volume audible; iOS suspension or a locked screen can still delay a web timer. Browser playback tests cannot establish that a physical phone's speaker volume, routing or vibration motor works.

Implementation references: [Safari autoplay guidance](https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/), [WebKit audio/mute behavior report](https://bugs.webkit.org/show_bug.cgi?id=252746), and [MDN vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).

## Verification

The louder-alarm/pop-up follow-up passed the production build, strict TypeScript, 34 unit/component tests and all 15 browser tests (2.2 minutes), including mobile WebKit. Browser checks confirm repeating playback, dismissal stopping audio, visual alarms with both sound and vibration disabled, alerts on Home, persistence through reload and the Next exercise action. A separate browser-local timer on the LAN preview passed at 360x800 in WebKit without changing server data; the pop-up fit the viewport, playback used full media-element volume and repeat, and dismissal cleared the timer without browser errors.

The production build and strict TypeScript passed, as did 33 unit/component tests and all 15 browser tests. New Chromium and mobile WebKit checks use native media decoding/playback and verify that unmuted playback advances past the alarm's silent introduction. They cover timer expiry, re-enabling sound after reload, rejected playback with a successful manual retry, and unavailable vibration in WebKit. Chromium vibration calls are instrumented; these tests do not claim physical hardware feedback.

A read-only WebKit check against the LAN preview also passed: Test sound started and advanced into the alarm, vibration showed disabled/unavailable, and there were no browser errors. No saved owner preferences or workouts were changed by that preview check.
