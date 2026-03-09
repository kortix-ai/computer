# @kortix/kortix-oc

Standalone source-of-truth package for the Kortix OpenCode runtime.

## OpenCode setup

The package is published on npm as `@kortix/kortix-oc`, and `latest` currently points to `0.1.1`.

For the published package, add a single plugin entry:

```jsonc
{
  "plugin": ["@kortix/kortix-oc@^0.1.1"]
}
```

For a local workspace checkout, use a filesystem path to the package root:

```jsonc
{
  "plugin": ["/absolute/path/to/computer/packages/kortix-oc/"]
}
```

The root plugin entry auto-loads the Kortix agent, commands, skills, tools, provider defaults, and Context7 wiring. Do not manually copy `agents/`, `commands/`, or `skills/` into your OpenCode config.
