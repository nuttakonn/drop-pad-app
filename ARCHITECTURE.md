# DropPad Architecture

This document describes the technical architecture and data flow of DropPad.

## 🏗️ System Overview

DropPad is built on the **Cloudflare Edge Stack**, ensuring low latency and high scalability without managing traditional server infrastructure.

```mermaid
graph TD
    Client[Browser / React]
    Edge[Cloudflare Edge Network]
    Worker[Hono API / CF Worker]
    D1[(D1 Database)]
    R2[(R2 Storage)]
    
    Client -->|HTTPS| Edge
    Edge -->|Execute| Worker
    Worker -->|Query| D1
    Worker -->|Stream| R2
```

## 🔄 Request Flows

### Workspace Creation
1. Client sends `POST /api/workspaces` (optional: password).
2. Worker generates a unique 8-character ID and hashes password if provided.
3. Worker saves workspace metadata to **D1** with an `expires_at` timestamp.
4. Returns the ID and expiry to the client.

### Smart File Upload Strategy
DropPad automatically selects the best upload method based on file size:

1. **Standard Upload (< 100MB)**:
    - Client requests a presigned `PUT` URL from `/api/uploads/presign`.
    - Client uploads directly to **R2** using the signed URL.
    - Client notifies `/api/uploads/complete` to register the file in **D1**.

2. **Multipart Upload (> 100MB)**:
    - Client initiates a session via `/api/uploads/multipart/initiate`.
    - Client splits the file into 10MB chunks.
    - Each chunk is signed via `/api/uploads/multipart/sign-part` and uploaded directly to **R2**.
    - Client completes the session via `/api/uploads/multipart/complete` to merge parts and register in **D1**.

This strategy ensures that large files (up to 5GB) bypass Cloudflare Worker body limits while maintaining real-time progress tracking.

## 🧹 Cleanup Logic (Auto-Expiration)

A Cloudflare **Cron Trigger** (Scheduled Event) runs every hour (configurable) to purge expired data.

```mermaid
sequenceDiagram
    participant Cron as Cron Trigger
    participant Worker as Cleanup Service
    participant D1 as D1 Database
    participant R2 as R2 Storage
    
    Cron->>Worker: Trigger Scheduled Event
    Worker->>D1: Query expired workspace IDs
    D1-->>Worker: List of IDs
    loop Each Expired Workspace
        Worker->>R2: List and Delete objects with ID prefix
        Worker->>D1: Delete workspace_items and workspace records
    end
    Worker->>Cron: Complete (Summary logged)
```

## 🔒 Security Measures
- **MIME Validation**: Strict whitelist for uploaded files.
- **Filename Sanitization**: Prevents path traversal and shell injection.
- **D1 Prepared Statements**: Protects against SQL injection.
- **Content Security Policy (CSP)**: Injected via middleware to prevent XSS.
