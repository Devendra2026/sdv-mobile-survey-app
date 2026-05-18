/**
 * Patches @expo/cli tunnel support:
 * - Resolve authtoken from NGROK_AUTHTOKEN or global ngrok.yml (after `ngrok config add-authtoken`)
 * - Never use Expo's shared token ("remote gone away")
 * - Safer ngrok error handling
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PATCH_MARKER = "// @survey-app/ngrok-byot-v3";

export function getAsyncNgrokPath(cwd = process.cwd()) {
  return join(cwd, "node_modules/@expo/cli/build/src/start/server/AsyncNgrok.js");
}

const RESOLVER_FN = `function _surveyAppResolveNgrokAuthtoken() {
    const fromEnv = (process.env.NGROK_AUTHTOKEN || "").trim();
    if (fromEnv) return fromEnv;
    const _fs = require("fs");
    const _os = require("os");
    const _path = require("path");
    const home = _os.homedir();
    const paths = [
        _path.join(home, "AppData", "Local", "ngrok", "ngrok.yml"),
        _path.join(home, ".config", "ngrok", "ngrok.yml"),
        _path.join(home, ".ngrok2", "ngrok.yml"),
        _path.join(home, "Library", "Application Support", "ngrok", "ngrok.yml")
    ];
    for (const file of paths){
        try {
            const text = _fs.readFileSync(file, "utf8");
            const m = text.match(/^\\s*authtoken:\\s*(\\S+)/m);
            if (m) return m[1].trim();
        } catch (_e) {}
    }
    return "";
} ${PATCH_MARKER}`;

const CONNECT_TAIL = `                onStatusChange (status) {
                    if (status === 'closed') {
                        _log.error(_chalk().default.red('Tunnel connection has been closed. This is often related to intermittent connection issues between the dev server and ngrok. Restart the dev server to try connecting to ngrok again.') + _chalk().default.gray('\\nCheck the Ngrok status page for outages: https://status.ngrok.com/'));
                    } else if (status === 'connected') {
                        _log.log('Tunnel connected.');
                    }
                },
                `;

const CONNECT_BLOCK_V3 = `            const authtoken = _surveyAppResolveNgrokAuthtoken();
            if (!authtoken) {
                throw new _errors.CommandError('NGROK_AUTHTOKEN', [
                    "Tunnel requires your own ngrok authtoken (Expo's shared tunnel is disabled).",
                    _chalk().default.yellow("1. https://dashboard.ngrok.com/get-started/your-authtoken"),
                    _chalk().default.yellow("2. ngrok config add-authtoken YOUR_TOKEN   (or NGROK_AUTHTOKEN in .env.local)"),
                    _chalk().default.yellow("3. Run: npm run dev:tunnel")
                ].join("\\n\\n"));
            }
            const url = await instance.connect({
                authtoken, ${PATCH_MARKER}
                configPath,
${CONNECT_TAIL}`;

const ASSERT_NGROK_OLD = `            const assertNgrok = ()=>{
                if ((0, _NgrokResolver.isNgrokClientError)(error)) {
                    var _error_body_details;
                    throw new _errors.CommandError('NGROK_CONNECT', [
                        error.body.msg,
                        (_error_body_details = error.body.details) == null ? void 0 : _error_body_details.err,
                        _chalk().default.gray('Check the Ngrok status page for outages: https://status.ngrok.com/')
                    ].filter(Boolean).join('\\n\\n'));
                }
                throw new _errors.CommandError('NGROK_CONNECT', error.toString() + _chalk().default.gray('\\nCheck the Ngrok status page for outages: https://status.ngrok.com/'));
            };`;

const ASSERT_NGROK_NEW = `            const assertNgrok = ()=>{
                const byotHint = !_surveyAppResolveNgrokAuthtoken()
                    ? _chalk().default.yellow('Run: ngrok config add-authtoken YOUR_TOKEN   or add NGROK_AUTHTOKEN to .env.local, then: npm run dev:tunnel')
                    : '';
                if ((0, _NgrokResolver.isNgrokClientError)(error) && error.body) {
                    var _error_body_details;
                    throw new _errors.CommandError('NGROK_CONNECT', [
                        error.body.msg,
                        (_error_body_details = error.body.details) == null ? void 0 : _error_body_details.err,
                        byotHint,
                        _chalk().default.gray('Check the Ngrok status page for outages: https://status.ngrok.com/')
                    ].filter(Boolean).join('\\n\\n'));
                }
                throw new _errors.CommandError('NGROK_CONNECT', [
                    error == null ? void 0 : error.message,
                    error == null ? void 0 : error.toString(),
                    byotHint,
                    _chalk().default.gray('Check the Ngrok status page for outages: https://status.ngrok.com/')
                ].filter(Boolean).join('\\n\\n'));
            }; ${PATCH_MARKER}`;

const RETRY_CHECK_OLD = `            if ((0, _NgrokResolver.isNgrokClientError)(error) && error.body.error_code === 103) {`;
const RETRY_CHECK_NEW = `            if ((0, _NgrokResolver.isNgrokClientError)(error) && (error.body == null ? void 0 : error.body.error_code) === 103) { ${PATCH_MARKER}`;

function injectResolverFn(src) {
  if (src.includes("_surveyAppResolveNgrokAuthtoken")) {
    return src;
  }
  const anchor = "const TUNNEL_TIMEOUT = 10 * 1000;";
  if (!src.includes(anchor)) {
    throw new Error("AsyncNgrok.js TUNNEL_TIMEOUT anchor missing — cannot inject resolver.");
  }
  return src.replace(anchor, `${anchor}\n${RESOLVER_FN}`);
}

function replaceConnectBlock(src, oldStart) {
  const startIdx = src.indexOf(oldStart);
  if (startIdx === -1) return src;
  const endIdx = src.indexOf("port: this.port", startIdx);
  if (endIdx === -1) throw new Error("AsyncNgrok.js connect block end missing.");
  const oldBlock = src.slice(startIdx, endIdx);
  return src.replace(oldBlock, CONNECT_BLOCK_V3);
}

function applyConnectBlockV3(src) {
  if (src.includes(PATCH_MARKER) && src.includes("_surveyAppResolveNgrokAuthtoken()")) {
    return src;
  }

  src = injectResolverFn(src);

  const v2Start = `            const authtoken = (process.env.NGROK_AUTHTOKEN || "").trim();
            if (!authtoken) {`;

  const v1Start = `            const urlProps = await this._getConnectionPropsAsync();
            const authtoken = process.env.NGROK_AUTHTOKEN || NGROK_CONFIG.authToken;`;

  const stockStart = `            const urlProps = await this._getConnectionPropsAsync();
            const url = await instance.connect({
                ...urlProps,
                authtoken: NGROK_CONFIG.authToken,`;

  if (src.includes(v2Start)) {
    return replaceConnectBlock(src, v2Start);
  }
  if (src.includes(v1Start)) {
    return replaceConnectBlock(src, v1Start);
  }
  if (src.includes(stockStart)) {
    return replaceConnectBlock(src, stockStart);
  }

  throw new Error("AsyncNgrok.js connect block changed — cannot apply ngrok patch.");
}

export function patchExpoNgrok(cwd = process.cwd()) {
  const path = getAsyncNgrokPath(cwd);
  if (!existsSync(path)) {
    throw new Error("Missing @expo/cli — run `bun install` first.");
  }

  let src = readFileSync(path, "utf8");
  const before = src;

  src = applyConnectBlockV3(src);

  if (src.includes(ASSERT_NGROK_OLD)) {
    src = src.replace(ASSERT_NGROK_OLD, ASSERT_NGROK_NEW);
  }

  if (src.includes(RETRY_CHECK_OLD)) {
    src = src.replace(RETRY_CHECK_OLD, RETRY_CHECK_NEW);
  }

  if (src === before) {
    return false;
  }

  writeFileSync(path, src);
  return true;
}

/** @deprecated */
export function patchExpoNgrokWithToken(_userToken, cwd = process.cwd()) {
  return patchExpoNgrok(cwd);
}
