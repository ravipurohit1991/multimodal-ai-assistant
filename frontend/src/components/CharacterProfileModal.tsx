import React, { useState, useRef } from "react";
import { Theme } from "../theme";

interface CharacterProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterType: "user" | "assistant";
  currentImage: string | null;
  theme: Theme;
  onImageUpdate: (image: string, path: string) => void;
}

export function CharacterProfileModal({
  isOpen,
  onClose,
  characterType,
  currentImage,
  theme,
  onImageUpdate,
}: CharacterProfileModalProps) {
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(currentImage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerate = async () => {
    if (!description.trim()) {
      alert("Please enter a character description");
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/api/character/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          character_type: characterType,
          description: description.trim(),
          width: 512,
          height: 768,
        }),
      });

      const result = await response.json();
      if (result.success && result.image) {
        const imageData = `data:image/png;base64,${result.image}`;
        setPreviewImage(imageData);
        onImageUpdate(imageData, result.path);
      } else {
        alert(`Failed to generate image: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error generating character image:", error);
      alert("Failed to generate character image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("character_type", characterType);

      const response = await fetch("http://127.0.0.1:8000/api/character/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      if (result.success && result.image) {
        const imageData = `data:image/png;base64,${result.image}`;
        setPreviewImage(imageData);
        onImageUpdate(imageData, result.path);
      } else {
        alert(`Failed to upload image: ${result.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error uploading character image:", error);
      alert("Failed to upload character image");
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const title = characterType === "user" ? "Your Character Profile" : "Assistant Character Profile";

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div className="modal-content character-profile-modal" onClick={(e) => e.stopPropagation()} style={{
        background: "white",
        borderRadius: 12,
        boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
        maxWidth: 600,
        width: "90%",
        maxHeight: "90vh",
        overflow: "auto"
      }}>
        <div className="modal-header" style={{
          padding: 20,
          borderBottom: "1px solid #e1e8ed",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#2d3748" }}>{title}</h2>
          <button className="close-button" onClick={onClose} style={{
            background: "none",
            border: "none",
            fontSize: 24,
            cursor: "pointer",
            color: "#718096"
          }}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          <div className="character-preview" style={{
            width: "100%",
            height: 300,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            overflow: "hidden",
            background: "#f7fafc"
          }}>
            {previewImage ? (
              <img src={previewImage} alt={`${characterType} character`} className="character-image" style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain"
              }} />
            ) : (
              <div className="character-placeholder" style={{
                textAlign: "center",
                color: "#a0aec0",
                fontSize: 16
              }}>
                <span>No character image set</span>
              </div>
            )}
          </div>

          <div className="character-actions">
            <h3 style={{ fontSize: 16, marginBottom: 8, color: "#2d3748" }}>Generate Character Image</h3>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your character (e.g., 'a young woman with long brown hair, wearing a casual t-shirt, friendly smile')"
              rows={4}
              className="character-description-input"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 6,
                border: "1px solid #e1e8ed",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "vertical",
                marginBottom: 10
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !description.trim()}
              className="generate-button"
              style={{
                width: "100%",
                padding: 12,
                background: isGenerating || !description.trim() ? "#e2e8f0" : "#48bb78",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: isGenerating || !description.trim() ? "not-allowed" : "pointer"
              }}
            >
              {isGenerating ? "Generating..." : "Generate Image"}
            </button>

            <div className="divider" style={{
              margin: "20px 0",
              textAlign: "center",
              position: "relative"
            }}>
              <span style={{
                background: "white",
                padding: "0 10px",
                color: "#a0aec0",
                fontSize: 14,
                position: "relative",
                zIndex: 1
              }}>OR</span>
              <div style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                height: 1,
                background: "#e1e8ed",
                zIndex: 0
              }} />
            </div>

            <h3 style={{ fontSize: 16, marginBottom: 8, color: "#2d3748" }}>Upload Character Image</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="upload-button"
              style={{
                width: "100%",
                padding: 12,
                background: isUploading ? "#e2e8f0" : "#4299e1",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                cursor: isUploading ? "not-allowed" : "pointer"
              }}
            >
              {isUploading ? "Uploading..." : "Choose File"}
            </button>
          </div>
        </div>

        <div className="modal-footer" style={{
          padding: 20,
          borderTop: "1px solid #e1e8ed",
          display: "flex",
          justifyContent: "flex-end"
        }}>
          <button onClick={onClose} className="button-secondary" style={{
            padding: "10px 20px",
            background: "#e2e8f0",
            color: "#2d3748",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer"
          }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
