const fs = require("fs");
const path = require("path");

const backendUrl = process.env.RENDER_BACKEND_URL;

if (!backendUrl) {
  console.error("ERROR: RENDER_BACKEND_URL environment variable is not set.");
  console.error("Set it to your Render backend URL (e.g. https://asset-manager-xxxx.onrender.com)");
  process.exit(1);
}

const url = backendUrl.replace(/\/+$/, "");

const redirects = [
  `/api/*  ${url}/api/:splat  200`,
  `/*  /index.html  200`,
].join("\n") + "\n";

const outDir = path.resolve(__dirname, "..", "dist", "public");
fs.writeFileSync(path.join(outDir, "_redirects"), redirects);

console.log("Generated _redirects:");
console.log(redirects);
