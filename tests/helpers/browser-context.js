import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");

export function createBrowserContext({ html = "<!doctype html><html lang='en'><body></body></html>", globals = {} } = {}) {
  const dom = new JSDOM(html, { url: "https://example.test" });
  const { window } = dom;

  const context = {
    window: null,
    self: null,
    globalThis: null,
    document: window.document,
    navigator: window.navigator,
    location: window.location,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Node: window.Node,
    crypto: window.crypto,
    setTimeout,
    clearTimeout,
    console,
    Promise,
    ...globals
  };

  context.window = context;
  context.self = context;
  context.globalThis = context;

  vm.createContext(context);

  return { context, window, dom };
}

export function loadScript(context, relativePath) {
  const filePath = path.resolve(projectRoot, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: filePath });
}
