import assert from "node:assert/strict";
import { test } from "node:test";
import { ltiResourceUrl } from "../src/features/export/links";

test("LTI links select the format and omit browser session and selection parameters", () => {
	const url = ltiResourceUrl(
		"https://learning.example/?lti=private-session&item=old&view=video#private",
		"community",
		"deck",
	);
	assert.equal(url, "https://learning.example/lti/resource?item=community&view=deck");
	assert.equal(
		new URL(
			ltiResourceUrl("https://learning.example/", "topic & one", "video"),
		).searchParams.get("item"),
		"topic & one",
	);
});
