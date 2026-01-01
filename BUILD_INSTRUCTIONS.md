# Build System Setup - Instructions

## Overview

The project uses **Hatch** as the build backend with a custom build hook that automatically compiles the frontend during package installation.

## What Changed

1. **`hatch_build.py`** - Custom build hook that:
   - Runs `npm install` in the frontend directory
   - Runs `npm run build` to compile the frontend
   - Copies the compiled frontend to `src/aiassistant/frontend/`

2. **`pyproject.toml`** - Updated to:
   - Use `hatchling` as the build backend
   - Configure the custom build hook
   - Force-include the compiled `dist/` directory as `aiassistant/frontend/`
   - Track version in `src/aiassistant/__init__.py`

3. **`frontend/vite.config.ts`** - Updated to:
   - Output build to `../dist/` directory instead of default `dist/`

4. **`src/aiassistant/app.py`** - Updated to:
   - Serve frontend static files from `aiassistant/frontend/`
   - Mount `/assets` route for frontend assets
   - Serve `index.html` at root path `/`
   - Move health check to `/api/health`

5. **`src/aiassistant/__init__.py`** - Created to:
   - Define package version (tracked by Hatch)

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
