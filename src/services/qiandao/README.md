# Qiandao Frontend Boundary

This folder is prepared for Qiandao-native and Qiandao OpenAPI integration from the frontend side.

## Safe Here

- Typed request wrappers for public or backend-proxied Gooda APIs.
- SPU search UI adapters that call a Gooda backend.
- SDK wrappers for Qiandao native abilities available inside the app WebView.
- Types shared by editor UI and future SPU search UI.

## Not Safe Here

- App secrets.
- Client-credentials token exchange.
- Authorization-code exchange that requires a secret.
- Private OpenAPI calls made directly from the user's device.

## Current Status

The editor MVP uses local imports and local asset history. SPU search and user account sync are not connected yet.
