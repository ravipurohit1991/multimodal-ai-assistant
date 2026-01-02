# Build System Setup - Instructions

## Overview

The project uses **Hatch** as the build backend with a custom build hook that automatically compiles the frontend during package installation.

## How to Build and Install

### Development (Editable) Install

This will build the frontend and copy it to `src/aiassistant/frontend/`:

```bash
pip install -e .
```

### Production Install

```bash
pip install .
```

### Build Wheel Without Installing

```bash
pip install hatch
hatch build
```

This creates distribution files in the `dist/` directory.

## Directory Structure After Build

```
src/aiassistant/
  frontend/          # Compiled frontend (auto-generated)
    index.html
    assets/
      *.js
      *.css
```

## Frontend Development

For development with hot reload, you can still run:

```bash
cd frontend
npm run dev
```

This starts the Vite dev server on `http://localhost:5173`.

## Requirements

- **Node.js and npm** must be installed for the build to work
- The build hook will fail with a clear error if npm is not found

## Serving the Frontend

The FastAPI app now serves:
- **`/`** → Frontend `index.html`
- **`/assets/*`** → Frontend static assets
- **`/api/*`** → API endpoints
- **`/ws`** → WebSocket endpoint

## Notes

- The `dist/` directory (frontend build output) is in `.gitignore`
- The `src/aiassistant/frontend/` directory (copied frontend) should also be in `.gitignore` for development
- The frontend is automatically included in the wheel package via `force-include`
