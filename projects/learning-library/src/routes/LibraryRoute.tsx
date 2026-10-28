import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import Head from "expo-router/head";
import { CatalogStore } from "../features/catalog/CatalogStore";
import { createBrowserRepository } from "../core/browserRepository";
import { LibraryScreen } from "../screens/LibraryScreen";
import type { GalleryScope, MediaKind } from "../models/catalog";
import {
	browserLtiClient,
	submitSelection,
	type AttemptState,
	type LearningProgress,
	type LtiClient,
	type LtiSession,
} from "../features/lti/LtiClient";
import { LtiPanel } from "../features/lti/LtiPanel";
import { Body, Button, ButtonText, Heading } from "../ui/primitives";

export function LibraryRoute({ gallery = "public" }: { gallery?: GalleryScope }) {
	const [store] = useState(() => new CatalogStore(createBrowserRepository(), gallery));
	const pathname = gallery === "team" ? "/team-library" : "/";
	const router = useRouter();
	const params = useLocalSearchParams<{ item?: string; view?: string; lti?: string }>();
	const [lti, setLti] = useState<LtiSession | null>(null);
	const [client, setClient] = useState<LtiClient | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		let active = true;
		setLti(null);
		setClient(null);
		setError(null);
		if (!params.lti) return;
		try {
			const next = browserLtiClient(params.lti);
			setClient(next);
			void next
				.load()
				.then((value) => {
					if (active) setLti(value);
				})
				.catch((failure: Error) => {
					if (active) setError(failure.message);
				});
		} catch (failure) {
			setError((failure as Error).message);
		}
		return () => {
			active = false;
		};
	}, [params.lti]);
	const update = useCallback((value: AttemptState) => setLti({ mode: "activity", ...value }), []);
	const progress = useCallback(
		(event: LearningProgress) => {
			if (client)
				void client
					.progress(event)
					.then(update)
					.catch((failure: Error) => setError(failure.message));
		},
		[client, update],
	);
	const perform = async (operation: () => Promise<AttemptState>) => {
		setBusy(true);
		setError(null);
		try {
			update(await operation());
		} catch (failure) {
			setError((failure as Error).message);
			// A failed LMS delivery still freezes the scored result on the server.
			if (client) {
				try {
					setLti(await client.load());
				} catch {
					/* Keep the original error visible. */
				}
			}
		} finally {
			setBusy(false);
		}
	};
	const select = async () => {
		if (!client || !params.item) return;
		setBusy(true);
		setError(null);
		try {
			submitSelection(
				await client.select(params.item, params.view === "video" ? "video" : "deck"),
			);
		} catch (failure) {
			setError((failure as Error).message);
			setBusy(false);
		}
	};

	useEffect(() => {
		void store.load();
		return store.dispose;
	}, [store]);
	const open = (id: string, kind: MediaKind) => {
		router.push({
			pathname,
			params: { item: id, view: kind, ...(params.lti ? { lti: params.lti } : {}) },
		});
	};
	if (params.lti && !lti)
		return (
			<Body accessibilityRole={error ? "alert" : "text"} style={{ padding: 40 }}>
				{error || "פותחים את השיעור…"}
			</Body>
		);
	const activity = lti?.mode === "activity" ? lti : null;
	return (
		<>
			<Head>
				<title>
					{gallery === "team" ? "ספריית הקבוצה" : "ספריית למידה"} · דה וינצ׳י 4744
				</title>
				{gallery === "team" && <meta name="robots" content="noindex,nofollow" />}
			</Head>
			<LibraryScreen
				store={store}
				selectedId={activity?.itemId || params.item}
				selectedKind={activity?.kind || (params.view === "video" ? "video" : "deck")}
				onOpen={open}
				onClose={() =>
					router.replace(
						params.lti ? { pathname, params: { lti: params.lti } } : pathname,
					)
				}
				locked={!!activity}
				onProgress={activity && !activity.result ? progress : undefined}
				banner={
					lti?.mode === "select" ? (
						<>
							<Heading $compact>בחירת שיעור לקורס</Heading>
							<Body>פתחו מצגת או סרטון, ואז הוסיפו את הפורמט שבחרתם לקורס.</Body>
							{error && <Body accessibilityRole="alert">{error}</Body>}
							{params.item && (
								<Button onPress={select} disabled={busy} accessibilityRole="button">
									<ButtonText>
										{busy ? "מוסיפים…" : "הוספת השיעור לקורס"}
									</ButtonText>
								</Button>
							)}
						</>
					) : undefined
				}
				viewerFooter={
					activity && client ? (
						<LtiPanel
							attempt={activity}
							busy={busy}
							error={error}
							onAnswer={(question, option) => {
								void perform(() => client.answer(question, option));
							}}
							onComplete={() => {
								void perform(() => client.complete());
							}}
						/>
					) : undefined
				}
			/>
		</>
	);
}
