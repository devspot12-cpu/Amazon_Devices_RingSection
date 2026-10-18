/**
 * Predator Guard dashboard.
 *
 * Foundation page: the API surface is being built feature by feature. See
 * `docs/FEATURES.md` for what lands next.
 */
export default function HomePage() {
  return (
    <main>
      <h1>Predator Guard</h1>
      <p>A species-aware predator alarm built on the Ring Partner API.</p>

      <p>
        <strong>Status:</strong> foundation. The dashboard, timeline and heatmap arrive with
        feature F8.
      </p>

      <ul>
        <li>
          Health check: <a href="/api/health">/api/health</a>
        </li>
        <li>Features and milestones: <code>docs/FEATURES.md</code></li>
      </ul>
    </main>
  );
}
