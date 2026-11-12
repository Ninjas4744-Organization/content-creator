import { Slot } from "expo-router";
import { AdminRoute } from "../../src/routes/AdminRoute";

export default function WorkspaceLayout() {
	return (
		<AdminRoute>
			<Slot />
		</AdminRoute>
	);
}
