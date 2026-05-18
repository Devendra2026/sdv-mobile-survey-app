/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as addressRules from "../addressRules.js";
import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as areaMasters from "../areaMasters.js";
import type * as floors from "../floors.js";
import type * as gpsAccuracy from "../gpsAccuracy.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as masters from "../masters.js";
import type * as ownerRules from "../ownerRules.js";
import type * as photos from "../photos.js";
import type * as qc from "../qc.js";
import type * as serviceMasters from "../serviceMasters.js";
import type * as surveys from "../surveys.js";
import type * as taxationMasters from "../taxationMasters.js";
import type * as tenancy from "../tenancy.js";
import type * as tenants from "../tenants.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addressRules: typeof addressRules;
  admin: typeof admin;
  analytics: typeof analytics;
  areaMasters: typeof areaMasters;
  floors: typeof floors;
  gpsAccuracy: typeof gpsAccuracy;
  helpers: typeof helpers;
  http: typeof http;
  masters: typeof masters;
  ownerRules: typeof ownerRules;
  photos: typeof photos;
  qc: typeof qc;
  serviceMasters: typeof serviceMasters;
  surveys: typeof surveys;
  taxationMasters: typeof taxationMasters;
  tenancy: typeof tenancy;
  tenants: typeof tenants;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
