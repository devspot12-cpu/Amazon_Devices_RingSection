import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/** /robots.txt - every crawler and AI agent may read the pages and llms.txt. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Signed redirects to private bucket objects; nothing for a crawler to index.
      disallow: ['/api/media/', '/api/captures/'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
