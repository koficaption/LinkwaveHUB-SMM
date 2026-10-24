import assert from "node:assert/strict";
import test from "node:test";
import {
  korapayChargeAmount,
  korapayCheckoutError,
  korapayInitializeAttempts,
  korapayStandardCheckoutOptions,
  parseKorapayCurrencies,
} from "./korapayMarkets.js";

test("legacy all-country Korapay list becomes Ghana and Nigeria", () => {
  assert.deepEqual(
    parseKorapayCurrencies(["GHS", "NGN", "KES", "XAF", "XOF", "EGP", "TZS", "ZAR", "USD"]),
    ["GHS", "NGN"]
  );
  assert.deepEqual(parseKorapayCurrencies(["GHS", "KES"]), ["GHS", "KES"]);
  assert.deepEqual(parseKorapayCurrencies([]), ["GHS", "NGN"]);
});

test("Ghana checkout retries card and never omits channels", () => {
  const attempts = korapayInitializeAttempts("GHS", ["mobile_money"], "mobile_money");
  assert.ok(attempts.length >= 2);
  assert.ok(attempts[0].channels.includes("mobile_money"));
  assert.ok(attempts.some((item) => item.channels.length === 1 && item.channels[0] === "card"));
  assert.ok(attempts.every((item) => item.channels.length > 0));
});

test("Ghana hosted checkout offers Mobile Money and card", () => {
  const options = korapayStandardCheckoutOptions("GHS");
  assert.deepEqual(options.channels, ["mobile_money", "card"]);
  assert.equal(options.defaultChannel, undefined);
});

test("Nigeria retries card without pay_with_bank", () => {
  const attempts = korapayInitializeAttempts("NGN", ["card", "bank_transfer", "pay_with_bank"], "card");
  assert.ok(attempts.some((item) => item.channels.length === 1 && item.channels[0] === "card"));
  assert.ok(attempts.some((item) => item.channels.includes("bank_transfer") && !item.channels.includes("pay_with_bank")));
});

test("Korapay amount is a whole number", () => {
  assert.equal(korapayChargeAmount(10.24), 11);
  assert.equal(korapayChargeAmount(20), 20);
});

test("channel error is rewritten for Ghana Mobile Money", () => {
  const message = korapayCheckoutError("GHS", "you don't have any channel enabled for checkout payment.please contact support");
  assert.match(message, /Ghana/i);
  assert.match(message, /Mobile Money/i);
  assert.doesNotMatch(message, /please contact support/i);
  assert.doesNotMatch(message, /Pay from Ghana \(Mobile Money\)/);
});
