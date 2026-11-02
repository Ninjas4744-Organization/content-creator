import type { AuthEnv } from "./admin-sso";
export interface Env extends AuthEnv {
	ASSETS: Fetcher;
	CONTENT: R2Bucket;
	ADMIN_ACCESS_ISSUER?: string;
	ADMIN_ACCESS_AUD?: string;
	ADMIN_EMAILS?: string;
}
