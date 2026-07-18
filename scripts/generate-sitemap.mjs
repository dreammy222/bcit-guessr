import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROUTES = ['/', '/party'];
const FALLBACK_SITE_URL = 'https://ubc-guessr.vercel.app';

function normalizeSiteUrl(value) {
  if (!value) {
    return FALLBACK_SITE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

function resolveSiteUrl() {
  return normalizeSiteUrl(
    process.env.SITEMAP_SITE_URL ||
      process.env.SITE_URL ||
      process.env.VITE_SITE_URL ||
      process.env.APP_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      process.env.VERCEL_URL,
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
  const siteUrl = resolveSiteUrl();
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
