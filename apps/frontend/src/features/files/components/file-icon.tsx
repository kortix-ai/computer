import {
  Folder,
  FileText,
  FileCode,
  FileCode2,
  FileImage,
  FileVideo,
  FileSpreadsheet,
  FileType,
  FileJson,
  FileTerminal,
  FileArchive,
  FileAudio,
  FileCog,
  FileKey,
  FileLock,
  FileMusic,
  FileBadge,
  FileBox,
  FileChartLine,
  File as FileIcon,
} from 'lucide-react';

/**
 * Returns a colored Lucide icon element for a given filename.
 * Matches the same logic used in the sidebar file explorer.
 *
 * @param fileName  The file or directory name (e.g. "index.tsx")
 * @param className Override the default icon size class (default "h-4 w-4 shrink-0")
 * @param isDirectory Whether the node is a directory
 */
export function getFileIcon(
  fileName: string,
  { className, isDirectory }: { className?: string; isDirectory?: boolean } = {},
) {
  const ic = className ?? 'h-4 w-4 shrink-0';

  if (isDirectory) {
    return <Folder className={`${ic} text-blue-400`} />;
  }

  const name = fileName.toLowerCase();
  const ext = name.split('.').pop() || '';

  // ── Special filenames ──────────────────────────────────────────
  if (name === 'dockerfile' || name === 'docker-compose.yml' || name === 'docker-compose.yaml') {
    return <FileBox className={`${ic} text-sky-400`} />;
  }
  if (name === '.env' || name.startsWith('.env.')) {
    return <FileKey className={`${ic} text-yellow-500`} />;
  }
  if (name === 'package.json' || name === 'package-lock.json' || name === 'pnpm-lock.yaml' || name === 'yarn.lock' || name === 'bun.lockb') {
    return <FileBox className={`${ic} text-green-400`} />;
  }
  if (name === 'license' || name === 'license.md' || name === 'license.txt') {
    return <FileBadge className={`${ic} text-amber-400`} />;
  }
  if (name === '.gitignore' || name === '.gitattributes' || name === '.gitmodules') {
    return <FileCog className={`${ic} text-orange-400`} />;
  }
  if (name === 'makefile' || name === 'cmakelists.txt') {
    return <FileTerminal className={`${ic} text-amber-500`} />;
  }

  // ── By extension ───────────────────────────────────────────────

  // TypeScript
  if (ext === 'ts' || ext === 'tsx') {
    return <FileCode2 className={`${ic} text-blue-400`} />;
  }
  // JavaScript
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') {
    return <FileCode2 className={`${ic} text-yellow-400`} />;
  }
  // Python
  if (ext === 'py' || ext === 'pyi' || ext === 'pyx' || ext === 'pyw') {
    return <FileCode className={`${ic} text-sky-400`} />;
  }
  // Rust
  if (ext === 'rs') {
    return <FileCode className={`${ic} text-orange-400`} />;
  }
  // Go
  if (ext === 'go') {
    return <FileCode className={`${ic} text-cyan-400`} />;
  }
  // Ruby
  if (ext === 'rb' || ext === 'erb' || ext === 'gemspec') {
    return <FileCode className={`${ic} text-red-400`} />;
  }
  // Java / Kotlin
  if (ext === 'java' || ext === 'kt' || ext === 'kts') {
    return <FileCode className={`${ic} text-orange-500`} />;
  }
  // C / C++ / Objective-C
  if (ext === 'c' || ext === 'cpp' || ext === 'cc' || ext === 'cxx' || ext === 'h' || ext === 'hpp' || ext === 'hxx' || ext === 'm' || ext === 'mm') {
    return <FileCode className={`${ic} text-blue-500`} />;
  }
  // C#
  if (ext === 'cs') {
    return <FileCode className={`${ic} text-violet-400`} />;
  }
  // Swift
  if (ext === 'swift') {
    return <FileCode className={`${ic} text-orange-400`} />;
  }
  // PHP
  if (ext === 'php') {
    return <FileCode className={`${ic} text-indigo-400`} />;
  }
  // Vue / Svelte
  if (ext === 'vue') {
    return <FileCode2 className={`${ic} text-emerald-400`} />;
  }
  if (ext === 'svelte') {
    return <FileCode2 className={`${ic} text-orange-500`} />;
  }
  // HTML
  if (ext === 'html' || ext === 'htm') {
    return <FileCode className={`${ic} text-orange-400`} />;
  }
  // CSS / SCSS / LESS
  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less' || ext === 'styl') {
    return <FileCode className={`${ic} text-pink-400`} />;
  }

  // JSON
  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') {
    return <FileJson className={`${ic} text-yellow-500`} />;
  }
  // YAML / TOML
  if (ext === 'yaml' || ext === 'yml' || ext === 'toml') {
    return <FileCog className={`${ic} text-purple-400`} />;
  }
  // XML
  if (ext === 'xml' || ext === 'xsl' || ext === 'xslt' || ext === 'wsdl') {
    return <FileCode className={`${ic} text-amber-500`} />;
  }

  // Shell / Terminal
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish' || ext === 'bat' || ext === 'cmd' || ext === 'ps1') {
    return <FileTerminal className={`${ic} text-green-400`} />;
  }

  // Markdown / Text
  if (ext === 'md' || ext === 'mdx' || ext === 'txt' || ext === 'rst' || ext === 'rtf') {
    return <FileText className={`${ic} text-muted-foreground`} />;
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'tiff', 'tif'].includes(ext)) {
    return <FileImage className={`${ic} text-purple-400`} />;
  }
  // Video
  if (['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'ogv'].includes(ext)) {
    return <FileVideo className={`${ic} text-pink-400`} />;
  }
  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'].includes(ext)) {
    return <FileAudio className={`${ic} text-teal-400`} />;
  }
  // Music (midi)
  if (ext === 'mid' || ext === 'midi') {
    return <FileMusic className={`${ic} text-teal-400`} />;
  }

  // Spreadsheets
  if (['xlsx', 'xls', 'csv', 'tsv', 'ods'].includes(ext)) {
    return <FileSpreadsheet className={`${ic} text-green-400`} />;
  }
  // PDF / Documents
  if (ext === 'pdf') {
    return <FileType className={`${ic} text-red-500`} />;
  }
  if (['doc', 'docx', 'odt'].includes(ext)) {
    return <FileType className={`${ic} text-blue-500`} />;
  }
  if (['ppt', 'pptx', 'odp'].includes(ext)) {
    return <FileType className={`${ic} text-orange-500`} />;
  }

  // Archives
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z', 'tgz', 'zst'].includes(ext)) {
    return <FileArchive className={`${ic} text-amber-500`} />;
  }

  // Config files
  if (['ini', 'cfg', 'conf', 'properties', 'editorconfig'].includes(ext)) {
    return <FileCog className={`${ic} text-gray-400`} />;
  }
  // Dotfiles / RC files
  if (name.startsWith('.') && (name.endsWith('rc') || name.endsWith('rc.js') || name.endsWith('rc.json') || name.endsWith('rc.yml'))) {
    return <FileCog className={`${ic} text-gray-400`} />;
  }
  if (ext === 'eslintrc' || name.includes('eslint') || name.includes('prettier') || name.includes('babel')) {
    return <FileCog className={`${ic} text-purple-400`} />;
  }
  // tsconfig, etc
  if (name.startsWith('tsconfig') || name.startsWith('jsconfig')) {
    return <FileCog className={`${ic} text-blue-400`} />;
  }

  // Lock files / security
  if (ext === 'lock' || ext === 'pem' || ext === 'crt' || ext === 'cer' || ext === 'key') {
    return <FileLock className={`${ic} text-yellow-500`} />;
  }

  // Database / SQL
  if (ext === 'sql' || ext === 'sqlite' || ext === 'db' || ext === 'sqlite3') {
    return <FileChartLine className={`${ic} text-blue-400`} />;
  }

  // Protobuf / GraphQL
  if (ext === 'proto' || ext === 'graphql' || ext === 'gql') {
    return <FileCode2 className={`${ic} text-pink-500`} />;
  }

  // WASM
  if (ext === 'wasm' || ext === 'wat') {
    return <FileBox className={`${ic} text-violet-500`} />;
  }

  // Log files
  if (ext === 'log') {
    return <FileText className={`${ic} text-gray-400`} />;
  }

  // Fallback
  return <FileIcon className={`${ic} text-muted-foreground`} />;
}
