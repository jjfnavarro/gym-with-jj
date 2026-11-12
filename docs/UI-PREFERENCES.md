# Mobile UI and rest preferences

For the subsequent Safari sound fix and browser-specific vibration availability, see [TIMER-ALERTS.md](TIMER-ALERTS.md).

Updated 12 November 2026, Asia/Manila. This pass follows the owner's preference for a simpler phone interface and retains the GYM WITH JJ logo.

## Interface

The latest Home pass keeps Start new workout and Resume workout, with a shorter active-workout heading, set count and thin progress bar. A seven-day calendar replaces the summary cards; completed days are highlighted and today is outlined. The most recent workout is a single linked row. The split-day grid, personal-record list, duplicate history shortcut and empty-state paragraphs are removed from Home; their full modules remain available through navigation. The calendar uses the saved timezone and a Monday-based week, and its workout counts are available to screen readers.

The large orange dumbbell background now appears throughout the authenticated app and on the login page. A shared decorative component preserves Home's original size, angle and 9% opacity. Its fixed, clipped layer sits behind page content, ignores pointer input and is hidden from screen readers. Login uses the full viewport; authenticated mobile pages keep the background between the header and bottom navigation. Cards, inputs and dialogs retain their existing opaque surfaces for readability.

- The header has icon-only light/dark and refresh controls. Normal synchronization wording, avatar decorations and the sidebar quote are removed. Offline and synchronization errors remain visible when action is needed.
- Home starts with a plain heading and a large Start new workout button. The motivational hero, green sticker and diagonal-arrow decorations are removed.
- Module headings use their names alone. Buttons, form fields, navigation labels and workout text are larger. Primary buttons use a solid coral surface and a subtle lower edge.
- Theme changes persist locally immediately and synchronize online. Refresh synchronizes pending workout edits and fetches current data without resetting the active workout, timer or unsaved Settings draft.

## Rest timers

Settings includes separate defaults for set rest and exercise rest. Under Rest by muscle group, enable a muscle to customize both durations. Overrides apply to new workouts; the exercise break uses the muscle just trained. Without a muscle override, prescribed set-rest targets continue to apply.

All rest-duration settings and workout controls use minutes, including decimal values such as 0.5, 1.5 and 2. Existing saved durations retain their exact timing; countdowns use minutes:seconds.

The minutes update passed the production build, 29 unit/component tests and all 12 mobile/desktop browser tests (50.1 seconds). A read-only LAN preview check confirmed that minute fields match the existing saved durations and fit at 360px.

The live workout exposes Between sets and Before next exercise independently for each exercise. Completing a nonfinal set starts set rest. Completing the final working set starts an exercise break when another unfinished exercise remains. The timer offers Next exercise after the break, and Skip rest can continue sooner. Manually restarting or adjusting that break preserves its next-exercise destination.

The database migration `202611110001_exercise_rest` adds the exercise-rest snapshot to session exercises. Existing data is retained, and older local sessions/settings receive schema defaults when read.

## Local preview

The preview serves the production frontend and API together on port 5173. Open the computer's LAN address from a phone on the same Wi-Fi. The ignored local preview database is separate from the disposable database ending in `_test`; browser and API tests reset only the latter.

## Verification

Strict TypeScript and the production build passed, along with 28 unit/component tests, 15 real PostgreSQL integration tests and all 12 mobile/desktop browser tests (59.9 seconds). Browser coverage includes 360px route overflow, larger workout inputs, offline reload and queue ordering, theme persistence, preserving unsaved Settings while toggling theme, both muscle-specific rest durations, refreshing an active workout, restarting an exercise break and continuing to the next exercise.

A read-only authenticated check of the LAN preview at 390px also passed with no horizontal overflow or browser errors. The existing preview splits and history were retained.

Physical-phone keyboard behavior, Safari and locked-screen timer alerts still require device testing. Local-network HTTP supports workout logging; service-worker installation outside localhost requires HTTPS. The previously verified Docker image predates these UI changes and has not been rebuilt for this pass.
