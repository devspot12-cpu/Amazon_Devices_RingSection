import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/** /sitemap.xml - the pages an agent can open, plus the llms.txt guide. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: 'always', priority: 1 },
    { url: `${base}/video`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/llms.txt`, changeFrequency: 'weekly', priority: 0.5 },
  ];
}
