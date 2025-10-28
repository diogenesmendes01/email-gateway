"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrivate = getPrivate;
exports.parseJSON = parseJSON;
exports.hasKey = hasKey;
exports.isNotNull = isNotNull;
exports.isError = isError;
function getPrivate(obj, key) {
    return obj[key];
}
function parseJSON(jsonString, schema) {
    const parsed = JSON.parse(jsonString);
    return schema.parse(parsed);
}
function hasKey(obj, key) {
    return typeof obj === 'object' && obj !== null && key in obj;
}
function isNotNull(value) {
    return value !== null && value !== undefined;
}
function isError(error) {
    return error instanceof Error;
}
//# sourceMappingURL=test-utils.types.js.map