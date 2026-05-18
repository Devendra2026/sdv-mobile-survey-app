/**
 * Guards @expo/ngrok when the local agent dies before returning an HTTP response
 * (surfaces as: Cannot read properties of undefined (reading 'body')).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PATCH_MARKER = "// @survey-app/ngrok-client-guard";
const CLIENT_REL = "node_modules/@expo/ngrok/src/client.js";

function findNgrokClientPath(cwd = process.cwd()) {
  return join(cwd, CLIENT_REL);
}

export function getNgrokClientPath(cwd = process.cwd()) {
  return findNgrokClientPath(cwd);
}

export function patchNgrokClient(cwd = process.cwd()) {
  const path = findNgrokClientPath(cwd);
  if (!existsSync(path)) {
    throw new Error("Missing @expo/ngrok — run `bun install` first.");
  }

  let src = readFileSync(path, "utf8");
  if (src.includes(PATCH_MARKER)) {
    return false;
  }

  const requestCatch = `    } catch (error) {
      let clientError;
      try {
        const response = JSON.parse(error.response.body);
        clientError = new NgrokClientError(
          response.msg,
          error.response,
          response
        );
      } catch (e) {
        clientError = new NgrokClientError(
          error.response.body,
          error.response,
          error.response.body
        );
      }
      throw clientError;
    }`;

  const requestCatchPatched = `    } catch (error) {
      let clientError;
      const responseBody = error.response?.body;
      if (!responseBody) {
        const hint =
          process.env.NGROK_AUTHTOKEN
            ? "Ngrok agent failed before responding. Restart the dev server or run ngrok config check."
            : "Expo's shared ngrok tunnel failed. Add NGROK_AUTHTOKEN to .env.local and run: npm run dev:tunnel";
        throw new NgrokClientError(
          error.message || hint,
          error.response,
          { msg: hint }
        );
      }
      try {
        const response = JSON.parse(responseBody);
        clientError = new NgrokClientError(
          response.msg,
          error.response,
          response
        );
      } catch (e) {
        clientError = new NgrokClientError(
          responseBody,
          error.response,
          responseBody
        );
      }
      throw clientError;
    } ${PATCH_MARKER}`;

  if (!src.includes(requestCatch)) {
    throw new Error("@expo/ngrok client.js format changed — cannot apply guard patch.");
  }

  src = src.replace(requestCatch, requestCatchPatched);

  const booleanCatch = `    } catch (error) {
      const response = JSON.parse(error.response.body);
      throw new NgrokClientError(response.msg, error.response, response);
    }`;

  const booleanCatchPatched = `    } catch (error) {
      const responseBody = error.response?.body;
      if (!responseBody) {
        throw new NgrokClientError(
          error.message || "Ngrok agent failed before responding.",
          error.response,
          { msg: error.message || "Ngrok agent failed before responding." }
        );
      }
      const response = JSON.parse(responseBody);
      throw new NgrokClientError(response.msg, error.response, response);
    } ${PATCH_MARKER}`;

  if (!src.includes(booleanCatch)) {
    throw new Error("@expo/ngrok booleanRequest format changed — cannot apply guard patch.");
  }

  src = src.replace(booleanCatch, booleanCatchPatched);
  writeFileSync(path, src);
  return true;
}
