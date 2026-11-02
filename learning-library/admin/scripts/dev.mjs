import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const apiPort = Number(process.env.PORT || 4310);
const webPort = Number(process.env.EXPO_WEB_PORT || 8081);
for (const port of [apiPort, webPort]) {
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error("Ports must be integers between 1 and 65535.");
}
if (apiPort === webPort) throw new Error("The API and Expo ports must differ.");
const environment = {
	...process.env,
	PORT: String(apiPort),
	ADMIN_DEV_ORIGIN: `http://localhost:${webPort}`,
	EXPO_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
};
const children = [
	spawn(process.execPath, ["--watch", "server/index.mjs"], {
		stdio: "inherit",
		env: environment,
	}),
	spawn(
		process.execPath,
		[
			require.resolve("expo/bin/cli"),
			"start",
			"--web",
			"--localhost",
			"--port",
			String(webPort),
		],
		{ stdio: "inherit", env: environment },
	),
];
let stopping = false;
function stop(code) {
	if (stopping) return;
	stopping = true;
	for (const child of children) child.kill("SIGTERM");
	process.exitCode = code;
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(0));
for (const child of children) {
	child.on("error", (error) => {
		console.error(error.message);
		stop(1);
	});
	child.on("exit", (code) => stop(code ?? 0));
}
