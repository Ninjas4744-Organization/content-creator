import { CatalogError } from "./catalog-domain.mjs";
import defaults from "../fixtures/backgrounds.json" with { type: "json" };

export const maxBackgroundBytes = 8 * 1024 * 1024;
export const backgroundFilePattern = /^[a-f0-9]{64}\.(png|jpg)$/;
export const defaultBackgrounds = defaults.backgrounds;
const fail = (message) => {
	throw new CatalogError(message);
};

export function validateBackgroundAsset(asset) {
	if (
		!asset ||
		typeof asset !== "object" ||
		!backgroundFilePattern.test(asset.file) ||
		asset.sha256 !== asset.file.slice(0, 64) ||
		asset.contentType !== (asset.file.endsWith(".png") ? "image/png" : "image/jpeg") ||
		!Number.isInteger(asset.size) ||
		asset.size < 1 ||
		asset.size > maxBackgroundBytes ||
		![asset.width, asset.height].every((n) => Number.isInteger(n) && n > 0 && n <= 8192) ||
		asset.width * asset.height > 32_000_000
	)
		fail("קובץ הרקע אינו תקין. יש להעלות תמונת PNG או JPEG עד 8MB.");
	return structuredClone(asset);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
	for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
	return n >>> 0;
});
function crc32(bytes) {
	let crc = 0xffffffff;
	for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}
export async function inspectBackgroundImage(bytes, contentType) {
	if (!bytes.length || bytes.length > maxBackgroundBytes) fail("אפשר להעלות תמונת רקע עד 8MB.");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width, height, extension;
	if (
		contentType === "image/png" &&
		[137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
	) {
		extension = "png";
		let offset = 8,
			imageData = false,
			ended = false;
		while (offset + 12 <= bytes.length) {
			const length = view.getUint32(offset);
			const end = offset + length + 12;
			if (end > bytes.length) fail("קובץ PNG אינו שלם.");
			const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
			if (crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4))
				fail("קובץ PNG פגום.");
			if (offset === 8) {
				if (type !== "IHDR" || length !== 13) fail("כותרת PNG אינה תקינה.");
				width = view.getUint32(offset + 8);
				height = view.getUint32(offset + 12);
			} else if (type === "IHDR") fail("כותרת PNG כפולה.");
			if (type === "IDAT" && length > 0) imageData = true;
			offset = end;
			if (type === "IEND") {
				ended = length === 0 && offset === bytes.length;
				break;
			}
		}
		if (!ended || !imageData) fail("קובץ PNG אינו שלם.");
	} else if (
		contentType === "image/jpeg" &&
		bytes[0] === 255 &&
		bytes[1] === 216 &&
		bytes.at(-2) === 255 &&
		bytes.at(-1) === 217
	) {
		extension = "jpg";
		let offset = 2;
		while (offset + 4 < bytes.length) {
			if (bytes[offset++] !== 255) fail("קובץ JPEG אינו תקין.");
			while (bytes[offset] === 255) offset++;
			const marker = bytes[offset++];
			if (marker === 218 || marker === 217) break;
			if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
			if (offset + 2 > bytes.length) break;
			const length = view.getUint16(offset);
			if (length < 2 || offset + length > bytes.length) fail("קובץ JPEG אינו שלם.");
			if ([192, 193, 194].includes(marker) && length >= 8) {
				height = view.getUint16(offset + 3);
				width = view.getUint16(offset + 5);
			}
			offset += length;
		}
	} else fail("יש להעלות תמונת PNG או JPEG תקינה.");
	const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
		.map((n) => n.toString(16).padStart(2, "0"))
		.join("");
	return validateBackgroundAsset({
		file: `${sha256}.${extension}`,
		sha256,
		contentType,
		size: bytes.length,
		width,
		height,
	});
}

export function seedAsset(file) {
	return defaultBackgrounds
		.flatMap((background) => [background.image, background.coverImage])
		.find((asset) => asset?.file === file);
}
export async function checkBackgroundAssets(document, read) {
	for (const background of document.backgrounds)
		for (const asset of [background.image, background.coverImage].filter(Boolean)) {
			const existing = seedAsset(asset.file) ?? (await read(asset.file));
			if (
				!existing ||
				["file", "sha256", "size", "contentType", "width", "height"].some(
					(key) => existing[key] !== asset[key],
				)
			)
				fail("תמונת הרקע חסרה או השתנתה. העלו אותה מחדש לפני השמירה.");
		}
}
