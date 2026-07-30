import { describe, expect, it } from "vitest";
import {
	buildMosaicLabSyntheticMediaDataUrl,
	createMosaicLabSyntheticMediaSourceResolver,
	generateMosaicLabSyntheticPhotoBundle,
	getMosaicLabStarterSampleAlbum,
} from "../model/index.js";

describe("Mosaic Lab synthetic media resolver", () => {
	it("renders starter synthetic photos as inline SVG data URLs for every variant", () => {
		const bundle = generateMosaicLabSyntheticPhotoBundle({
			album: getMosaicLabStarterSampleAlbum("mixed-vacation"),
			seed: "synthetic-media-spec",
		});
		const record = bundle.photos[0];
		if (!record) {
			throw new Error("Expected at least one synthetic photo record");
		}

		const src = buildMosaicLabSyntheticMediaDataUrl({
			photo: record.photo,
			metadata: record.metadata,
			variant: "wall",
		});

		expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
		expect(decodeURIComponent(src)).toContain(record.metadata.albumName);
		expect(decodeURIComponent(src)).toContain("Wall");
	});

	it("never falls through to backend media routes for lab ids", () => {
		const bundle = generateMosaicLabSyntheticPhotoBundle({
			album: getMosaicLabStarterSampleAlbum("phone-weird-mix"),
			seed: "resolver-spec",
		});
		const record = bundle.photos[0];
		if (!record) {
			throw new Error("Expected at least one synthetic photo record");
		}

		const resolver = createMosaicLabSyntheticMediaSourceResolver(bundle.photos);
		const modalSrc = resolver({ photo: record.photo, variant: "modal" });
		const thumbSrc = resolver({ photo: record.photo, variant: "thumb" });
		const fallbackSrc = resolver({
			photo: {
				id: "lab:missing-photo",
				width: 200,
				height: 300,
			},
			variant: "wall",
		});

		expect(modalSrc).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
		expect(thumbSrc).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
		expect(fallbackSrc).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
		expect(modalSrc).not.toContain("/api/media/");
		expect(thumbSrc).not.toContain("/api/media/");
		expect(fallbackSrc).not.toContain("/api/media/");
	});
});
