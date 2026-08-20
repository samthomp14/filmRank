import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'

interface AvatarCropModalProps {
  open: boolean
  imageSrc: string | null
  onClose: () => void
  onConfirm: (croppedAreaPixels: Area) => void
  confirming?: boolean
}

export default function AvatarCropModal({ open, imageSrc, onClose, onConfirm, confirming }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  if (!open || !imageSrc) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 max-w-md w-full relative">
        <button
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <h2 className="text-xl font-bold mb-4 text-foreground">Adjust Photo</h2>
        <div className="relative w-full h-72 bg-muted rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-foreground mb-1">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div className="flex justify-end mt-6 gap-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-secondary text-foreground font-medium hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            Cancel
          </button>
          <button
            onClick={() => croppedAreaPixels && onConfirm(croppedAreaPixels)}
            disabled={!croppedAreaPixels || confirming}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
          >
            {confirming ? 'Saving...' : 'Save Photo'}
          </button>
        </div>
      </div>
    </div>
  )
}
