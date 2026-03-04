/**
 * Presentation Viewer Server — persistent single-service for all presentations.
 *
 * Serves any presentation by URL path so a single long-running server covers
 * every deck created in a session. Mirrors what svc-presentation-viewer does
 * inside the sandbox.
 *
 * URL scheme:
 *   /                                    → index listing all presentations
 *   /presentations/<name>/               → viewer for that presentation
 *   /presentations/<name>/<file>         → raw slide file (e.g. slide_01.html)
 *   /presentations/<name>/images/<img>   → image asset
 *
 * Usage:
 *   bun run serve.ts [presentations-root-dir]
 *   bun run serve.ts                        # uses ./presentations
 *   bun run serve.ts /workspace/presentations
 *   PORT=4000 bun run serve.ts ./presentations
 */

import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { resolve, join, extname, dirname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function getMime(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
}

function serveFile(filePath: string): Response {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return new Response("Not found", { status: 404 });
  }
  const data = readFileSync(filePath);
  return new Response(data, {
    headers: { "Content-Type": getMime(filePath), "Cache-Control": "no-cache" },
  });
}

// Support both: a specific presentation dir (legacy) OR a root presentations dir
const rootArg = process.argv[2];
const skillDir = dirname(new URL(import.meta.url).pathname);
const viewerTemplatePath = join(skillDir, "viewer.html");

// Determine PRES_ROOT: if arg looks like a presentations root (contains sub-dirs with metadata.json)
// or if it's a specific presentation dir (has metadata.json directly), we handle both.
let PRES_ROOT: string;
let SPECIFIC_PRES: string | null = null;

if (rootArg) {
  const absArg = resolve(rootArg);
  const metaInArg = join(absArg, "metadata.json");
  if (existsSync(metaInArg)) {
    // Legacy: specific presentation dir passed (e.g. presentations/my-deck)
    SPECIFIC_PRES = absArg;
    PRES_ROOT = dirname(absArg);
  } else {
    PRES_ROOT = absArg;
  }
} else {
  PRES_ROOT = resolve(process.cwd(), "presentations");
}

function loadMetadata(presDir: string): any {
  const metaPath = join(presDir, "metadata.json");
  if (existsSync(metaPath)) {
    try { return JSON.parse(readFileSync(metaPath, "utf-8")); } catch {}
  }
  return { slides: {}, title: "", presentation_name: "" };
}

function buildViewerHtml(presDir: string, metadata: any): string {
  if (!existsSync(viewerTemplatePath)) {
    return "<html><body><p>viewer.html template not found</p></body></html>";
  }
  const slides = Object.entries(metadata.slides || {})
    .map(([num, data]: [string, any]) => ({
      number: parseInt(num),
      title: data.title || `Slide ${num}`,
      filename: data.filename || `slide_${String(num).padStart(2, "0")}.html`,
    }))
    .sort((a, b) => a.number - b.number);

  const presData = JSON.stringify({
    title: metadata.title || metadata.presentation_name || "Presentation",
    slides,
  });

  const template = readFileSync(viewerTemplatePath, "utf-8");
  return template
    .replace("{{TITLE}}", metadata.title || "Presentation")
    .replace("{{PRESENTATION_DATA}}", presData);
}

function listPresentations(): Array<{ name: string; title: string; total_slides: number }> {
  if (!existsSync(PRES_ROOT)) return [];
  return readdirSync(PRES_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith(".") && d.name !== "images")
    .map(d => {
      const meta = loadMetadata(join(PRES_ROOT, d.name));
      return {
        name: d.name,
        title: meta.title || d.name,
        total_slides: Object.keys(meta.slides || {}).length,
      };
    });
}

const port = parseInt(process.env.PORT || "3210");

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    };

    // Root → index or redirect to specific presentation (legacy mode)
    if (pathname === "/" || pathname === "/index.html") {
      if (SPECIFIC_PRES) {
        // Legacy: redirect directly to that presentation's viewer
        const presName = SPECIFIC_PRES.split("/").pop()!;
        return Response.redirect(`/presentations/${presName}/`, 302);
      }

      const pres = listPresentations();
      const html = `<!DOCTYPE html><html><head><title>Presentations</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:2rem;max-width:800px;margin:0 auto;background:#fff;color:#111}
  h1{font-size:1.5rem;margin-bottom:1.5rem;font-weight:600}
  ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:0.5rem}
  a{display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;border:1px solid #e5e7eb;border-radius:0.5rem;text-decoration:none;color:inherit;transition:background 0.1s}
  a:hover{background:#f9fafb}
  .name{font-weight:500;font-size:0.9rem}
  .count{font-size:0.75rem;color:#6b7280;margin-left:auto;flex-shrink:0}
  .empty{color:#6b7280;font-size:0.875rem}
</style></head><body>
<h1>Presentations (${pres.length})</h1>
<ul>
  ${pres.map(p => `<li><a href="/presentations/${p.name}/"><span class="name">${p.title}</span><span class="count">${p.total_slides} slides</span></a></li>`).join("")}
</ul>
${pres.length === 0 ? '<p class="empty">No presentations yet. Create one with the presentation-gen tool.</p>' : ""}
</body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
    }

    // /viewer or /viewer.html (legacy: serve the SPECIFIC_PRES viewer)
    if (SPECIFIC_PRES && (pathname === "/viewer" || pathname === "/viewer.html")) {
      const metadata = loadMetadata(SPECIFIC_PRES);
      const html = buildViewerHtml(SPECIFIC_PRES, metadata);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
    }

    // /presentations/<name>[/...]
    const presMatch = pathname.match(/^\/presentations\/([^/]+)\/?(.*)$/);
    if (presMatch) {
      const presName = presMatch[1];
      const rest = presMatch[2] || "";
      const presDir = join(PRES_ROOT, presName);

      if (!existsSync(presDir)) {
        return new Response(`Presentation not found: ${presName}`, { status: 404, headers: corsHeaders });
      }

      const metadata = loadMetadata(presDir);

      // Viewer: root, /viewer, /viewer.html, /index.html
      if (rest === "" || rest === "viewer" || rest === "viewer.html" || rest === "index.html") {
        const html = buildViewerHtml(presDir, metadata);
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
      }

      // ../images/ references from within slide iframes
      if (rest.startsWith("../images/") || rest.startsWith("%2E%2E/images/")) {
        const imgName = rest.replace(/^(\.\.\/|%2E%2E\/)images\//, "");
        return serveFile(join(PRES_ROOT, "images", imgName));
      }

      // images/ relative to presentation dir
      if (rest.startsWith("images/")) {
        return serveFile(join(PRES_ROOT, "images", rest.slice("images/".length)));
      }

      // Any file inside the presentation dir (slides, metadata.json, etc.)
      return serveFile(join(presDir, rest));
    }

    // /images/<name> — shared images at root level
    if (pathname.startsWith("/images/")) {
      return serveFile(join(PRES_ROOT, "images", pathname.slice("/images/".length)));
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
});

const baseUrl = `http://localhost:${server.port}`;
const pres = listPresentations();

console.log(`\n  Presentation Viewer`);
console.log(`  ${baseUrl}\n`);
if (SPECIFIC_PRES) {
  const presName = SPECIFIC_PRES.split("/").pop()!;
  console.log(`  → ${baseUrl}/presentations/${presName}/`);
} else {
  console.log(`  Serving ${pres.length} presentation(s) from ${PRES_ROOT}`);
  pres.forEach(p => console.log(`  → ${baseUrl}/presentations/${p.name}/  (${p.total_slides} slides)`));
}
console.log(`\n  Press Ctrl+C to stop\n`);
