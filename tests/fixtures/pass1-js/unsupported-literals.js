"use strict";
import thing from "./dep.js";
const objectValue = { "key": "value" };
const withTemplate = `name:${thing}`;
console.log(objectValue, withTemplate);
