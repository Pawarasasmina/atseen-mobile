# OnlyMe mobile

Expo SDK 57 React Native app for the same OnlyMe backend used by the web frontend.

## Run

1. Copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_API_BASE_URL` for your device.
2. Start the backend on port `5000`.
3. Run `npm install`, then `npm start`.
4. Scan the QR code with Expo Go, or press `a` for Android.

Expo Go and Expo CLI must normally be signed in to the same Expo account. Run `npx expo login` on the computer, sign in inside Expo Go on the phone, and restart with `npm run start:go`. If Expo's account service is unavailable, use `npm run start:offline` while the phone and computer are on the same Wi-Fi. If LAN discovery is blocked, use `npm run start:tunnel` after signing in.

For a physical phone, use the development computer's LAN IP instead of `localhost`, and allow the backend port through the firewall. Long-press the sparkle button in the Seen header to log out during this early milestone.
