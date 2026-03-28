const payload = { routeName: "home" };
const dynamicKey = "routeName";
const routeName = payload[`${dynamicKey}`];
console.log(routeName, dynamicKey);
