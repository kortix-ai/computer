/**
 * Constructs a preview URL for HTML files.
 * Takes a base URL and a file path, properly encoding each path segment.
 *
 * @param baseUrl - The base URL to serve from
 * @param filePath - The path to the HTML file (can include /workspace/ prefix)
 * @returns The properly encoded preview URL, or undefined if inputs are invalid
 */
export function constructHtmlPreviewUrl(
  baseUrl: string | undefined,
  filePath: string | undefined,
): string | undefined {
  if (!baseUrl || !filePath) {
    return undefined;
  }

  // Remove /workspace/ prefix if present
  const processedPath = filePath.replace(/^\/workspace\//, '');

  // Split the path into segments and encode each segment individually
  const pathSegments = processedPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));

  // Join the segments back together with forward slashes
  const encodedPath = pathSegments.join('/');

  return `${baseUrl}/${encodedPath}`;
}
