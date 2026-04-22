# Implementation Plan: The 5-Feature Upgrade

We will build all five features simultaneously without breaking any existing endpoints.

## Proposed Changes

### 1. Google Maps Heatmap
- **Frontend (`App.tsx`)**: Update `useJsApiLoader` to strictly include `libraries: ['visualization']`.
- Add `<HeatmapLayer>` underneath the existing Map component. We will feed it a newly mapped array `data: needs.map(n => ({ location: new window.google.maps.LatLng(n.location.lat, n.location.lng), weight: n.criticalityScore }))`.
- Configured gradient: Green -> Yellow -> Red scaling from Criticality 0 -> 100.

### 2. Exact Priority Scoring System Formula
- **Backend (`deduplication.ts`)**: Rebuild the `newCriticalityScore` formula:
  - `report_velocity`: computed by delta of reports over 1 hour.
  - `severity_weight`: 0-100 base on dictionary.
  - `vulnerability_index`: calculated based on 'estimatedScale'.
  - Equation: `(velocity x 0.4) + (severity x 0.4) + (vulnerability x 0.2)`. Score clamped to 0–100.
- **Frontend (`App.tsx`)**:
  - Auto-sort `needs.sort()` before rendering feed.
  - Render a visible colored badge beside the incident.

### 3. Strict Offline PWA Banners
- **Frontend (`offlineSync.ts` & `App.tsx`)**: We already built standard offline intercept, but we will add explicit state variables `syncCount` to display your rigid required strings:
  - "You are offline — reports will sync when connected" in a persistent banner.
  - "Syncing X reports..." toast on reconnect.

### 4. Voice Reporting via Gemini API
- **Frontend (`App.tsx`)**: Add a microphone button next to the textarea. Using `navigator.mediaDevices`, we will record up to 15 seconds of generic `audio/webm`.
- **Backend (`server.ts` & `aiService.ts`)**: Add `POST /ingest-audio`. We will pass `mimeType: "audio/webm"` and the base64 structure directly to `gemini-1.5-flash` (it reads audio natively like text!).
- **Frontend Form Autofill**: When `/ingest-audio` returns the structured JSON, we will replace the raw `textarea` with a popup/preview of the parsed struct (Location, CrisisType, Impact limit) giving the user an edit window before they hit Submit.

### 5. FCM / Auto-Alerts Banner
- **Backend Tracking**: Update `getRecentUnresolvedNeeds()` (which polling hits) to calculate if an incident is unassigned > 30 minutes OR score > 80.
- **Frontend Alert Banner**: Check for these conditions locally based on the feed delta. Show a fixed bottom HUD banner "CRITICAL ALERT: ... [Assign Now]" which bypasses click directly to the dispatch REST call.
- **Push Notifications (FCM)**: Using `Notification.requestPermission()`. If permitted, we simulate a system push for presentation to the NGO dashboard without explicitly tying complicated FCM Web Tokens.

## Open Questions for the User
> [!IMPORTANT]
> 1. For **Voice Recording**, some Windows/macOS browsers block `getUserMedia` without `https`. During local dev `localhost:5173` normally skips this restriction. Let me know if you run into permission issues.
> 2. For **Firebase Cloud Messaging (FCM)**: To do *real* external Google Push Notifications to the browser tray, it requires generating a VAPID Key in Firebase Console. Since you requested not to break the `.env` setup, I will implement **In-App Notification Banners** and standard HTML5 Desktop Notifications instead of deep FCM web-tokens. Is this acceptable for the presentation?

Please approve this plan so we can execute immediately.
