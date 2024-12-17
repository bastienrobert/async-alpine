import esbuild from 'esbuild';

buildAll();

async function buildAll() {
	return Promise.all([
		build('script', {
			entryPoints: ['src/script.ts'],
			platform: 'browser',
			minify: true,
			target: 'es6',
		}),
		build('esm', {
			entryPoints: ['src/async-alpine.ts'],
			platform: 'neutral',
			mainFields: ['module', 'main'],
		}),
		build('cjs', {
			entryPoints: ['src/async-alpine.ts'],
			target: ['node10.4'],
			platform: 'node',
		}),
	]);
}

async function build(
	name: string,
	options: esbuild.SameShape<esbuild.BuildOptions, esbuild.BuildOptions>
) {
	const path = `async-alpine.${name}.js`;
	console.log(`Building ${name}`);

	if (process.argv.includes('--watch')) {
		const ctx = await esbuild.context({
			outfile: `./dist/${path}`,
			bundle: true,
			logLevel: 'info',
			sourcemap: true,
			...options,
		});
		await ctx.watch();
	} else {
		return esbuild.build({
			outfile: `./dist/${path}`,
			bundle: true,
			...options,
		});
	}
}
