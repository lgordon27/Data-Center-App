---
name: Preview route registration
description: The managed artifact proxy can fail even when the local web server is healthy.
---

The preview startup check must validate the artifact registration and then exercise the managed development command. Check the registered root path, service paths, port/environment agreement, and a deep client route alongside an API route that must remain JSON.

**Why:** The local Express/Vite server can return the correct SPA shell while an invalid artifact path or port prevents the Replit preview router from forwarding requests.

**How to apply:** Keep the check close to the artifact's startup/production validation and make its errors identify the invalid path or port registration directly.