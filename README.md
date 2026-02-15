# Kortix

Open-source autonomous computer use agent. Turn any computer into an AI computer.

## Install

```bash
curl -fsSL https://get.kortix.ai/install | bash
```

Only requirement: [Docker Desktop](https://docs.docker.com/get-docker/).

The installer creates `~/.kortix`, pulls Docker images, and starts everything. Configure API keys via the dashboard.

## After install

| Service   | URL                    |
|-----------|------------------------|
| Dashboard | http://localhost:3000   |
| API       | http://localhost:8008   |
| Sandbox   | http://localhost:14000  |

## CLI

```bash
~/.kortix/kortix start     # Start all services
~/.kortix/kortix stop      # Stop all services
~/.kortix/kortix restart   # Restart
~/.kortix/kortix logs      # Tail logs (or: kortix logs sandbox)
~/.kortix/kortix status    # Show status
~/.kortix/kortix update    # Pull latest images & restart
~/.kortix/kortix setup     # How to edit API keys
```

Add to PATH: `echo 'export PATH="$HOME/.kortix:$PATH"' >> ~/.zshrc`

## API Keys

Edit `~/.kortix/.env` and restart:

```bash
nano ~/.kortix/.env
~/.kortix/kortix restart
```

Or use the dashboard (avatar menu -> Local .Env Manager).

## License

See [LICENSE](LICENSE) for details.
