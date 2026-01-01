# Low VRAM Mode & Model Status Display - Implementation Summary

## Overview
This implementation adds two features to the multimodal AI assistant:
1. **Low VRAM Mode**: Automatically unloads models after use to conserve GPU memory for other tasks (image generation and image description)
2. **Model Status Display**: Real-time monitoring of all models with device info and memory usage

## Features Implemented

### 1. Low VRAM Mode Configuration

#### Backend Changes
- **Config Flag** ([config.py](src/aiassistant/config.py)):
  - Added `LOW_VRAM_MODE` environment variable (default: `false`)
  - Set to `true` for systems with limited VRAM (< 8GB recommended)

- **Automatic Model Unloading**:
  - Image Generator: Unloads after each image generation
  - Image Explainer: Unloads after each image explanation
  - Frees CUDA memory immediately after use

#### Usage
Add to your `.env` file:
```env
LOW_VRAM_MODE=true
```

### 2. Model Status API

#### Endpoint
- **GET `/api/model-status`**: Returns comprehensive model information

### 3. Frontend Model Status Panel

#### Component: `ModelStatusPanel`
- **Location**: Right sidebar (toggle with "🔧 Model Status" button)
- **Features**:
  - Real-time model monitoring (auto-refresh every 5 seconds)
  - Color-coded device indicators (CUDA: green, CPU: blue, Remote: purple)
  - Memory usage display for each model
  - CUDA memory utilization chart
  - Low VRAM mode indicator
  - Manual refresh button

#### Visual Indicators
- **Loaded Status**: Green badge when loaded, gray when unloaded
- **Device Colors**:
  - 🟢 CUDA (Green) - GPU accelerated
  - 🔵 CPU (Blue) - CPU processing
  - 🟣 Remote (Purple) - External service (Ollama)
- **Memory Display**: Shows MB used per model
- **VRAM Alert**: Orange banner when Low VRAM mode is active

## How It Works

### Low VRAM Mode Flow
1. **Image Explanation**:
   ```
   User sends image → Load explainer model → Generate description → 
   Unload model (if LOW_VRAM_MODE=true) → Free CUDA memory
   ```

2. **Image Generation**:
   ```
   User requests image → Load generator model → Generate image → 
   Send to client → Unload model (if LOW_VRAM_MODE=true) → Free CUDA memory
   ```

## Performance Impact

- **Low VRAM Mode OFF**: Models stay loaded (faster, uses more VRAM)
- **Low VRAM Mode ON**: Models unload after use (slower reload, saves VRAM)
