const baseUrl = (process.env.EXPO_BASE_URL || "").replace(/\/$/, "");
if (baseUrl && !/^\/[A-Za-z0-9._/-]+$/.test(baseUrl))
	throw new Error("EXPO_BASE_URL must be an absolute URL path");

module.exports = {
	expo: {
		name: "דה וינצ׳י · ניהול הספרייה",
		slug: "davinci-content-creator-admin",
		version: "0.2.0",
		platforms: ["web"],
		userInterfaceStyle: "light",
		web: { bundler: "metro", output: "static", favicon: "./public/library/brand/logo.png" },
		plugins: [["expo-router", { sitemap: false }]],
		experiments: { ...(baseUrl ? { baseUrl } : {}) },
	},
};
