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
import type * as allotments from "../allotments.js";
import type * as analytics from "../analytics.js";
import type * as analyticsTrends from "../analyticsTrends.js";
import type * as areaMasters from "../areaMasters.js";
import type * as audit from "../audit.js";
import type * as capabilities from "../capabilities.js";
import type * as clerk from "../clerk.js";
import type * as demandNoticeData from "../demandNoticeData.js";
import type * as demandNotices from "../demandNotices.js";
import type * as fieldAccess from "../fieldAccess.js";
import type * as floors from "../floors.js";
import type * as gpsAccuracy from "../gpsAccuracy.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as lib_auditActor from "../lib/auditActor.js";
import type * as lib_gpsValidation from "../lib/gpsValidation.js";
import type * as lib_propertyIdLookup from "../lib/propertyIdLookup.js";
import type * as lib_qcWardStats from "../lib/qcWardStats.js";
import type * as lib_surveyAggregates from "../lib/surveyAggregates.js";
import type * as lib_surveyProgress from "../lib/surveyProgress.js";
import type * as lib_surveySearch from "../lib/surveySearch.js";
import type * as lib_surveyUniqueness from "../lib/surveyUniqueness.js";
import type * as lib_surveyWardStats from "../lib/surveyWardStats.js";
import type * as masterCatalog from "../masterCatalog.js";
import type * as masters from "../masters.js";
import type * as migrations_backfillPropertyIds from "../migrations/backfillPropertyIds.js";
import type * as ownerConstants from "../ownerConstants.js";
import type * as ownerMobile from "../ownerMobile.js";
import type * as ownerRules from "../ownerRules.js";
import type * as permissionCatalog from "../permissionCatalog.js";
import type * as photos from "../photos.js";
import type * as propertyId from "../propertyId.js";
import type * as qc from "../qc.js";
import type * as rbac from "../rbac.js";
import type * as serviceMasters from "../serviceMasters.js";
import type * as survey from "../survey.js";
import type * as surveyAggregates from "../surveyAggregates.js";
import type * as surveyEditRules from "../surveyEditRules.js";
import type * as surveyExport from "../surveyExport.js";
import type * as surveyFieldValidation from "../surveyFieldValidation.js";
import type * as surveyReassignment from "../surveyReassignment.js";
import type * as surveys from "../surveys.js";
import type * as taxRates from "../taxRates.js";
import type * as taxationMasters from "../taxationMasters.js";
import type * as tenancy from "../tenancy.js";
import type * as tenants from "../tenants.js";
import type * as users from "../users.js";
import type * as webDashboard from "../webDashboard.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  addressRules: typeof addressRules;
  admin: typeof admin;
  allotments: typeof allotments;
  analytics: typeof analytics;
  analyticsTrends: typeof analyticsTrends;
  areaMasters: typeof areaMasters;
  audit: typeof audit;
  capabilities: typeof capabilities;
  clerk: typeof clerk;
  demandNoticeData: typeof demandNoticeData;
  demandNotices: typeof demandNotices;
  fieldAccess: typeof fieldAccess;
  floors: typeof floors;
  gpsAccuracy: typeof gpsAccuracy;
  helpers: typeof helpers;
  http: typeof http;
  "lib/auditActor": typeof lib_auditActor;
  "lib/gpsValidation": typeof lib_gpsValidation;
  "lib/propertyIdLookup": typeof lib_propertyIdLookup;
  "lib/qcWardStats": typeof lib_qcWardStats;
  "lib/surveyAggregates": typeof lib_surveyAggregates;
  "lib/surveyProgress": typeof lib_surveyProgress;
  "lib/surveySearch": typeof lib_surveySearch;
  "lib/surveyUniqueness": typeof lib_surveyUniqueness;
  "lib/surveyWardStats": typeof lib_surveyWardStats;
  masterCatalog: typeof masterCatalog;
  masters: typeof masters;
  "migrations/backfillPropertyIds": typeof migrations_backfillPropertyIds;
  ownerConstants: typeof ownerConstants;
  ownerMobile: typeof ownerMobile;
  ownerRules: typeof ownerRules;
  permissionCatalog: typeof permissionCatalog;
  photos: typeof photos;
  propertyId: typeof propertyId;
  qc: typeof qc;
  rbac: typeof rbac;
  serviceMasters: typeof serviceMasters;
  survey: typeof survey;
  surveyAggregates: typeof surveyAggregates;
  surveyEditRules: typeof surveyEditRules;
  surveyExport: typeof surveyExport;
  surveyFieldValidation: typeof surveyFieldValidation;
  surveyReassignment: typeof surveyReassignment;
  surveys: typeof surveys;
  taxRates: typeof taxRates;
  taxationMasters: typeof taxationMasters;
  tenancy: typeof tenancy;
  tenants: typeof tenants;
  users: typeof users;
  webDashboard: typeof webDashboard;
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
