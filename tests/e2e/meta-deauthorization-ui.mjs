// Self-test de la UI real con Meta simulado, sin cuentas, secretos ni red externa.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

const bundle = await build({ bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": `${process.cwd()}/src` },
  stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {EmbeddedSignup} from "./src/components/settings/embedded-signup"; createRoot(document.getElementById("root")).render(<EmbeddedSignup/>);', resolveDir: process.cwd(), loader: "tsx" },
});
const received = [];
let fail = false;
const server = createServer(async (req, res) => {
  if (req.url === "/fixture.js") { res.setHeader("content-type", "application/javascript"); res.end(bundle.outputFiles[0].contents); return; }
  if (req.url === "/api/settings/whatsapp/embedded-config") {
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ configured: true, appId: "123", configId: "456", graphVersion: "v25.0" })); return;
  }
  if (req.url === "/api/settings/whatsapp/embedded" && req.method === "POST") {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(fail ? 422 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(fail ? { error: { message: "Meta no devolvió una identidad verificable." } } : { displayPhoneNumber: "synthetic-number" })); return;
  }
  res.setHeader("content-type", "text/html"); res.end('<!doctype html><div id="root"></div><script src="/fixture.js"></script>');
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {}) });
  const page = await browser.newPage();
  await page.route("**/*", route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.addInitScript(() => {
    window.FB = { init: options => { window.fixtureInit = options; }, login: (callback, options) => { window.fixtureLogin = { callback, options }; } };
  });
  async function open() {
    await page.goto(base);
    await page.getByRole("button", { name: "Conectar con Meta", exact: true }).click();
    assert.equal(await page.evaluate(() => window.fixtureInit.fedCM), false);
    assert.equal(await page.evaluate(() => window.fixtureLogin.options.response_type), "code");
    assert.equal(await page.evaluate(() => window.fixtureLogin.options.config_id), "456");
  }
  async function selection(origin = "https://www.facebook.com") {
    await page.evaluate(origin => window.dispatchEvent(new MessageEvent("message", { origin,
      data: JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "123", phone_number_id: "456" } }) })), origin);
  }
  async function code() { await page.evaluate(() => window.fixtureLogin.callback({ authResponse: { code: "synthetic-code-fixture", signedRequest: "synthetic-signed-proof-fixture" } })); }
  await open(); await code(); await selection();
  await page.waitForFunction(() => document.readyState === "complete");
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(received.length, 1);
  assert.deepEqual(received[0], { code: "synthetic-code-fixture", wabaId: "123", phoneNumberId: "456", signedRequest: "synthetic-signed-proof-fixture" });
  await open(); await selection(); await code();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(received.length, 2);
  await open(); await selection("https://untrusted.example.invalid"); await code();
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(received.length, 2);
  fail = true;
  await open(); await selection(); await code();
  await page.getByText("Meta no devolvió una identidad verificable.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Conectar con Meta", exact: true }).isEnabled(), true);
  console.log("PASS: UI real, ambos órdenes SDK/evento, prueba transportada, origen falso rechazado y error recuperable; sin red externa.");
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
