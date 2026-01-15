// ============================================
// IMAGE HANDLING MODULE
// ============================================

import {
    MAX_IMAGE_SIZE,
    MAX_SESSION_STORAGE,
    embeddedStylesCache
} from './state.js';
import { showToast } from './ui.js';

// Session-only image storage
const uploadedImages = new Map();

// DOM element references (set by init())
let imageList = null;
let storageInfo = null;
let editor = null;

/**
 * Initialize the images module with DOM element references
 * @param {Object} elements - DOM element references
 * @param {HTMLElement} elements.imageList - Container for the image list
 * @param {HTMLElement} elements.storageInfo - Element to show storage usage
 * @param {HTMLElement} elements.editor - The editor textarea
 */
export function initImages(elements) {
    imageList = elements.imageList;
    storageInfo = elements.storageInfo;
    editor = elements.editor;
}

/**
 * Get the uploaded images map
 * @returns {Map<string, Object>} Map of image IDs to image data
 */
export function getUploadedImages() {
    return uploadedImages;
}

/**
 * Generate a UUID for image IDs
 */
function generateUUID() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Handle image upload from file input or drag-and-drop
 * @param {FileList} files - The files to upload
 */
export function handleImageUpload(files) {
    for (const file of files) {
        // Type check
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
            if (file.type === 'image/svg+xml') {
                showToast('SVG files are not supported due to security restrictions. Please convert to PNG or JPG.', 'error');
            } else {
                showToast(`${file.name}: Only PNG, JPG, GIF, WebP allowed`, 'error');
            }
            continue;
        }

        // Size check
        if (file.size > MAX_IMAGE_SIZE) {
            showToast(`${file.name}: Exceeds 10MB limit`, 'error');
            continue;
        }

        // Total session check
        const currentTotal = [...uploadedImages.values()].reduce((sum, img) => sum + img.size, 0);
        if (currentTotal + file.size > MAX_SESSION_STORAGE) {
            showToast('Session image storage limit (50MB) reached', 'error');
            break;
        }

        const id = generateUUID();
        const objectUrl = URL.createObjectURL(file);
        uploadedImages.set(id, { file, objectUrl, name: file.name, size: file.size });
    }

    renderImageList();
    updateStorageInfo();
}

/**
 * Render the image list in the sidebar
 * Uses event delegation for click handling
 */
export function renderImageList() {
    if (uploadedImages.size === 0) {
        imageList.innerHTML = '';
        return;
    }

    imageList.innerHTML = [...uploadedImages.entries()].map(([id, img]) => `
        <div class="image-item" data-id="${escapeHtml(id)}">
            <img src="${img.objectUrl}" alt="${escapeHtml(img.name)}">
            <div class="image-item-info">
                <div class="image-item-name">${escapeHtml(img.name)}</div>
                <div class="image-item-size">${formatBytes(img.size)}</div>
            </div>
            <div class="image-item-actions">
                <button class="image-item-btn insert-btn" type="button">Insert</button>
                <button class="image-item-btn delete delete-btn" type="button">X</button>
            </div>
        </div>
    `).join('');
}

/**
 * Event delegation handler for image list clicks
 * @param {MouseEvent} e - The click event
 */
export function handleImageListClick(e) {
    const insertBtn = e.target.closest('.insert-btn');
    const deleteBtn = e.target.closest('.delete-btn');

    if (insertBtn) {
        const imageItem = insertBtn.closest('.image-item');
        const id = imageItem?.dataset.id;
        if (id) insertImageMarkdown(id);
    } else if (deleteBtn) {
        const imageItem = deleteBtn.closest('.image-item');
        const id = imageItem?.dataset.id;
        if (id) removeImage(id);
    }
}

/**
 * Insert image markdown at cursor
 */
function insertImageMarkdown(id) {
    const img = uploadedImages.get(id);
    if (!img) return;

    const markdown = `![${img.name}](local://${id})`;
    insertAtCursor(editor, markdown);
    editor.focus();
    // Trigger input event manually
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Remove an image by ID
 */
function removeImage(id) {
    const img = uploadedImages.get(id);
    if (img) {
        URL.revokeObjectURL(img.objectUrl);
    }
    uploadedImages.delete(id);
    renderImageList();
    updateStorageInfo();
}

/**
 * Insert text at cursor position in textarea
 */
function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(textarea.selectionEnd);

    textarea.value = before + text + after;

    const newPos = start + text.length;
    textarea.setSelectionRange(newPos, newPos);
}

/**
 * Update storage info display
 */
function updateStorageInfo() {
    const total = [...uploadedImages.values()].reduce((sum, img) => sum + img.size, 0);
    storageInfo.textContent = `Session storage: ${formatBytes(total)} / 50 MB`;
}

/**
 * Map local image references (local://id) to blob URLs
 * @param {string} html - The HTML containing local image references
 * @returns {string} HTML with blob URLs substituted
 */
export function mapLocalImages(html) {
    return html.replace(/src="local:\/\/([^"]+)"/g, (match, id) => {
        const img = uploadedImages.get(id);
        if (img) {
            return `src="${img.objectUrl}"`;
        } else {
            return `src="" data-missing-local="${id}"`;
        }
    });
}

/**
 * Clean up all blob URLs to free memory
 * Should be called on page unload or when clearing all images
 */
export function cleanupAllImages() {
    for (const [id, img] of uploadedImages) {
        URL.revokeObjectURL(img.objectUrl);
    }
    uploadedImages.clear();
}

// Clean up blob URLs on page hide/unload to prevent memory leaks
// Using pagehide as modern replacement for unload (better for bfcache)
window.addEventListener('pagehide', cleanupAllImages);

/**
 * Get missing image names from markdown content
 * @param {string} markdown - The markdown content to search
 * @returns {string[]} Array of missing image names
 */
export function getMissingImageNames(markdown) {
    const localImageMatches = markdown.match(/local:\/\/([^)]+)/g) || [];
    return localImageMatches.map(match => {
        const id = match.replace('local://', '');
        const img = uploadedImages.get(id);
        return img ? img.name : 'unknown';
    }).filter(name => name !== 'unknown');
}

