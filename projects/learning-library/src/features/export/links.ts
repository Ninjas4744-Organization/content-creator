import type { MediaKind } from "../../models/catalog";

export function ltiResourceUrl(pageUrl: string, item: string, kind: MediaKind): string {
	const url = new URL("/lti/resource", pageUrl);
	url.searchParams.set("item", item);
	url.searchParams.set("view", kind);
	return url.href;
}
