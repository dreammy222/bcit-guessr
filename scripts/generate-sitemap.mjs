import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROUTES = ['/', '/party'];

// Fallback comes from src/config/school.ts (siteUrl field). This script runs
// under plain Node, so we extract the one string field rather than import TS.
async function readConfiguredSiteUrl() {
  try {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(resolve(process.cwd(), 'src/config/school.ts'), 'utf8');
    const match = source.match(/siteUrl:\s*'([^']+)'/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

function normalizeSiteUrl(value, fallback) {
  if (!value) {
    return fallback;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

async function resolveSiteUrl() {
  const fallback = await readConfiguredSiteUrl();
  return normalizeSiteUrl(
    process.env.SITEMAP_SITE_URL ||
      process.env.SITE_URL ||
      process.env.VITE_SITE_URL ||
      process.env.APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL,
    fallback,
  );
}

function buildUrlXml(route, siteUrl, lastModified) {
  const loc = new URL(route, `${siteUrl}/`).toString();

  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <lastmod>${lastModified}</lastmod>`,
    '  </url>',
  ].join('\n');
}

async function generateSitemap() {
  const siteUrl = await resolveSiteUrl();
  const lastModified = new Date().toISOString();
  const publicDir = resolve(process.cwd(), 'public');
  const outputPath = resolve(publicDir, 'sitemap.xml');

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...ROUTES.map((route) => buildUrlXml(route, siteUrl, lastModified)),
    '</urlset>',
    '',
  ].join('\n');

  await mkdir(publicDir, { recursive: true });
  await writeFile(outputPath, sitemapXml, 'utf8');

  console.log(`Generated sitemap at ${outputPath}`);
}

generateSitemap().catch((error) => {
  console.error('Failed to generate sitemap.');
  console.error(error);
  process.exitCode = 1;
});
