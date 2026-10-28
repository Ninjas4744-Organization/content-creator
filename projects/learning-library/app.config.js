const baseUrl = (process.env.EXPO_BASE_URL || "").replace(/\/$/, "");
if (baseUrl && !/^\/[a-zA-Z0-9._/-]+$/.test(baseUrl)) {
	throw new Error("EXPO_BASE_URL must be an absolute URL path, such as /content-creator");
}

module.exports = {
	expo: {
		name: "דה וינצ׳י · ספריית למידה",
		slug: "davinci-learning-library",
		version: "1.0.0",
		platforms: ["web"],
		userInterfaceStyle: "dark",
		web: { bundler: "metro", output: "static", favicon: "../../assets/brand/logo.png" },
		plugins: [["expo-router", { sitemap: false }]],
		experiments: { ...(baseUrl ? { baseUrl } : {}) },
	},
};
