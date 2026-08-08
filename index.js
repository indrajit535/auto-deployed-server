const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase (already added)
const supabase = createClient(
  "https://jhtuphbiequoyetntvak.supabase.co",
  "sb_publishable_9jUmex1UCcQHVne2CuuF1Q_EbUJ1zMR"
);

// 👉 Root check
app.get("/", (req, res) => {
  res.send("Server Running ✅");
});

// 👉 Auto key generator
function generateKey() {
  return "KEY-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

// 👉 Generate Key API
app.post("/generate", async (req, res) => {
  try {
    let { expiry } = req.body;

    const newKey = generateKey();

    const { data, error } = await supabase
      .from("Sddgamer")
      .insert([
        {
          key: newKey,
          expiry: expiry || 9999999999,
          status: "active",
        },
      ])
      .select();

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      key: newKey,
      data,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 👉 Check Key API
app.post("/check", async (req, res) => {
  try {
    const { key } = req.body;

    const { data, error } = await supabase
      .from("Sddgamer")
      .select("*")
      .eq("key", key)
      .single();

    if (error || !data) {
      return res.json({ valid: false });
    }

    if (data.status !== "active") {
      return res.json({ valid: false });
    }

    res.json({
      valid: true,
      data,
    });
  } catch (err) {
    res.json({ valid: false });
  }
});

// 👉 Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});