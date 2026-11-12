import { SourcesPanel } from "../features/sources/SourcesPanel";
import { useAdminWorkspace } from "./AdminRoute";
import type { SourceSection } from "./adminNavigation";

export function SourcesRoute({ section }: { section: SourceSection }) {
	const { sources, width } = useAdminWorkspace();
	return <SourcesPanel key={section} store={sources} compact={width < 760} section={section} />;
}
