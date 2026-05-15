# Release Notes - v0.1.0 (MVP)

We are excited to announce the first public MVP release of **DropPad**!

## 🚀 Features
- **Instant Workspaces**: Zero-config, anonymous workspaces for quick data sharing.
- **File Sharing**: Drag-and-drop or paste (Ctrl+V) files directly into the browser.
- **Markdown Notes**: Rich text support with real-time preview.
- **Auto-Expiration**: Self-cleaning infrastructure that purges data after 24 hours.
- **Mobile Friendly**: QR code sharing for quick VM-to-mobile handoffs.
- **Secure by Default**: Strict MIME validation and sanitized file storage.

## 📦 Technical Highlights
- Powered by **Cloudflare Workers, D1, and R2**.
- Built with **Hono** and **React + Vite**.
- Structured JSON logging and observability enabled.
- Fully containerized local development with Docker.

## ⚠️ Known Limitations
- Real-time updates use 5-second polling (WebSockets planned for v0.2.0).
- Maximum file size is currently 50MB.
- Only supports one expiration period (24 hours).

## 🛠️ Deployment Notes
See the [Deployment Guide](README.md#🌐-deployment-checklist) for instructions on setting up your own instance on Cloudflare.
