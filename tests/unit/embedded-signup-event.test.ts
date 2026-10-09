import { describe, expect, it } from "vitest";
import { parseEmbeddedSignupEvent } from "@/lib/meta/embedded-signup-event";

const finish = {
  type: "WA_EMBEDDED_SIGNUP", event: "FINISH",
  data: { waba_id: "123", phone_number_id: "456" },
};

describe("Embedded Signup: frontera de confianza del evento", () => {
  it.each(["www", "web", "business"])("acepta FINISH desde %s.facebook.com", (host) => {
    expect(parseEmbeddedSignupEvent(`https://${host}.facebook.com`, JSON.stringify(finish)))
      .toEqual({ wabaId: "123", phoneNumberId: "456" });
  });
  it.each(["https://www.facebook.com.evil.test", "https://evilfacebook.com", "http://www.facebook.com"])
    ("rechaza un origen ajeno: %s", (origin) => {
      expect(parseEmbeddedSignupEvent(origin, finish)).toBeNull();
    });
  it.each(["CANCEL", "ERROR", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"])
    ("no conecta un evento %s como un FINISH normal", (event) => {
      expect(parseEmbeddedSignupEvent("https://www.facebook.com", { ...finish, event })).toBeNull();
    });
  it.each([null, "{", { ...finish, data: { waba_id: "abc", phone_number_id: "456" } },
    { ...finish, data: { waba_id: "123", phone_number_id: 456 } }])
    ("rechaza datos incompletos o inválidos", (data) => {
      expect(parseEmbeddedSignupEvent("https://www.facebook.com", data)).toBeNull();
    });
});
