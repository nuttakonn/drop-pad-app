# DropPad 🚀

**DropPad** is a lightweight, temporary workspace application designed for developer teams. It solves the "quick transfer" problem: sharing snippets, notes, and files between restricted environments (like VMs) and local machines without the friction of accounts or permanent storage.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Built with: Cloudflare](https://img.shields.io/badge/Built%20with-Cloudflare-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

---

## 🚀 Step 1: Deploy in 5 Minutes (No Tech Knowledge Needed)

DropPad runs on Cloudflare for free. Follow these simple steps to get your own instance:

1. **Get the Code**: Click the "Use this template" or "Fork" button on GitHub to get your own copy of this project.
2. **Cloudflare Account**: Sign up for a free [Cloudflare Account](https://dash.cloudflare.com/sign-up).
3. **Connect to Pages**:
   - Go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
   - Select your `drop-pad-app` repository.
   - **Build settings**:
     - Framework preset: `Vite`
     - Build command: `pnpm install && pnpm --filter web build`
     - Build output directory: `apps/web/dist`
   - Click **Save and Deploy**.
4. **Setup Database & Storage**:
   - In Cloudflare Dashboard, go to **Workers & Pages** > **D1** > **Create database** > Name it `droppad-db`.
   - Go to **R2** > **Create bucket** > Name it `droppad`.
5. **Connect Everything**:
   - Go back to your **Pages** project settings > **Functions** > **Compatibility flags** > Add `nodejs_compat`.
   - Under **Bindings**, add:
     - **D1 database binding**: Variable name `DB`, select `droppad-db`.
     - **R2 bucket binding**: Variable name `STORAGE`, select `droppad`.
   - Redeploy your project. **Done!**

---

## ✨ Key Features

- **Zero Friction**: No accounts, no logins, no persistent tracking.
- **Multipart Uploads**: Support for massive files (up to 5GB) using chunked parallel uploads.
- **Direct-to-R2**: Uploads bypass Worker limits, ensuring reliability and speed.
- **Workspace Protection**: Optional password-secured workspaces with salted SHA-256 hashing.
- **Clipboard-First**: Paste images or text directly (**Ctrl+V**) for instant sharing.
- **Rate Limiting**: Built-in protection against automated spam and brute-force attacks.
- **Self-Cleaning**: Automated 24-hour expiration of workspaces, files, and orphaned uploads.
- **Mobile Hand-off**: Integrated QR code sharing for quick mobile access.

## 📖 System Guide

### Using your Workspace
- **Create**: Click "Create New Workspace". Optionally expand "Security Options" to set a password.
- **Join**: If your team already has a workspace, enter the **Workspace ID** in the join box.
- **Share**: Use the **Share** button to copy the link or the **QR Code** icon for mobile access.
- **Notes**: Type directly into the text area. Markdown is supported.
- **Files**: Drag files into the window or use the **Upload** button. Files >100MB are handled automatically via multipart.
- **Manage**: Every item has a **Delete** button to remove it before the auto-expiration.

### Technical Reference

#### Environment Variables & Bindings
| Binding | Type | Description |
| --- | --- | --- |
| `DB` | D1 Database | Stores workspace metadata and item lists. |
| `STORAGE` | R2 Bucket | Stores the actual file blobs. |
| `R2_BUCKET_NAME` | Variable | The name of your R2 bucket. |

#### Required Secrets (Cloudflare Worker)
To support direct-to-R2 uploads and JWT auth, you must set these secrets:
```bash
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put JWT_SECRET
```

#### Mandatory R2 CORS Configuration
For uploads to work from your browser, you **must** configure CORS on your R2 bucket:
1. Go to **R2** > Select your `droppad` bucket.
2. Go to **Settings** > **CORS Policy**.
3. Add the following JSON policy:
```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

#### Cleanup Cron Trigger
To enable automated cleanup, add a **Cron Trigger** to your `droppad-api` worker:
`0 * * * *` (Runs every hour).

---

### 📝 License
Distributed under the MIT License. See `LICENSE` for more information.

*Built with ❤️ by Nuttakon*
