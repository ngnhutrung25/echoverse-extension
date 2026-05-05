import { getRandomLandscapeImage } from "./landscape-images.js";

/**
 * Log with timestamp
 */
export function log(message) {
  const timestamp = new Date().toLocaleString();
  console.log(`[${timestamp}] ${message}`);
}

/**
 * Get random image with direct fetch (no caching)
 * @returns {Promise<string>} Image data URL or original URL
 */
export async function getRandomPreloadedImage() {
  const imageUrl = getRandomLandscapeImage();

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    log(`Loaded image: ${imageUrl}`);
    return dataUrl;
  } catch (error) {
    log(`Failed to load image: ${imageUrl}`, error);
    return imageUrl; // fallback to original URL
  }
}
