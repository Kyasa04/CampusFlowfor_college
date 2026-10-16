# CampusFlow - Complete Fresh Project

This package contains the current CampusFlow frontend plus a working Spring Boot backend.

## Structure

CampusFlow-Complete/
  extension/
    content.js
    campusflow.css
    manifest.json
  backend/
    complaint-service/
  docs/
    SOA-ARCHITECTURE.md

## Frontend

The extension keeps the CampusFlow UI and ERP behavior:
- CampusFlow appears after ERP login
- No top-right close button
- Raise Official Issue
- My Complaints
- Notifications
- Total / Pending / Resolved / Notifications
- Categories and departments
- Image upload
- Submitted -> In Progress -> Resolved
- ERP menu navigation closes CampusFlow
- Backend-first storage with local fallback

## Backend

Run from:
backend/complaint-service

Server:
http://localhost:8080

Health:
GET http://localhost:8080/api/health

The extension uses http://localhost:8080 automatically.

## Important

Open the extension folder in Chrome:
chrome://extensions
Developer mode -> Load unpacked -> select the `extension` folder.

Start the Spring Boot backend before testing backend storage.

If the backend is unavailable, the frontend falls back to its local demo storage so the UI does not break.
