import assert from "node:assert/strict";
import { test } from "node:test";
import { publicUrl } from "../src/core/browserRepository";

test("nested gallery routes resolve media and downloads against the HTML base", (context) => {
	for (const name of ["window", "document"]) {
		const original = Object.getOwnPropertyDescriptor(globalThis, name);
		context.after(() => {
			if (original) Object.defineProperty(globalThis, name, original);
			else Reflect.deleteProperty(globalThis, name);
		});
	}
	for (const prefix of ["/", "/content-creator/"]) {
		for (const gallery of ["team-library", "study-library"]) {
			const root = `https://learning.example${prefix}`;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: { location: { href: `${root}${gallery}/?item=recruitment&view=deck` } },
			});
			Object.defineProperty(globalThis, "document", {
				configurable: true,
				value: { baseURI: root },
			});
			assert.equal(publicUrl("library/catalog.json"), `${root}library/catalog.json`);
			assert.equal(
				publicUrl("library/exports/recruitment/slides.zip"),
				`${root}library/exports/recruitment/slides.zip`,
			);
		}
	}
});
