# Frontend Services

This folder is the frontend integration boundary for capabilities that should not live inside page components.

Use it for:

- Qiandao SDK adapters and OpenAPI clients that are safe for the WebView.
- Local storage adapters shared by pages.
- Feature services such as SPU search, user asset pool sync, and export history sync.

Avoid putting secrets, long-lived tokens, or app-level authorization flows here. Those belong in `backend/`.
