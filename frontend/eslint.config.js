import next from 'eslint-config-next';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const config = [
	{
		ignores: [
			'.next/**',
			'.vercel/**',
			'build/**',
			'node_modules/**',
			'public/**',
			// Hand-authored vanilla JS built by Vite, not by Next. Off-limits to the
			// migration (see migration-implementation-plan.md rule #2), so linting it
			// only produces findings nobody is allowed to act on.
			'src/embed/**'
		]
	},
	...next,
	...nextTypescript,
	prettier,
	{
		rules: {
			// Pre-existing in code ported verbatim from the SvelteKit app. Kept visible
			// as warnings rather than fixed — behaviour parity beats tidiness during
			// the migration.
			'@typescript-eslint/no-explicit-any': 'warn',

			// The React Compiler rules shipped in eslint-plugin-react-hooks v7. They
			// flag the shape of the ported call pages, not real defects:
			//  - `purity`: Date.now() inside plain functions declared in the component
			//    body. Every flagged call site is a socket event handler or a click
			//    handler, never render.
			//  - `immutability`: the mount effect calls helpers declared further down
			//    the file. Hoisted function declarations; the Svelte original had the
			//    same layout.
			//  - `set-state-in-effect`: the unsubscribe form's query-param prefill,
			//    a direct port of its onMount.
			// Satisfying them means restructuring pages the migration is required to
			// port verbatim. Revisit once the migration has landed.
			'react-hooks/purity': 'off',
			'react-hooks/immutability': 'off',
			'react-hooks/set-state-in-effect': 'off'
		}
	}
];

export default config;
