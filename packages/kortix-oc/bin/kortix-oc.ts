#!/usr/bin/env bun
import { materializeRuntime } from "../src/materialize"
import { verifyRuntime } from "../src/verify"

const [, , command, ...args] = process.argv

if (command === "verify") {
  const result = verifyRuntime()
  if (!result.ok) {
    console.error(`Runtime verification failed. Missing: ${result.missing.join(", ")}`)
    process.exit(1)
  }
  console.log("Runtime verification passed.")
  process.exit(0)
}

if (command === "materialize") {
  const targetDir = args.find((arg) => !arg.startsWith("--"))
  if (!targetDir) {
    console.error("Usage: kortix-oc materialize <target-dir> [--clean]")
    process.exit(1)
  }
  const clean = args.includes("--clean")
  const output = materializeRuntime(targetDir, { clean })
  console.log(`Materialized runtime to ${output}`)
  process.exit(0)
}

console.error("Usage: kortix-oc <verify|materialize>")
process.exit(1)
