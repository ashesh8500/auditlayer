await admin.from("audits").update({ status: "queued" }).eq("id", "a");
await admin.from("audits").update({ status: "blocked", admin_notes: "n" }).eq("id", "b");
await admin.from("audits").update({ status: "ready", report_path: "p" }).eq("id", "c");
