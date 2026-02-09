# Kortix Computer Frontend

This directory contains the Kortix Computer frontend application, built with Next.js and React.

## Prerequisites

- **Node.js** >= 20.9.0 (required for Next.js)
- **pnpm** (package manager for this monorepo)

## Getting Started

### 1. Install Dependencies

From the project root (`computer`), install all workspace dependencies:

```bash
pnpm install
```

This will install dependencies for all workspace packages, including the frontend.

### 2. Run the Development Frontend

From the project root, start the development frontend:

```bash
pnpm dev:computer-frontend
```

The application will be available at:
- **Local**: http://localhost:3000
- **Network**: http://192.168.2.9:3000 (your local network IP)

## Available Scripts

All scripts should be run from the project root (`kortix/suna/`):

- `pnpm --filter Kortix-Computer-Frontend dev` - Start development server with Turbopack
- `pnpm --filter Kortix-Computer-Frontend build` - Build for production
- `pnpm --filter Kortix-Computer-Frontend start` - Start production server
- `pnpm --filter Kortix-Computer-Frontend lint` - Run ESLint
- `pnpm --filter Kortix-Computer-Frontend format` - Format code with Prettier

## Project Structure

```
apps/computer/
├── apps/
│   └── frontend/          # Next.js frontend application
│       ├── src/           # Source code
│       ├── public/        # Static assets
│       └── package.json    # Frontend dependencies
└── packages/
    └── shared/            # Shared packages
```

## Troubleshooting

### Module Not Found Errors

If you encounter "Module not found" errors, make sure you've run `pnpm install` from the project root. The monorepo manages all dependencies from the root directory.

### Node.js Version

Ensure you're using Node.js >= 20.9.0. You can check your version with:

```bash
node --version
```

### Port Already in Use

If port 3000 is already in use, Next.js will automatically try the next available port (3001, 3002, etc.).

## Development Notes

- The frontend uses **Turbopack** for faster development builds
- Hot module replacement (HMR) is enabled for instant updates
- The project is part of a pnpm monorepo, so all package management should be done from the root

