/**
 * Backward-compatible aliases — some clients still call `surveys:list`.
 * Canonical module is `survey.ts` (`api.survey.*`).
 */
export { get, getByLocalId, list, listPaginated, remove, saveDraft, setGps, submit, upsert } from "./survey";
export { importExcelBundle, listForExport } from "./surveyExport";
