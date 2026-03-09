#!/usr/bin/env node
if (process.argv.length < 3) {
    console.log(JSON.stringify({"error": "Key argument required"}));
    process.exit(1);
}

const key = process.argv[2];
const value = process.env[key];
const found = key in process.env;

const result = {
    language: "nodejs",
    key,
    value,
    found
};

console.log(JSON.stringify(result));