import { supabase } from './supabaseClient'

export const AVATAR_BUCKET = 'avatars'
export const AVATAR_MAX_RAW_BYTES = 8 * 1024 * 1024
export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const AVATAR_OUTPUT_SIZE = 512
export const AVATAR_OUTPUT_QUALITY = 0.85

/** Client-side validation mirroring the bucket's file_size_limit/allowed_mime_types (defense in depth). */
export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_ACCEPTED_TYPES.includes(file.type)) {
    return 'Please upload a JPEG, PNG, or WebP image.'
  }
  if (file.size > AVATAR_MAX_RAW_BYTES) {
    return 'Image must be smaller than 8MB.'
  }
  return null
}

/** Draws the given square crop region (source-image pixel coords) onto a fixed-size canvas and encodes it as WebP. */
export function cropToWebpBlob(
  image: HTMLImageElement,
  cropBox: { x: number; y: number; size: number }
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(
    image,
    cropBox.x, cropBox.y, cropBox.size, cropBox.size,
    0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE
  )
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      'image/webp',
      AVATAR_OUTPUT_QUALITY
    )
  })
}

/** Uploads the cropped/compressed blob, updates users.avatar_filename, and cleans up the previous avatar object. */
export async function uploadAvatar(
  userId: string,
  blob: Blob,
  previousPath: string | null
): Promise<string> {
  const path = `${userId}/avatar-${Date.now()}.webp`

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (uploadError) throw uploadError

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_filename: path })
    .eq('id', userId)
  if (updateError) throw updateError

  if (previousPath) {
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([previousPath])
    if (removeError) console.warn('Failed to remove previous avatar', previousPath, removeError)
  }

  return path
}

/** Removes the current avatar (storage object + DB reference). */
export async function removeAvatar(userId: string, currentPath: string): Promise<void> {
  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_filename: null })
    .eq('id', userId)
  if (updateError) throw updateError

  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([currentPath])
  if (removeError) console.warn('Failed to remove avatar object', currentPath, removeError)
}

export function getAvatarPublicUrl(path: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}
