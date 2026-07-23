import { UnsubscribeForm } from './unsubscribe-form';

// Ported from (layout-1)/unsubscribe/+page.svelte: static shell, interactive
// form in a client island.
export default function Unsubscribe() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-white px-6">
			<div className="w-full max-w-md">
				<UnsubscribeForm />
			</div>
		</div>
	);
}
