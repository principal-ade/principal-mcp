import { build } from 'esbuild';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..');
const entryFile = path.join(rootDir, 'src', 'index.ts');
const outFile = path.join(rootDir, 'dist', 'mcp-server.js');

const banner = `"use strict";

/**
 * Principal MCP Server Bundle
 * Generated: ${new Date().toISOString()}
 */
`;

async function main() {
  const outDir = path.dirname(outFile);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  try {
    const result = await build({
      entryPoints: [entryFile],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: outFile,
      banner: {
        js: banner,
      },
      external: ['@modelcontextprotocol/sdk', 'zod', '@opentelemetry/api'],
      minify: false,
      sourcemap: true,
      metafile: true,
      logLevel: 'info',
    });

    const metaPath = outFile.replace(/\.js$/, '.meta.json');
    writeFileSync(metaPath, JSON.stringify(result.metafile, null, 2));

    const current = readFileSync(outFile, 'utf8').replace(/^(#!.*\n)+/, '');
    writeFileSync(outFile, `#!/usr/bin/env node\n${current}`);
    chmodSync(outFile, 0o755);

    const stats = statSync(outFile);
    const sizeKB = (stats.size / 1024).toFixed(2);

    console.log(`✅ Bundle created: ${outFile}`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Metafile: ${metaPath}`);
    console.log(`   Modules bundled: ${Object.keys(result.metafile?.inputs ?? {}).length}`);
  } catch (error) {
    console.error('❌ Bundle failed', error);
    process.exitCode = 1;
  }
}

main();
