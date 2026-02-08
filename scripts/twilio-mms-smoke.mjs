import assert from "node:assert/strict";

function extractTwilioInboundMedia(formData) {
  const rawNumMedia = String(formData.get("NumMedia") ?? "0").trim();
  const numMedia = Math.max(0, Math.min(10, Number.parseInt(rawNumMedia || "0", 10) || 0));

  const media = [];
  for (let i = 0; i < numMedia; i += 1) {
    const url = String(formData.get(`MediaUrl${i}`) ?? "").trim();
    const contentType = String(formData.get(`MediaContentType${i}`) ?? "").trim();
    if (!url) continue;
    media.push({ url, contentType });
  }
  return media;
}

async function main() {
  const body = new URLSearchParams({
    From: "+15551230000",
    To: "+15551239999",
    Body: "hello",
    NumMedia: "2",
    MediaUrl0: "https://example.com/0",
    MediaContentType0: "image/jpeg",
    MediaUrl1: "https://example.com/1",
    MediaContentType1: "image/png",
  });

  const req = new Request("http://localhost/twilio", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const fd = await req.formData();

  assert.equal(fd.get("From"), "+15551230000");
  assert.equal(fd.get("NumMedia"), "2");

  const media = extractTwilioInboundMedia(fd);
  assert.equal(media.length, 2);
  assert.equal(media[0].url, "https://example.com/0");
  assert.equal(media[0].contentType, "image/jpeg");
  assert.equal(media[1].url, "https://example.com/1");
  assert.equal(media[1].contentType, "image/png");

  // Ensure graceful handling when NumMedia doesn't match fields.
  const body2 = new URLSearchParams({ NumMedia: "3", MediaUrl0: "https://example.com/0" });
  const req2 = new Request("http://localhost/twilio", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body2,
  });
  const fd2 = await req2.formData();
  const media2 = extractTwilioInboundMedia(fd2);
  assert.equal(media2.length, 1);

  console.log("twilio-mms-smoke: OK");
}

main().catch((e) => {
  console.error("twilio-mms-smoke: FAIL");
  console.error(e);
  process.exit(1);
});
