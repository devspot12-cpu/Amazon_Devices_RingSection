/**
 * Public origin of the site, for the absolute links in robots.txt, sitemap.xml,
 * llms.txt and the page metadata. NEXT_PUBLIC_SITE_URL wins; on Vercel the
 * production domain is used; locally it is the dev server.
 */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim() || (vercel ? `https://${vercel}` : 'http://localhost:3000');
  // A value pasted from .env can keep its quotes (friction log #57).
  return raw.replace(/^["']|["']$/g, '').replace(/\/+$/, '');
}
