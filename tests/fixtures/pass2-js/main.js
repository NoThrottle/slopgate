import { value as localValue, reservedName, CapitalName } from "./util.js";

const localCount = localValue + 1;
const obj = { reservedName: localCount };

// reservedName in comment should not be renamed
const note = "reservedName in string should stay the same";

console.log(localCount, reservedName, CapitalName, obj.reservedName, obj["reservedName"], note);
