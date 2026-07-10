/**
 * Client-side image compression using the Canvas API.
 *
 * Why client-side?
 * - Saves bandwidth (compressed image is uploaded, not the original 3-5MB)
 * - Saves Neon storage (compressed image is stored, ~70-85% smaller)
 * - No server load (browser does the work)
 * - Works offline / on mobile
 *
 * Compression settings (Balanced):
 * - Max dimension: 1600px (preserves readability of document text)
 * - Output format: JPEG (better compression than PNG for photos)
 * - Quality: 75 (good balance of quality and size)
 * - Expected result: 3MB photo → ~750KB (75% reduction)
 *
 * Non-image files (PDFs, Word, Excel) are returned unchanged — they're
 * already optimized and usually small (50-500KB).
 */

interface CompressOptions {
  maxDimension?: number; // Max width or height in pixels (default 1600)
  quality?: number; // JPEG quality 0-1 (default 0.75)
  mimeType?: string; // Output MIME type (default "image/jpeg")
}

interface CompressResult {
  file: File; // The compressed file (or original if not an image)
  originalSize: number;
  compressedSize: number;
  compressionRatio: number; // 0-1, e.g. 0.25 means compressed to 25% of original
  wasCompressed: boolean;
}

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

function isImageFile(file: File): boolean {
  if (IMAGE_MIME_TYPES.includes(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Compress a single image file using Canvas API.
 * Non-image files are returned unchanged.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> {
  const { maxDimension = 1600, quality = 0.75, mimeType = "image/jpeg" } = options;
  const originalSize = file.size;

  // Skip non-images
  if (!isImageFile(file)) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      wasCompressed: false,
    };
  }

  try {
    // Load the image into an HTMLImageElement
    const img = await loadImage(file);

    // Calculate new dimensions (maintain aspect ratio, cap at maxDimension)
    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    // Draw to canvas at the new dimensions
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // White background (for PNGs with transparency → JPEG)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Draw the image
    ctx.drawImage(img, 0, 0, width, height);

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, quality);
    });

    if (!blob) throw new Error("Canvas toBlob returned null");

    // Only use the compressed version if it's actually smaller than the original
    // (for very small images, compression might increase size)
    if (blob.size >= originalSize) {
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1,
        wasCompressed: false,
      };
    }

    // Create a new File from the blob
    // Preserve the original filename but change extension to .jpg
    const originalName = file.name;
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const compressedName = `${baseName}.jpg`;
    const compressedFile = new File([blob], compressedName, { type: mimeType });

    return {
      file: compressedFile,
      originalSize,
      compressedSize: blob.size,
      compressionRatio: blob.size / originalSize,
      wasCompressed: true,
    };
  } catch (e) {
    // If compression fails for any reason, return the original file
    console.warn("Image compression failed, using original:", e);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      compressionRatio: 1,
      wasCompressed: false,
    };
  }
}

/**
 * Compress multiple image files in parallel.
 * Returns results in the same order as the input.
 */
export async function compressImages(
  files: File[],
  options?: CompressOptions
): Promise<CompressResult[]> {
  return Promise.all(files.map((f) => compressImage(f, options)));
}

/**
 * Load a File into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Format bytes into a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
